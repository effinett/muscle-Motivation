'use strict';

// Phase 4.3.3 — Checkpoint 1. Exhaustive deterministic coverage for the pure
// install-eligibility core (`pwa-install.js`): platform classification,
// standalone detection, meaningful-value predicate, persistence parse/serialize,
// skip cooldown, advisory installed-state interpretation, and the composed
// computeInstallEligibility decision (reason precedence + immutability).
// Pure Node (node:test) — no DOM, no browser, no network, no packages.

const { test } = require('node:test');
const assert = require('node:assert');

const PWAInstall = require('./pwa-install.js');
const {
  PLATFORMS,
  REASONS,
  DEFAULT_SKIP_COOLDOWN_MS,
  DEFAULT_INSTALLED_ADVISORY_MS,
  SCHEMA_VERSION,
  STORAGE_KEY,
  classifyPlatform,
  isStandaloneMode,
  meaningfulValueReached,
  defaultInstallState,
  parseInstallState,
  serializeInstallState,
  isSkipCooldownActive,
  interpretInstalledState,
  computeInstallEligibility
} = PWAInstall;

// Representative user-agent strings (real-world shapes, not overfit to one).
const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipodSafari: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  ipadSafari: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  ipadOSMacStyle: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
  iosChromeCriOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1',
  androidChrome: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 13; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
  androidEdge: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 EdgA/126.0.0.0',
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  desktopEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  desktopOpera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 OPR/112.0.0.0',
  chromeOS: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  legacyEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/18.17763',
  desktopSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
  desktopFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0'
};

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1700000000000; // fixed reference epoch for determinism

// ════════════════════════════════════════════════════════════════════════════
// Exports & constants
// ════════════════════════════════════════════════════════════════════════════

test('exports: constants have expected stable values', () => {
  assert.strictEqual(SCHEMA_VERSION, 1);
  assert.strictEqual(STORAGE_KEY, 'mm_pwa_install_state');
  assert.strictEqual(DEFAULT_SKIP_COOLDOWN_MS, 30 * DAY);
  assert.strictEqual(DEFAULT_INSTALLED_ADVISORY_MS, 90 * DAY);
});

test('exports: PLATFORMS and REASONS are frozen with expected members', () => {
  assert.ok(Object.isFrozen(PLATFORMS));
  assert.ok(Object.isFrozen(REASONS));
  assert.deepStrictEqual(
    [PLATFORMS.IOS_SAFARI, PLATFORMS.ANDROID_CHROME, PLATFORMS.DESKTOP_CHROMIUM, PLATFORMS.OTHER],
    ['ios-safari', 'android-chrome', 'desktop-chromium', 'other']
  );
  assert.strictEqual(REASONS.ELIGIBLE, 'eligible');
  assert.strictEqual(REASONS.INVALID_INPUT, 'invalid-input');
  assert.strictEqual(REASONS.STANDALONE, 'standalone');
  assert.strictEqual(REASONS.INSTALLED, 'installed');
  assert.strictEqual(REASONS.UNSUPPORTED_PLATFORM, 'unsupported-platform');
  assert.strictEqual(REASONS.MEANINGFUL_VALUE_NOT_REACHED, 'meaningful-value-not-reached');
  assert.strictEqual(REASONS.SKIPPED_COOLDOWN, 'skipped-cooldown');
  assert.strictEqual(REASONS.SESSION_SUPPRESSED, 'session-suppressed');
  assert.strictEqual(REASONS.SHOW_CAP_REACHED, 'show-cap-reached');
});

test('exports: the public module surface is frozen', () => {
  assert.ok(Object.isFrozen(PWAInstall));
});

// ════════════════════════════════════════════════════════════════════════════
// Platform classification
// ════════════════════════════════════════════════════════════════════════════

test('platform: iPhone Safari → ios-safari', () => {
  assert.strictEqual(classifyPlatform({ userAgent: UA.iphoneSafari }), PLATFORMS.IOS_SAFARI);
});

test('platform: iPod → ios-safari', () => {
  assert.strictEqual(classifyPlatform({ userAgent: UA.ipodSafari }), PLATFORMS.IOS_SAFARI);
});

test('platform: iPad Safari → ios-safari', () => {
  assert.strictEqual(classifyPlatform({ userAgent: UA.ipadSafari, maxTouchPoints: 5 }), PLATFORMS.IOS_SAFARI);
});

test('platform: iPadOS desktop-style Macintosh UA WITH touch → ios-safari', () => {
  assert.strictEqual(classifyPlatform({ userAgent: UA.ipadOSMacStyle, maxTouchPoints: 5 }), PLATFORMS.IOS_SAFARI);
});

test('platform: real Mac (Macintosh UA, no touch) is NOT ios-safari', () => {
  // Desktop Safari on a real Mac → other (no Chromium token, maxTouchPoints 0).
  assert.strictEqual(classifyPlatform({ userAgent: UA.desktopSafari, maxTouchPoints: 0 }), PLATFORMS.OTHER);
});

