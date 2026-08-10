/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Shared Install-Eligibility Core
 * (Phase 4.3.3, Checkpoint 1)
 *
 * The pure, DOM-free, fetch-free, listener-free, side-effect-free decision layer
 * that later determines whether the app MAY show install onboarding. It owns four
 * deterministic decisions over INJECTED signals only:
 *
 *   1. PLATFORM CLASSIFICATION — ios-safari / android-chrome / desktop-chromium /
 *      other, from an injected environment snapshot (never reading globals).
 *   2. STANDALONE DETECTION — is the app running installed-like, from injected
 *      display-mode / iOS navigator.standalone signals (never calling matchMedia).
 *   3. MEANINGFUL-VALUE — has the user experienced real product value yet.
 *   4. ELIGIBILITY — the single composed decision, with a deterministic reason.
 *
 * Plus a small versioned localStorage STATE MODEL with pure parse/serialize
 * helpers, a configurable skip COOLDOWN, and an advisory INSTALLED interpretation.
 *
 * This module has ZERO runtime effect on its own: nothing loads it yet. The UI
 * (Checkpoint 2) and the browser wiring — beforeinstallprompt / appinstalled /
 * matchMedia / localStorage reads (Checkpoint 3) — live in separate files. Here
 * there is NO window / document / navigator / localStorage / timer / event /
 * network / service-worker / install-prompt access whatsoever, and no import-time
 * side effect. Every browser read is injected; every clock is injected.
 *
 * It reuses the repo's dual-export IIFE convention (browser/worker global +
 * guarded module.exports) and Object.freeze discipline (see sw-policy.js), but is
 * intentionally DECOUPLED from service-worker cache policy — install eligibility
 * and cache policy are separate concerns.
 *
 * Privacy: this module stores and returns NO user content — no user id, email,
 * account data, workout/nutrition/body data, onboarding answers, Supabase tokens,
 * or prompt event objects. The persisted state is device-local, non-sensitive
 * timestamps + a counter only.
 *
 * Exposed as `PWAInstall` on the global and `module.exports` (Node tests).
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  // ── Versioning & storage identity ──────────────────────────────────────────
  var SCHEMA_VERSION = 1;
  // One versioned JSON object (not many loose keys), mirroring the repo's tidy
  // single-namespace convention. Written/read by Checkpoint 3, never here.
  var STORAGE_KEY = 'mm_pwa_install_state';

  // ── Configurable durations (explicit defaults with rationale) ──────────────
  // Skip cooldown: after "Skip for now", stay silent for this long. 30 days is a
  // deliberately long, non-nagging window — a user who declined once should not
  // be asked again for a month, but the offer is NOT suppressed forever.
  var DEFAULT_SKIP_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  // Installed advisory window: a PERSISTED "we saw it installed" observation is
  // treated as advisory evidence for this long, then EXPIRES. It is never
  // permanent, because localStorage survives uninstalling the PWA — after the
  // window we re-offer rather than suppress a user who has since uninstalled.
  var DEFAULT_INSTALLED_ADVISORY_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

  // Structural sanitizer bounds. A timestamp above ~year 3000 is "impossible" and
  // ignored; show-count is clamped so a corrupt huge value can never matter.
  var MAX_TIMESTAMP = 32503680000000; // ~3000-01-01T00:00:00Z in ms
  var MAX_SHOW_COUNT = 1000000;

  // ── Frozen enums ───────────────────────────────────────────────────────────
  var PLATFORMS = Object.freeze({
    IOS_SAFARI: 'ios-safari',
    ANDROID_CHROME: 'android-chrome',
    DESKTOP_CHROMIUM: 'desktop-chromium',
    OTHER: 'other'
  });

  // Stable, machine-readable reason codes. `show-cap-reached` exists only for the
  // opt-in, default-disabled show-count limit (see computeInstallEligibility); it
  // never fires in the default configuration.
  var REASONS = Object.freeze({
    ELIGIBLE: 'eligible',
    INVALID_INPUT: 'invalid-input',
    STANDALONE: 'standalone',
    INSTALLED: 'installed',
    UNSUPPORTED_PLATFORM: 'unsupported-platform',
    MEANINGFUL_VALUE_NOT_REACHED: 'meaningful-value-not-reached',
    SKIPPED_COOLDOWN: 'skipped-cooldown',
    SHOW_CAP_REACHED: 'show-cap-reached',
    SESSION_SUPPRESSED: 'session-suppressed'
  });

  // ── Tiny internal sanitizers (pure) ────────────────────────────────────────
  function isFiniteNumber(n) {
    return typeof n === 'number' && isFinite(n);
  }

  // A usable duration is a finite number >= 0; anything else falls back to the
  // provided default. Zero is a VALID duration (an instantly-expired window).
  function resolveDuration(ms, fallback) {
    return (isFiniteNumber(ms) && ms >= 0) ? ms : fallback;
  }

  // Structural + (optional) temporal timestamp sanitizer. Returns a positive
  // integer ms epoch, or null. Drops non-numbers, NaN/Infinity, <= 0, absurdly
  // large values, and — when `now` is provided — any timestamp recorded in the
  // future (impossible: you cannot have skipped/installed later than "now").
  function sanitizeTimestamp(value, now) {
    if (!isFiniteNumber(value)) return null;
    var v = Math.floor(value);
    if (v <= 0) return null;
    if (v > MAX_TIMESTAMP) return null;
    if (isFiniteNumber(now) && v > now) return null; // future → impossible → ignore
    return v;
  }

  function sanitizeShowCount(value) {
    if (!isFiniteNumber(value)) return 0;
    var v = Math.floor(value);
    if (v <= 0) return 0;
    if (v > MAX_SHOW_COUNT) return MAX_SHOW_COUNT;
    return v;
  }

  // ── Platform classification ────────────────────────────────────────────────
  // Chromium-family engine detection from a UA string. Legacy EdgeHTML is the
  // canonical imitator: its UA carries a `Chrome/<v>` token yet is NOT Chromium,
  // so it is excluded explicitly. Modern Edge (`Edg/`, `EdgA/`), Opera (`OPR/`),
  // and generic `Chrome/`/`Chromium/` are Chromium. `CriOS/` (iOS Chrome) is
  // matched too but iOS is classified first, so it never reaches here.
  function isChromiumFamily(ua) {
    if (typeof ua !== 'string' || !ua) return false;
    if (/Edge\//.test(ua)) return false; // legacy EdgeHTML — imitates Chrome, not Chromium
    return /(?:Chrome|Chromium|CriOS|Edg|EdgA|OPR)\//.test(ua);
  }

  // Deterministic platform classification over an injected environment snapshot:
  //   env = { userAgent:string, maxTouchPoints?:number, ... }
  // Order matters: iOS (incl. iPadOS masquerading as Macintosh with touch) is
  // decided before generic desktop/Android so an iOS in-app Chrome (CriOS) is
  // ios-safari, not chromium. Missing/malformed env → 'other' (fails safe).
  function classifyPlatform(env) {
    if (!env || typeof env !== 'object') return PLATFORMS.OTHER;
    var ua = typeof env.userAgent === 'string' ? env.userAgent : '';
    if (!ua) return PLATFORMS.OTHER;
    var mtp = isFiniteNumber(env.maxTouchPoints) ? env.maxTouchPoints : 0;

    // iOS device families.
    if (/iPhone|iPod/.test(ua)) return PLATFORMS.IOS_SAFARI;
    if (/iPad/.test(ua)) return PLATFORMS.IOS_SAFARI;
    // iPadOS 13+ reports a Macintosh-style UA but exposes multi-touch; a real Mac
    // reports maxTouchPoints 0. Require > 1 to avoid false positives.
    if (/Macintosh/.test(ua) && mtp > 1) return PLATFORMS.IOS_SAFARI;

    var chromium = isChromiumFamily(ua);

    // Android: only a Chromium-family engine is a supported install surface;
    // Android Firefox/other → other.
    if (/Android/.test(ua)) return chromium ? PLATFORMS.ANDROID_CHROME : PLATFORMS.OTHER;

    // Desktop (Windows / Mac-without-touch / Linux / ChromeOS): Chromium-family
    // installs via beforeinstallprompt; everything else (Firefox, desktop Safari,
    // legacy Edge, unknown) → other.
    if (chromium) return PLATFORMS.DESKTOP_CHROMIUM;
    return PLATFORMS.OTHER;
  }

  // ── Standalone detection (pure) ────────────────────────────────────────────
  // Decides installed-like running mode from INJECTED signals only. Never calls
  // matchMedia or reads navigator — Checkpoint 3 supplies these booleans:
  //   { displayModeStandalone?, displayModeFullscreen?, navigatorStandalone? }
  // Only a strict `true` counts; missing/false/conflicting non-true values are
  // treated as not-standalone. `displayModeFullscreen` is intentionally treated
  // as installed-like (a fullscreen-launched installed app).
  function isStandaloneMode(signals) {
    if (!signals || typeof signals !== 'object') return false;
    if (signals.displayModeStandalone === true) return true;
    if (signals.displayModeFullscreen === true) return true;
    if (signals.navigatorStandalone === true) return true; // iOS Safari home-screen
    return false;
  }

  // ── Meaningful-value predicate (pure) ──────────────────────────────────────
  // True once the user has experienced real product value. EITHER approved path
  // qualifies independently — never require both:
  //   Path A: onboarding complete AND the personalized dashboard was reached.
  //   Path B: any first meaningful action — completed workout, logged food, or
  //           logged weight (or a future explicitly-approved action flag).
  // Only strict `true` signals count; malformed values are ignored.
  function meaningfulValueReached(signals) {
    if (!signals || typeof signals !== 'object') return false;
    // Path A — dashboard after onboarding.
    if (signals.onboardingComplete === true && signals.reachedPersonalizedDashboard === true) return true;
    // Path B — a first meaningful action.
    if (signals.completedWorkout === true) return true;
    if (signals.loggedFood === true) return true;
    if (signals.loggedWeight === true) return true;
    // Extensibility seam for a future explicitly-approved meaningful action.
    if (signals.meaningfulActionCompleted === true) return true;
    return false;
  }

  // ── Persistence state model (pure) ─────────────────────────────────────────
  // Fresh defaults on every call — no shared mutable object is ever exposed.
  function defaultInstallState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      lastShownAt: null,
      lastSkippedAt: null,
      lastAcceptedAt: null,
      installedObservedAt: null,
      showCount: 0
    };
  }

  // Normalize an untrusted parsed object into the canonical current-schema shape.
  // A schemaVersion strictly greater than ours is an unknown FUTURE shape → we
  // return safe defaults rather than trust unknown fields. Unknown extra
  // properties are simply not read. `now`, when finite, drops future timestamps.
  function normalizeState(obj, now) {
    var d = defaultInstallState();
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return d;
    var v = obj.schemaVersion;
    if (isFiniteNumber(v) && v > SCHEMA_VERSION) return d; // future schema → fail safe
    d.schemaVersion = SCHEMA_VERSION;
    d.lastShownAt = sanitizeTimestamp(obj.lastShownAt, now);
    d.lastSkippedAt = sanitizeTimestamp(obj.lastSkippedAt, now);
    d.lastAcceptedAt = sanitizeTimestamp(obj.lastAcceptedAt, now);
    d.installedObservedAt = sanitizeTimestamp(obj.installedObservedAt, now);
    d.showCount = sanitizeShowCount(obj.showCount);
    return d;
  }

  // Parse a raw localStorage string into a sanitized state object. Missing/empty
  // input, malformed JSON, non-object/array JSON, wrong types, and impossible
  // timestamps all degrade to safe defaults; never throws.
  //   opts.now (optional finite) enables future-timestamp dropping.
  function parseInstallState(raw, opts) {
    opts = opts || {};
    var now = isFiniteNumber(opts.now) ? opts.now : undefined;
    if (typeof raw !== 'string' || raw.length === 0) return defaultInstallState();
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return defaultInstallState(); }
    return normalizeState(parsed, now);
  }

  // Serialize a state object to a canonical JSON string containing ONLY the known
  // fields (unknown props are dropped). Structural sanitize on the way out; never
  // throws. No `now` is applied so a caller-set legitimate timestamp is preserved.
  function serializeInstallState(state) {
    var n = normalizeState(state, undefined);
    try {
      return JSON.stringify({
        schemaVersion: n.schemaVersion,
        lastShownAt: n.lastShownAt,
        lastSkippedAt: n.lastSkippedAt,
        lastAcceptedAt: n.lastAcceptedAt,
        installedObservedAt: n.installedObservedAt,
        showCount: n.showCount
      });
    } catch (e) {
      return JSON.stringify(defaultInstallState());
    }
  }

  // ── Skip cooldown (pure, injected clock) ───────────────────────────────────
  // True while a recent "Skip for now" is still within the cooldown window.
  //   args = { lastSkippedAt, now, cooldownMs? }
  // No skip / invalid or future skip / invalid now → not active. Boundary is
  // exclusive: elapsed === cooldownMs is EXPIRED (not active). A zero-duration
  // cooldown is never active. Invalid cooldownMs falls back to the default.
  function isSkipCooldownActive(args) {
    args = args || {};
    var now = args.now;
    if (!isFiniteNumber(now)) return false;
    var cd = resolveDuration(args.cooldownMs, DEFAULT_SKIP_COOLDOWN_MS);
    var skipped = sanitizeTimestamp(args.lastSkippedAt, now); // drops future/invalid
    if (skipped == null) return false;
    var elapsed = now - skipped;
    if (elapsed < 0) return false; // defensive; sanitize already dropped future
    return elapsed < cd;
  }

  // ── Installed-state interpretation (pure, advisory) ────────────────────────
  // Should install onboarding be suppressed because the app is / was installed?
  //   args = { standalone, sessionAppInstalled, installedObservedAt, now,
  //            advisoryMs?, liveEvidenceNotInstalled? }
  // Precedence:
  //   1. live standalone            → suppress (authoritative)
  //   2. current-session appinstalled → suppress
  //   3. live evidence NOT installed  → do NOT suppress (overrides advisory)
  //   4. persisted observation within the advisory window → suppress (advisory)
  //   5. otherwise                    → do not suppress
  // The persisted flag is ADVISORY: it expires after advisoryMs and yields to
  // live counter-evidence, so it can never suppress forever (accounts for the
  // user uninstalling the PWA while localStorage persists). advisoryMs <= 0
  // disables the advisory entirely.
  function interpretInstalledState(args) {
    args = args || {};
    if (args.standalone === true) return true;
    if (args.sessionAppInstalled === true) return true;
    if (args.liveEvidenceNotInstalled === true) return false;
    var advisory = resolveDuration(args.advisoryMs, DEFAULT_INSTALLED_ADVISORY_MS);
    if (advisory <= 0) return false; // advisory disabled
    var now = args.now;
    if (!isFiniteNumber(now)) return false;
    var observed = sanitizeTimestamp(args.installedObservedAt, now);
    if (observed == null) return false;
    return (now - observed) < advisory;
  }

  // ── Composed eligibility decision (pure) ───────────────────────────────────
  // The single decision function. Returns a structured, machine-readable result
  // (never just a boolean) and NEVER mutates `input`.
  //
  //   input = {
  //     now: number (finite ms epoch — required; invalid → invalid-input),
  //     env: { userAgent, maxTouchPoints, ... },
  //     standaloneSignals: { displayModeStandalone, displayModeFullscreen, navigatorStandalone },
  //     valueSignals: { onboardingComplete, reachedPersonalizedDashboard,
  //                     completedWorkout, loggedFood, loggedWeight, ... },
  //     state: parsed state object OR raw localStorage string OR undefined,
  //     sessionAppInstalled: boolean,        // this-session appinstalled event
  //     liveEvidenceNotInstalled: boolean,   // live proof it is NOT installed now
  //     sessionSuppressed: boolean,          // caller-injected "not right now"
  //     config: { skipCooldownMs?, installedAdvisoryMs?, showCap? }  // showCap default 0 = disabled
  //   }
  //
  // Reason precedence (explicit, deterministic):
  //   1. invalid-input      (input not an object, or now not finite)
  //   2. standalone         (live standalone — always wins)
  //   3. installed          (session appinstalled OR advisory persisted observation)
  //   4. unsupported-platform
  //   5. meaningful-value-not-reached
  //   6. skipped-cooldown
  //   7. show-cap-reached   (ONLY when config.showCap > 0; disabled by default)
  //   8. session-suppressed
  //   9. eligible
  //
  // With the default config (showCap 0) step 7 never fires, so the effective
  // precedence collapses to the approved 1..8 (…skipped-cooldown → session-
  // suppressed → eligible), and no permanent lifetime suppression cap exists.
  function computeInstallEligibility(input) {
    var invalid = false;
    if (!input || typeof input !== 'object') { input = {}; invalid = true; }

    var now = input.now;
    if (!isFiniteNumber(now)) invalid = true;
    var validNow = isFiniteNumber(now) ? now : undefined;

    var cfg = (input.config && typeof input.config === 'object') ? input.config : {};
    var showCap = (isFiniteNumber(cfg.showCap) && cfg.showCap > 0) ? Math.floor(cfg.showCap) : 0;

    var platform = classifyPlatform(input.env);
    var standalone = isStandaloneMode(input.standaloneSignals);

    // Resolve state from an object, a raw string, or nothing → sanitized defaults.
    var state = (typeof input.state === 'string')
      ? parseInstallState(input.state, { now: validNow })
      : normalizeState(input.state, validNow);

    var meaningful = meaningfulValueReached(input.valueSignals);

    // "installed" for the reason code excludes live standalone (that has its own
    // higher-precedence reason); overall `installed` in the result folds both.
    var sessionOrPersistedInstalled = interpretInstalledState({
      standalone: false,
      sessionAppInstalled: input.sessionAppInstalled === true,
      installedObservedAt: state.installedObservedAt,
      now: validNow,
      advisoryMs: cfg.installedAdvisoryMs,
      liveEvidenceNotInstalled: input.liveEvidenceNotInstalled === true
    });
    var installed = standalone || sessionOrPersistedInstalled;

    var cooldownActive = isSkipCooldownActive({
      lastSkippedAt: state.lastSkippedAt,
      now: validNow,
      cooldownMs: cfg.skipCooldownMs
    });

    var sessionSuppressed = input.sessionSuppressed === true;
    var showCapReached = showCap > 0 && state.showCount >= showCap;

    var reason;
    var eligible = false;
    if (invalid) reason = REASONS.INVALID_INPUT;
    else if (standalone) reason = REASONS.STANDALONE;
    else if (sessionOrPersistedInstalled) reason = REASONS.INSTALLED;
    else if (platform === PLATFORMS.OTHER) reason = REASONS.UNSUPPORTED_PLATFORM;
    else if (!meaningful) reason = REASONS.MEANINGFUL_VALUE_NOT_REACHED;
    else if (cooldownActive) reason = REASONS.SKIPPED_COOLDOWN;
    else if (showCapReached) reason = REASONS.SHOW_CAP_REACHED;
    else if (sessionSuppressed) reason = REASONS.SESSION_SUPPRESSED;
    else { reason = REASONS.ELIGIBLE; eligible = true; }

    return {
      eligible: eligible,
      reason: reason,
      platform: platform,
      standalone: standalone,
      meaningfulValueReached: meaningful,
      cooldownActive: cooldownActive,
      installed: installed
    };
  }

  // Frozen public surface (constants + pure functions), consistent with
  // sw-policy.js. No import-time side effects beyond defining this object.
  var PWAInstall = Object.freeze({
    // versioning / storage identity
    SCHEMA_VERSION: SCHEMA_VERSION,
    STORAGE_KEY: STORAGE_KEY,
    // configurable defaults
    DEFAULT_SKIP_COOLDOWN_MS: DEFAULT_SKIP_COOLDOWN_MS,
    DEFAULT_INSTALLED_ADVISORY_MS: DEFAULT_INSTALLED_ADVISORY_MS,
    // enums
    PLATFORMS: PLATFORMS,
    REASONS: REASONS,
    // decisions
    classifyPlatform: classifyPlatform,
    isStandaloneMode: isStandaloneMode,
    meaningfulValueReached: meaningfulValueReached,
    // persistence
    defaultInstallState: defaultInstallState,
    parseInstallState: parseInstallState,
    serializeInstallState: serializeInstallState,
    // policies
    isSkipCooldownActive: isSkipCooldownActive,
    interpretInstalledState: interpretInstalledState,
    // composed
    computeInstallEligibility: computeInstallEligibility
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = PWAInstall;
  root.PWAInstall = PWAInstall;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this));