test('platform: Macintosh UA with maxTouchPoints === 1 is NOT treated as iPadOS', () => {
  // Boundary: require > 1. A single touch point does not flip a Mac to iOS.
  assert.strictEqual(classifyPlatform({ userAgent: UA.desktopSafari, maxTouchPoints: 1 }), PLATFORMS.OTHER);
});

test('platform: iOS Chrome (CriOS) on iPhone UA → ios-safari (not chromium)', () => {
  assert.strictEqual(classifyPlatform({ userAgent: UA.iosChromeCriOS }), PLATFORMS.IOS_SAFARI);
});

test('platform: Android Chrome → android-chrome', () => {
  assert.strictEqual(classifyPlatform({ userAgent: UA.androidChrome }), PLATFORMS.ANDROID_CHROME);
});

test('platform: Android Edge (EdgA, Chromium) → android-chrome', () => {
  assert.strictEqual(classifyPlatform({ userAgent: UA.androidEdge }), PLATFORMS.ANDROID_CHROME);
});

test('platform: Android Firefox (non-Chromium) → other', () => {
  assert.strictEqual(classifyPlatform({ userAgent: UA.androidFirefox }), PLATFORMS.OTHER);
});

test('platform: desktop Chrome → desktop-chromium', () => {
  assert.strictEqual(classifyPlatform({ userAgent: UA.desktopChrome, maxTouchPoints: 0 }), PLATFORMS.DESKTOP_CHROMIUM);
});

test('platform: modern desktop Edge (Edg) → desktop-chromium', () => {
  assert.strictEqual(classifyPlatform({ userAgent: UA.desktopEdge }), PLATFORMS.DESKTOP_CHROMIUM);
});

test('platform: desktop Opera (OPR) → desktop-chromium', () => {
  assert.strictEqual(classifyPlatform({ userAgent: UA.desktopOpera }), PLATFORMS.DESKTOP_CHROMIUM);
});

test('platform: ChromeOS → desktop-chromium', () => {
  assert.strictEqual(classifyPlatform({ userAgent: UA.chromeOS }), PLATFORMS.DESKTOP_CHROMIUM);
});

test('platform: legacy EdgeHTML (imitates Chrome token) → other', () => {
  // The imitator case: UA carries "Chrome/64" but "Edge/18" marks it non-Chromium.
  assert.strictEqual(classifyPlatform({ userAgent: UA.legacyEdge }), PLATFORMS.OTHER);
});

test('platform: desktop Safari → other', () => {
  assert.strictEqual(classifyPlatform({ userAgent: UA.desktopSafari, maxTouchPoints: 0 }), PLATFORMS.OTHER);
});

test('platform: desktop Firefox → other', () => {
  assert.strictEqual(classifyPlatform({ userAgent: UA.desktopFirefox }), PLATFORMS.OTHER);
});

test('platform: missing / malformed env → other (fails safe)', () => {
  assert.strictEqual(classifyPlatform(undefined), PLATFORMS.OTHER);
  assert.strictEqual(classifyPlatform(null), PLATFORMS.OTHER);
  assert.strictEqual(classifyPlatform({}), PLATFORMS.OTHER);
  assert.strictEqual(classifyPlatform({ userAgent: '' }), PLATFORMS.OTHER);
  assert.strictEqual(classifyPlatform({ userAgent: 123 }), PLATFORMS.OTHER);
  assert.strictEqual(classifyPlatform('not-an-object'), PLATFORMS.OTHER);
});

test('platform: non-finite maxTouchPoints does not falsely trigger iPadOS', () => {
  assert.strictEqual(classifyPlatform({ userAgent: UA.desktopSafari, maxTouchPoints: NaN }), PLATFORMS.OTHER);
  assert.strictEqual(classifyPlatform({ userAgent: UA.desktopSafari, maxTouchPoints: '5' }), PLATFORMS.OTHER);
});

// ════════════════════════════════════════════════════════════════════════════
// Standalone detection
// ════════════════════════════════════════════════════════════════════════════

test('standalone: displayModeStandalone true → true', () => {
  assert.strictEqual(isStandaloneMode({ displayModeStandalone: true }), true);
});

test('standalone: displayModeFullscreen true → true (installed-like)', () => {
  assert.strictEqual(isStandaloneMode({ displayModeFullscreen: true }), true);
});

test('standalone: iOS navigatorStandalone true → true', () => {
  assert.strictEqual(isStandaloneMode({ navigatorStandalone: true }), true);
});

test('standalone: normal browser tab (all false) → false', () => {
  assert.strictEqual(isStandaloneMode({
    displayModeStandalone: false,
    displayModeFullscreen: false,
    navigatorStandalone: false
  }), false);
});

test('standalone: missing / malformed signals → false', () => {
  assert.strictEqual(isStandaloneMode(undefined), false);
  assert.strictEqual(isStandaloneMode(null), false);
  assert.strictEqual(isStandaloneMode({}), false);
  assert.strictEqual(isStandaloneMode('x'), false);
});

test('standalone: only strict boolean true counts (truthy non-true ignored)', () => {
  assert.strictEqual(isStandaloneMode({ displayModeStandalone: 1 }), false);
  assert.strictEqual(isStandaloneMode({ navigatorStandalone: 'yes' }), false);
});

test('standalone: conflicting values — any true wins', () => {
  assert.strictEqual(isStandaloneMode({ displayModeStandalone: false, navigatorStandalone: true }), true);
});

// ════════════════════════════════════════════════════════════════════════════
// Meaningful value
// ════════════════════════════════════════════════════════════════════════════

test('value: no signals → false', () => {
  assert.strictEqual(meaningfulValueReached({}), false);
  assert.strictEqual(meaningfulValueReached(undefined), false);
  assert.strictEqual(meaningfulValueReached(null), false);
});

test('value: onboarding complete ONLY → false (dashboard not reached, no action)', () => {
  assert.strictEqual(meaningfulValueReached({ onboardingComplete: true }), false);
});

test('value: onboarding complete + personalized dashboard → true (Path A)', () => {
  assert.strictEqual(
    meaningfulValueReached({ onboardingComplete: true, reachedPersonalizedDashboard: true }),
    true
  );
});

test('value: dashboard reached but onboarding NOT complete → false (Path A requires both)', () => {
  assert.strictEqual(meaningfulValueReached({ reachedPersonalizedDashboard: true }), false);
});

test('value: completed workout → true (Path B, independent of onboarding)', () => {
  assert.strictEqual(meaningfulValueReached({ completedWorkout: true }), true);
});

test('value: logged food → true (Path B)', () => {
  assert.strictEqual(meaningfulValueReached({ loggedFood: true }), true);
});

test('value: logged weight → true (Path B)', () => {
  assert.strictEqual(meaningfulValueReached({ loggedWeight: true }), true);
});

test('value: future explicitly-approved action flag → true (extensibility)', () => {
  assert.strictEqual(meaningfulValueReached({ meaningfulActionCompleted: true }), true);
});

test('value: multiple signals → true', () => {
  assert.strictEqual(
    meaningfulValueReached({ onboardingComplete: true, reachedPersonalizedDashboard: true, loggedFood: true }),
    true
  );
});

test('value: malformed values (non-true) → false', () => {
  assert.strictEqual(meaningfulValueReached({ completedWorkout: 'yes', loggedFood: 1, loggedWeight: {} }), false);
});

// ════════════════════════════════════════════════════════════════════════════
// Persistence parsing / serialization
// ════════════════════════════════════════════════════════════════════════════

test('state: defaultInstallState has the canonical shape', () => {
  assert.deepStrictEqual(defaultInstallState(), {
    schemaVersion: 1,
    lastShownAt: null,
    lastSkippedAt: null,
    lastAcceptedAt: null,
    installedObservedAt: null,
    showCount: 0
  });
});

test('state: missing / non-string raw → defaults', () => {
  assert.deepStrictEqual(parseInstallState(undefined), defaultInstallState());
  assert.deepStrictEqual(parseInstallState(null), defaultInstallState());
  assert.deepStrictEqual(parseInstallState(42), defaultInstallState());
});

test('state: empty string → defaults', () => {
  assert.deepStrictEqual(parseInstallState(''), defaultInstallState());
});

test('state: valid current-schema JSON round-trips', () => {
  const raw = JSON.stringify({
    schemaVersion: 1,
    lastShownAt: NOW - DAY,
    lastSkippedAt: NOW - 2 * DAY,
    lastAcceptedAt: NOW - 3 * DAY,
    installedObservedAt: NOW - 4 * DAY,
    showCount: 3
  });
  const parsed = parseInstallState(raw, { now: NOW });
  assert.deepStrictEqual(parsed, {
    schemaVersion: 1,
    lastShownAt: NOW - DAY,
    lastSkippedAt: NOW - 2 * DAY,
    lastAcceptedAt: NOW - 3 * DAY,
    installedObservedAt: NOW - 4 * DAY,
    showCount: 3
  });
});

test('state: malformed JSON → defaults (never throws)', () => {
  assert.deepStrictEqual(parseInstallState('{not json', { now: NOW }), defaultInstallState());
  assert.deepStrictEqual(parseInstallState('[1,2,3]', { now: NOW }), defaultInstallState()); // array → not a state object
  assert.deepStrictEqual(parseInstallState('"a string"', { now: NOW }), defaultInstallState());
  assert.deepStrictEqual(parseInstallState('null', { now: NOW }), defaultInstallState());
});

test('state: wrong property types are sanitized', () => {
  const raw = JSON.stringify({
    schemaVersion: 1,
    lastShownAt: 'yesterday',
    lastSkippedAt: true,
    lastAcceptedAt: {},
    installedObservedAt: [],
    showCount: 'lots'
  });
  assert.deepStrictEqual(parseInstallState(raw, { now: NOW }), defaultInstallState());
});

test('state: invalid timestamps (<=0, NaN, Infinity) → null', () => {
  const raw = JSON.stringify({
    schemaVersion: 1,
    lastShownAt: 0,
    lastSkippedAt: -5,
    lastAcceptedAt: null,
    installedObservedAt: 1e18, // beyond MAX_TIMESTAMP → impossible
    showCount: -3
  });
  const parsed = parseInstallState(raw, { now: NOW });
  assert.strictEqual(parsed.lastShownAt, null);
  assert.strictEqual(parsed.lastSkippedAt, null);
  assert.strictEqual(parsed.installedObservedAt, null);
  assert.strictEqual(parsed.showCount, 0);
});

test('state: future timestamps are dropped when now is provided', () => {
  const raw = JSON.stringify({ schemaVersion: 1, lastSkippedAt: NOW + DAY, lastShownAt: NOW + 5 });
  const parsed = parseInstallState(raw, { now: NOW });
  assert.strictEqual(parsed.lastSkippedAt, null);
  assert.strictEqual(parsed.lastShownAt, null);
});

test('state: without now, structurally-valid future timestamps are preserved', () => {
  const raw = JSON.stringify({ schemaVersion: 1, lastSkippedAt: NOW + DAY });
  const parsed = parseInstallState(raw); // no now → no temporal drop, only structural
  assert.strictEqual(parsed.lastSkippedAt, NOW + DAY);
});

test('state: unknown extra properties do not break evaluation', () => {
  const raw = JSON.stringify({ schemaVersion: 1, showCount: 2, foo: 'bar', nested: { a: 1 }, userId: 'secret' });
  const parsed = parseInstallState(raw, { now: NOW });
  assert.strictEqual(parsed.showCount, 2);
  assert.strictEqual(parsed.foo, undefined);
  assert.strictEqual(parsed.userId, undefined);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(parsed, 'nested'), false);
});

test('state: unsupported FUTURE schema version → safe defaults', () => {
  const raw = JSON.stringify({ schemaVersion: 999, lastSkippedAt: NOW - DAY, showCount: 9 });
  assert.deepStrictEqual(parseInstallState(raw, { now: NOW }), defaultInstallState());
});

test('state: fractional timestamps are floored to integers', () => {
  const raw = JSON.stringify({ schemaVersion: 1, lastShownAt: (NOW - DAY) + 0.9 });
  const parsed = parseInstallState(raw, { now: NOW });
  assert.strictEqual(parsed.lastShownAt, NOW - DAY);
});

test('state: showCount above the clamp is bounded', () => {
  const raw = JSON.stringify({ schemaVersion: 1, showCount: 5e9 });
  const parsed = parseInstallState(raw, { now: NOW });
  assert.strictEqual(parsed.showCount, 1000000);
});

test('state: mutation isolation — defaults are fresh, unshared objects', () => {
  const a = defaultInstallState();
  const b = defaultInstallState();
  assert.notStrictEqual(a, b);
  a.showCount = 99;
  a.lastShownAt = NOW;
  assert.strictEqual(b.showCount, 0);
  assert.strictEqual(b.lastShownAt, null);
  assert.strictEqual(defaultInstallState().showCount, 0);
});

test('state: parse returns fresh objects (independent instances)', () => {
  const raw = JSON.stringify({ schemaVersion: 1, showCount: 1 });
  const a = parseInstallState(raw, { now: NOW });
  const b = parseInstallState(raw, { now: NOW });
  assert.notStrictEqual(a, b);
  a.showCount = 50;
  assert.strictEqual(b.showCount, 1);
});

test('serialize: emits only known fields, dropping unknowns; round-trips', () => {
  const state = Object.assign(defaultInstallState(), {
    lastSkippedAt: NOW - DAY,
    showCount: 4,
    secret: 'nope',
    email: 'user@example.com'
  });
  const str = serializeInstallState(state);
  const obj = JSON.parse(str);
  assert.deepStrictEqual(Object.keys(obj).sort(), [
    'installedObservedAt', 'lastAcceptedAt', 'lastShownAt', 'lastSkippedAt', 'schemaVersion', 'showCount'
  ]);
  assert.strictEqual(obj.secret, undefined);
  assert.strictEqual(obj.email, undefined);
  assert.strictEqual(obj.lastSkippedAt, NOW - DAY);
  // Round-trips back through parse.
  assert.deepStrictEqual(parseInstallState(str, { now: NOW }), {
    schemaVersion: 1,
    lastShownAt: null,
    lastSkippedAt: NOW - DAY,
    lastAcceptedAt: null,
    installedObservedAt: null,
    showCount: 4
  });
});

test('serialize: malformed / missing input yields default-state JSON, never throws', () => {
  assert.deepStrictEqual(JSON.parse(serializeInstallState(undefined)), defaultInstallState());
  assert.deepStrictEqual(JSON.parse(serializeInstallState('garbage')), defaultInstallState());
  assert.deepStrictEqual(JSON.parse(serializeInstallState(42)), defaultInstallState());
});

test('serialize: does not mutate its input object', () => {
  const state = defaultInstallState();
  const snapshot = JSON.stringify(state);
  serializeInstallState(state);
  assert.strictEqual(JSON.stringify(state), snapshot);
});

// ════════════════════════════════════════════════════════════════════════════
// Cooldown
// ════════════════════════════════════════════════════════════════════════════

test('cooldown: never skipped → not active', () => {
  assert.strictEqual(isSkipCooldownActive({ lastSkippedAt: null, now: NOW }), false);
  assert.strictEqual(isSkipCooldownActive({ now: NOW }), false);
});

test('cooldown: recent skip within window → active', () => {
  assert.strictEqual(isSkipCooldownActive({ lastSkippedAt: NOW - DAY, now: NOW }), true);
});

test('cooldown: exact expiry boundary → NOT active (elapsed === duration is expired)', () => {
  assert.strictEqual(
    isSkipCooldownActive({ lastSkippedAt: NOW - DEFAULT_SKIP_COOLDOWN_MS, now: NOW }),
    false
  );
});

test('cooldown: one ms before boundary → active', () => {
  assert.strictEqual(
    isSkipCooldownActive({ lastSkippedAt: NOW - DEFAULT_SKIP_COOLDOWN_MS + 1, now: NOW }),
    true
  );
});

test('cooldown: expired skip (older than window) → not active', () => {
  assert.strictEqual(
    isSkipCooldownActive({ lastSkippedAt: NOW - 31 * DAY, now: NOW }),
    false
  );
});

test('cooldown: future or invalid skip timestamp → not active (sanitized)', () => {
  assert.strictEqual(isSkipCooldownActive({ lastSkippedAt: NOW + DAY, now: NOW }), false);
  assert.strictEqual(isSkipCooldownActive({ lastSkippedAt: 'soon', now: NOW }), false);
  assert.strictEqual(isSkipCooldownActive({ lastSkippedAt: -1, now: NOW }), false);
});

test('cooldown: invalid now → not active (fails safe, no crash)', () => {
  assert.strictEqual(isSkipCooldownActive({ lastSkippedAt: NOW - DAY, now: NaN }), false);
  assert.strictEqual(isSkipCooldownActive({ lastSkippedAt: NOW - DAY }), false);
  assert.strictEqual(isSkipCooldownActive(undefined), false);
});

test('cooldown: injected custom duration is honored', () => {
  const sevenDays = 7 * DAY;
  assert.strictEqual(isSkipCooldownActive({ lastSkippedAt: NOW - 5 * DAY, now: NOW, cooldownMs: sevenDays }), true);
  assert.strictEqual(isSkipCooldownActive({ lastSkippedAt: NOW - 8 * DAY, now: NOW, cooldownMs: sevenDays }), false);
});

test('cooldown: zero duration → never active (even at the exact skip moment)', () => {
  assert.strictEqual(isSkipCooldownActive({ lastSkippedAt: NOW, now: NOW, cooldownMs: 0 }), false);
  assert.strictEqual(isSkipCooldownActive({ lastSkippedAt: NOW - 1, now: NOW, cooldownMs: 0 }), false);
});

test('cooldown: invalid duration falls back to the default window', () => {
  assert.strictEqual(isSkipCooldownActive({ lastSkippedAt: NOW - DAY, now: NOW, cooldownMs: -100 }), true);
  assert.strictEqual(isSkipCooldownActive({ lastSkippedAt: NOW - DAY, now: NOW, cooldownMs: NaN }), true);
  assert.strictEqual(isSkipCooldownActive({ lastSkippedAt: NOW - DAY, now: NOW, cooldownMs: 'week' }), true);
});

// ════════════════════════════════════════════════════════════════════════════
// Installed-state interpretation
// ════════════════════════════════════════════════════════════════════════════

test('installed: live standalone → suppress (true)', () => {
  assert.strictEqual(interpretInstalledState({ standalone: true, now: NOW }), true);
});

test('installed: current-session appinstalled → suppress (true)', () => {
  assert.strictEqual(interpretInstalledState({ sessionAppInstalled: true, now: NOW }), true);
});

test('installed: recent persisted observation within advisory window → suppress', () => {
  assert.strictEqual(
    interpretInstalledState({ installedObservedAt: NOW - 10 * DAY, now: NOW }),
    true
  );
});

test('installed: expired advisory observation → do not suppress', () => {
  assert.strictEqual(
    interpretInstalledState({ installedObservedAt: NOW - DEFAULT_INSTALLED_ADVISORY_MS - 1, now: NOW }),
    false
  );
});

test('installed: advisory exact boundary → do not suppress (exclusive)', () => {
  assert.strictEqual(
    interpretInstalledState({ installedObservedAt: NOW - DEFAULT_INSTALLED_ADVISORY_MS, now: NOW }),
    false
  );
});

test('installed: live evidence NOT installed overrides an advisory persisted flag', () => {
  assert.strictEqual(
    interpretInstalledState({
      installedObservedAt: NOW - DAY, // would otherwise suppress
      liveEvidenceNotInstalled: true,
      now: NOW
    }),
    false
  );
});

test('installed: standalone still wins even with liveEvidenceNotInstalled set', () => {
  // Contradictory input: standalone true is authoritative and checked first.
  assert.strictEqual(
    interpretInstalledState({ standalone: true, liveEvidenceNotInstalled: true, now: NOW }),
    true
  );
});

test('installed: advisory disabled (advisoryMs <= 0) → persisted flag never suppresses', () => {
  assert.strictEqual(
    interpretInstalledState({ installedObservedAt: NOW - DAY, advisoryMs: 0, now: NOW }),
    false
  );
});

test('installed: custom advisory window is honored', () => {
  const week = 7 * DAY;
  assert.strictEqual(interpretInstalledState({ installedObservedAt: NOW - 3 * DAY, advisoryMs: week, now: NOW }), true);
  assert.strictEqual(interpretInstalledState({ installedObservedAt: NOW - 10 * DAY, advisoryMs: week, now: NOW }), false);
});

test('installed: malformed / missing installed state → do not suppress', () => {
  assert.strictEqual(interpretInstalledState({}), false);
  assert.strictEqual(interpretInstalledState(undefined), false);
  assert.strictEqual(interpretInstalledState({ installedObservedAt: 'x', now: NOW }), false);
  assert.strictEqual(interpretInstalledState({ installedObservedAt: NOW + DAY, now: NOW }), false); // future → ignored
  assert.strictEqual(interpretInstalledState({ installedObservedAt: NOW - DAY, now: NaN }), false); // bad now
});

// ════════════════════════════════════════════════════════════════════════════
// Composed eligibility — helpers + precedence
// ════════════════════════════════════════════════════════════════════════════

// A baseline ELIGIBLE input: supported platform, meaningful value, browser tab,
// no cooldown, not installed, valid clock.
function eligibleInput(overrides) {
  const base = {
    now: NOW,
    env: { userAgent: UA.androidChrome },
    standaloneSignals: { displayModeStandalone: false, navigatorStandalone: false },
    valueSignals: { loggedFood: true },
    state: defaultInstallState(),
    sessionAppInstalled: false,
    liveEvidenceNotInstalled: false,
    sessionSuppressed: false,
    config: {}
  };
  return Object.assign(base, overrides || {});
}

test('eligibility: baseline eligible Android case', () => {
  const r = computeInstallEligibility(eligibleInput());
  assert.strictEqual(r.eligible, true);
  assert.strictEqual(r.reason, REASONS.ELIGIBLE);
  assert.strictEqual(r.platform, PLATFORMS.ANDROID_CHROME);
  assert.strictEqual(r.standalone, false);
  assert.strictEqual(r.meaningfulValueReached, true);
  assert.strictEqual(r.cooldownActive, false);
  assert.strictEqual(r.installed, false);
});

test('eligibility: eligible iOS case (Path A value)', () => {
  const r = computeInstallEligibility(eligibleInput({
    env: { userAgent: UA.iphoneSafari },
    valueSignals: { onboardingComplete: true, reachedPersonalizedDashboard: true }
  }));
  assert.strictEqual(r.eligible, true);
  assert.strictEqual(r.reason, REASONS.ELIGIBLE);
  assert.strictEqual(r.platform, PLATFORMS.IOS_SAFARI);
});

test('eligibility: eligible desktop Chromium case', () => {
  const r = computeInstallEligibility(eligibleInput({
    env: { userAgent: UA.desktopChrome, maxTouchPoints: 0 },
    valueSignals: { completedWorkout: true }
  }));
  assert.strictEqual(r.eligible, true);
  assert.strictEqual(r.platform, PLATFORMS.DESKTOP_CHROMIUM);
});

test('eligibility: result shape has exactly the documented fields', () => {
  const r = computeInstallEligibility(eligibleInput());
  assert.deepStrictEqual(Object.keys(r).sort(), [
    'cooldownActive', 'eligible', 'installed', 'meaningfulValueReached', 'platform', 'reason', 'standalone'
  ]);
});

test('eligibility: result reason is always a known REASONS value', () => {
  const known = Object.keys(REASONS).map((k) => REASONS[k]);
  const r = computeInstallEligibility(eligibleInput());
  assert.ok(known.indexOf(r.reason) !== -1);
});

// ── Individual suppression reasons ──────────────────────────────────────────

test('eligibility: invalid input (non-object) → invalid-input', () => {
  const r = computeInstallEligibility(undefined);
  assert.strictEqual(r.eligible, false);
  assert.strictEqual(r.reason, REASONS.INVALID_INPUT);
});

test('eligibility: invalid now → invalid-input', () => {
  const r = computeInstallEligibility(eligibleInput({ now: NaN }));
  assert.strictEqual(r.eligible, false);
  assert.strictEqual(r.reason, REASONS.INVALID_INPUT);
  const r2 = computeInstallEligibility(eligibleInput({ now: 'today' }));
  assert.strictEqual(r2.reason, REASONS.INVALID_INPUT);
});

test('eligibility: standalone → standalone (never eligible while installed-like)', () => {
  const r = computeInstallEligibility(eligibleInput({
    standaloneSignals: { displayModeStandalone: true }
  }));
  assert.strictEqual(r.eligible, false);
  assert.strictEqual(r.reason, REASONS.STANDALONE);
  assert.strictEqual(r.standalone, true);
  assert.strictEqual(r.installed, true);
});

test('eligibility: session appinstalled → installed', () => {
  const r = computeInstallEligibility(eligibleInput({ sessionAppInstalled: true }));
  assert.strictEqual(r.eligible, false);
  assert.strictEqual(r.reason, REASONS.INSTALLED);
  assert.strictEqual(r.installed, true);
});

test('eligibility: advisory persisted install observation → installed', () => {
  const r = computeInstallEligibility(eligibleInput({
    state: Object.assign(defaultInstallState(), { installedObservedAt: NOW - DAY })
  }));
  assert.strictEqual(r.reason, REASONS.INSTALLED);
});

test('eligibility: unsupported platform → unsupported-platform', () => {
  const r = computeInstallEligibility(eligibleInput({ env: { userAgent: UA.desktopFirefox } }));
  assert.strictEqual(r.eligible, false);
  assert.strictEqual(r.reason, REASONS.UNSUPPORTED_PLATFORM);
  assert.strictEqual(r.platform, PLATFORMS.OTHER);
});

test('eligibility: supported platform but no meaningful value → meaningful-value-not-reached', () => {
  const r = computeInstallEligibility(eligibleInput({ valueSignals: { onboardingComplete: true } }));
  assert.strictEqual(r.eligible, false);
  assert.strictEqual(r.reason, REASONS.MEANINGFUL_VALUE_NOT_REACHED);
  assert.strictEqual(r.meaningfulValueReached, false);
});

test('eligibility: active skip cooldown → skipped-cooldown', () => {
  const r = computeInstallEligibility(eligibleInput({
    state: Object.assign(defaultInstallState(), { lastSkippedAt: NOW - DAY })
  }));
  assert.strictEqual(r.eligible, false);
  assert.strictEqual(r.reason, REASONS.SKIPPED_COOLDOWN);
  assert.strictEqual(r.cooldownActive, true);
});

test('eligibility: session-suppressed → session-suppressed', () => {
  const r = computeInstallEligibility(eligibleInput({ sessionSuppressed: true }));
  assert.strictEqual(r.eligible, false);
  assert.strictEqual(r.reason, REASONS.SESSION_SUPPRESSED);
});

// ── Show-cap (opt-in, disabled by default) ──────────────────────────────────

test('eligibility: show-cap disabled by default — high showCount stays eligible', () => {
  const r = computeInstallEligibility(eligibleInput({
    state: Object.assign(defaultInstallState(), { showCount: 9999 })
  }));
  assert.strictEqual(r.eligible, true, 'no permanent lifetime cap exists by default');
  assert.strictEqual(r.reason, REASONS.ELIGIBLE);
});

test('eligibility: show-cap engaged only when config.showCap > 0', () => {
  const r = computeInstallEligibility(eligibleInput({
    state: Object.assign(defaultInstallState(), { showCount: 3 }),
    config: { showCap: 3 }
  }));
  assert.strictEqual(r.eligible, false);
  assert.strictEqual(r.reason, REASONS.SHOW_CAP_REACHED);
});

test('eligibility: below an engaged show-cap remains eligible', () => {
  const r = computeInstallEligibility(eligibleInput({
    state: Object.assign(defaultInstallState(), { showCount: 2 }),
    config: { showCap: 3 }
  }));
  assert.strictEqual(r.eligible, true);
  assert.strictEqual(r.reason, REASONS.ELIGIBLE);
});

// ── Reason precedence ───────────────────────────────────────────────────────

test('precedence: invalid-input beats standalone', () => {
  const r = computeInstallEligibility(eligibleInput({
    now: NaN,
    standaloneSignals: { displayModeStandalone: true }
  }));
  assert.strictEqual(r.reason, REASONS.INVALID_INPUT);
});

test('precedence: standalone beats installed', () => {
  const r = computeInstallEligibility(eligibleInput({
    standaloneSignals: { displayModeStandalone: true },
    sessionAppInstalled: true
  }));
  assert.strictEqual(r.reason, REASONS.STANDALONE);
});

test('precedence: installed beats unsupported-platform', () => {
  const r = computeInstallEligibility(eligibleInput({
    env: { userAgent: UA.desktopFirefox },
    sessionAppInstalled: true
  }));
  assert.strictEqual(r.reason, REASONS.INSTALLED);
});

test('precedence: unsupported-platform beats meaningful-value', () => {
  const r = computeInstallEligibility(eligibleInput({
    env: { userAgent: UA.desktopFirefox },
    valueSignals: {}
  }));
  assert.strictEqual(r.reason, REASONS.UNSUPPORTED_PLATFORM);
});

test('precedence: meaningful-value beats cooldown', () => {
  const r = computeInstallEligibility(eligibleInput({
    valueSignals: {},
    state: Object.assign(defaultInstallState(), { lastSkippedAt: NOW - DAY })
  }));
  assert.strictEqual(r.reason, REASONS.MEANINGFUL_VALUE_NOT_REACHED);
});

test('precedence: cooldown beats session-suppressed', () => {
  const r = computeInstallEligibility(eligibleInput({
    state: Object.assign(defaultInstallState(), { lastSkippedAt: NOW - DAY }),
    sessionSuppressed: true
  }));
  assert.strictEqual(r.reason, REASONS.SKIPPED_COOLDOWN);
});

test('precedence: cooldown beats show-cap (when cap engaged)', () => {
  const r = computeInstallEligibility(eligibleInput({
    state: Object.assign(defaultInstallState(), { lastSkippedAt: NOW - DAY, showCount: 5 }),
    config: { showCap: 3 }
  }));
  assert.strictEqual(r.reason, REASONS.SKIPPED_COOLDOWN);
});

test('precedence: show-cap beats session-suppressed (when cap engaged)', () => {
  const r = computeInstallEligibility(eligibleInput({
    state: Object.assign(defaultInstallState(), { showCount: 5 }),
    config: { showCap: 3 },
    sessionSuppressed: true
  }));
  assert.strictEqual(r.reason, REASONS.SHOW_CAP_REACHED);
});

// ── State can be provided as a raw string ───────────────────────────────────

test('eligibility: accepts state as a raw localStorage string', () => {
  const raw = serializeInstallState(Object.assign(defaultInstallState(), { lastSkippedAt: NOW - DAY }));
  const r = computeInstallEligibility(eligibleInput({ state: raw }));
  assert.strictEqual(r.reason, REASONS.SKIPPED_COOLDOWN);
});

test('eligibility: malformed state string degrades to safe defaults (still evaluable)', () => {
  const r = computeInstallEligibility(eligibleInput({ state: '{corrupt' }));
  assert.strictEqual(r.eligible, true); // defaults → no skip, no install → eligible
  assert.strictEqual(r.reason, REASONS.ELIGIBLE);
});

test('eligibility: missing state → treated as fresh defaults', () => {
  const input = eligibleInput();
  delete input.state;
  const r = computeInstallEligibility(input);
  assert.strictEqual(r.eligible, true);
});

// ── Determinism & immutability ──────────────────────────────────────────────

test('determinism: repeated calls with identical input return identical results', () => {
  const input = eligibleInput({ state: Object.assign(defaultInstallState(), { lastSkippedAt: NOW - DAY }) });
  const a = computeInstallEligibility(input);
  const b = computeInstallEligibility(input);
  assert.deepStrictEqual(a, b);
});

test('immutability: computeInstallEligibility does not mutate its input', () => {
  const input = eligibleInput({
    state: Object.assign(defaultInstallState(), { lastSkippedAt: NOW - DAY, showCount: 2 })
  });
  const snapshot = JSON.stringify(input);
  computeInstallEligibility(input);
  assert.strictEqual(JSON.stringify(input), snapshot);
});

test('immutability: nested input sub-objects are not mutated', () => {
  const env = { userAgent: UA.androidChrome, maxTouchPoints: 0 };
  const valueSignals = { loggedFood: true };
  const state = defaultInstallState();
  computeInstallEligibility(eligibleInput({ env, valueSignals, state }));
  assert.deepStrictEqual(env, { userAgent: UA.androidChrome, maxTouchPoints: 0 });
  assert.deepStrictEqual(valueSignals, { loggedFood: true });
  assert.deepStrictEqual(state, defaultInstallState());
});

// ════════════════════════════════════════════════════════════════════════════
// Security & privacy assertions
// ════════════════════════════════════════════════════════════════════════════

test('privacy: serialized state contains no user-content keys', () => {
  const str = serializeInstallState(Object.assign(defaultInstallState(), {
    userId: 'u1', email: 'a@b.c', token: 'secret', workouts: [1, 2, 3]
  }));
  const forbidden = ['userId', 'email', 'token', 'workouts', 'nutrition', 'weight', 'onboarding'];
  const obj = JSON.parse(str);
  for (const k of forbidden) assert.strictEqual(obj[k], undefined, `must not persist ${k}`);
});

test('privacy: eligibility result exposes no user content', () => {
  const r = computeInstallEligibility(eligibleInput());
  const keys = Object.keys(r);
  for (const k of keys) {
    assert.ok(
      ['eligible', 'reason', 'platform', 'standalone', 'meaningfulValueReached', 'cooldownActive', 'installed'].indexOf(k) !== -1,
      `unexpected result key ${k}`
    );
  }
});

test('purity: module source references no browser globals or side-effecting APIs', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(require('node:path').join(__dirname, 'pwa-install.js'), 'utf8');
  // Strip the doc header/comments so prose mentions do not trip the guard.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '');
  for (const forbidden of [
    'document', 'localStorage', 'sessionStorage', 'matchMedia', 'setTimeout',
    'setInterval', 'addEventListener', 'fetch(', 'XMLHttpRequest', 'beforeinstallprompt',
    'caches', 'navigator.'
  ]) {
    assert.strictEqual(code.indexOf(forbidden), -1, `must not reference ${forbidden}`);
  }
});

test('purity: requiring the module has no side effects beyond defining exports', () => {
  // Re-require from cache returns the same frozen object; no throw, no globals set.
  const again = require('./pwa-install.js');
  assert.strictEqual(again, PWAInstall);
});
