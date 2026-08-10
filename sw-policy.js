/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Service-Worker Cache-Policy Core (Phase 4.3.2, Checkpoint 1)
 *
 * The pure, DOM-free, fetch-free, side-effect-free layer that owns two safety
 * decisions for the eventual service worker:
 *
 *   1. CACHE OWNERSHIP — which Cache Storage names belong to this app, so a
 *      future `activate` step can only ever delete OUR caches (never a
 *      third-party / workbox / malformed name).
 *   2. REQUEST ELIGIBILITY — whether a request may be served from / written to
 *      the static cache. This is an EXPLICIT ALLOWLIST with DEFAULT DENY: only a
 *      same-origin, header-clean, GET request for one of a small set of public
 *      static assets is ever cacheable. Everything else — HTML navigations,
 *      `/api/*`, Supabase, CDNs, fonts, cross-origin, auth-bearing, non-GET,
 *      and anything unlisted — is denied.
 *
 * This module has ZERO runtime effect on its own: nothing loads it yet. It is
 * consumed later by `sw.js` (via `importScripts`) and covered now by
 * `sw-policy.test.js` (via `require`). It reuses the repo's dual-export IIFE
 * convention (browser global + guarded `module.exports`), makes no network or
 * Cache Storage calls, references no service-worker globals, and never throws on
 * malformed or incomplete input (it fails closed → not cacheable / not owned).
 *
 * Exposed as `SWPolicy` on the global (browser / worker) and `module.exports`
 * (Node tests). See docs/pwa-foundation.md §"Hard constraints for future
 * service-worker work (4.3.2+)" for the constraints this encodes.
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  // ── Cache ownership ────────────────────────────────────────────────────────
  // One exact owned-cache prefix. Every cache this app creates begins with it,
  // so ownership is a precise, unambiguous string test — never a broad `mm-`.
  var CACHE_PREFIX = 'mm-static-';

  // Bump this integer whenever the cached static shell changes. It is the sole
  // input that changes CURRENT_STATIC_CACHE, giving each SW release a distinct,
  // deterministic cache name (obsolete-cache cleanup is a LATER checkpoint).
  // Phase 4.3.3 Checkpoint 5: set to 4 (Version D) so the shared branch-alias
  // preview produces genuinely different worker bytes than the already-installed
  // Version C (mm-static-v3) on the test iPhone, driving the real on-device
  // waiting-worker / update-banner / Update now / Later / one-time reload /
  // old-cache-cleanup validation. The STATIC_ALLOWLIST and all
  // privacy/classification rules are unchanged.
  var CACHE_VERSION = 4;

  // Deterministic current static cache name, e.g. "mm-static-v2".
  var CURRENT_STATIC_CACHE = CACHE_PREFIX + 'v' + CACHE_VERSION;

  // True ONLY for strings that begin with the exact `mm-static-` prefix.
  // Rejects broad `mm-`, `mm-v1`, `mm-runtime-*`, workbox / third-party names,
  // empty strings, and any non-string (null / undefined / number / object).
  function isOwnedCacheName(name) {
    if (typeof name !== 'string') return false;
    if (name.length <= CACHE_PREFIX.length) return false; // prefix alone is not an owned cache
    return name.slice(0, CACHE_PREFIX.length) === CACHE_PREFIX;
  }

  // ── Approved static allowlist ──────────────────────────────────────────────
  // The SMALLEST defensible static shell: public, per-user-identical, low-churn
  // assets whose staleness cannot break app correctness. Exact root-relative
  // pathnames only — no HTML, JS, CSS, manifest, /api, Supabase, CDN, fonts,
  // uploads, query-specific URLs, wildcards, or directory prefixes.
  // Every entry was verified to exist in the repository (Checkpoint 1 gate) and
  // is part of the approved PWA icon set (manifest icons + apple-touch-icon +
  // the implicit favicon).
  // Frozen canonical source of truth. The array is Object.freeze'd so a caller
  // holding the exported reference cannot add / remove / reorder entries.
  var STATIC_ALLOWLIST = Object.freeze([
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-maskable-192.png',
    '/icons/icon-maskable-512.png',
    '/icons/apple-touch-icon.png',
    '/favicon.ico'
  ]);

  // Private exact-match lookup DERIVED from the same canonical frozen array, so
  // the two can never drift. It is a frozen null-prototype object (a real
  // immutable representation — unlike a Set, whose contents Object.freeze cannot
  // protect) and is never exported, so eligibility decisions cannot be altered
  // by mutating anything a caller can reach.
  var STATIC_ALLOWLIST_LOOKUP = (function () {
    var lookup = Object.create(null);
    for (var i = 0; i < STATIC_ALLOWLIST.length; i++) lookup[STATIC_ALLOWLIST[i]] = true;
    return Object.freeze(lookup);
  })();

  function isAllowlistedPath(pathname) {
    // Exact, case-sensitive membership. No prefix / substring / suffix / fuzzy
    // matching — `/icons/icon-192.png.evil` or `/foo/icons/icon-192.png` fail.
    return typeof pathname === 'string' && STATIC_ALLOWLIST_LOOKUP[pathname] === true;
  }

  // Only real network schemes are ever eligible. Excludes file:, data:, blob:,
  // javascript:, and every other non-HTTP(S) scheme, independent of the
  // origin / pathname checks (defense in depth).
  function isHttpUrl(u) {
    return u.protocol === 'http:' || u.protocol === 'https:';
  }

  // ── Request eligibility (default deny) ─────────────────────────────────────
  // Returns true ONLY when EVERY condition holds:
  //   1. method is exactly GET (case-normalized for ordinary casing),
  //   2. url parses successfully (against appOrigin as base when relative),
  //   3. the parsed URL is same-origin with appOrigin,
  //   4. no Authorization header is present,
  //   5. the parsed pathname exactly matches an allowlisted asset.
  // Query strings and fragments are ignored (pathname-only comparison). Never
  // throws: malformed / missing input fails closed to `false`.
  function isCacheableRequest(input) {
    if (!input || typeof input !== 'object') return false;

    // (4) An Authorization header always disqualifies — token-bearing traffic
    // is private by definition. Checked first and strictly (must be false).
    if (input.hasAuthorizationHeader !== false) return false;

    // (1) Method must be exactly GET after trimming/upper-casing ordinary input.
    if (typeof input.method !== 'string') return false;
    if (input.method.trim().toUpperCase() !== 'GET') return false;

    // appOrigin must be a usable origin we can compare against.
    var appOrigin = input.appOrigin;
    if (typeof appOrigin !== 'string' || appOrigin.length === 0) return false;

    var base;
    try {
      base = new URL(appOrigin);
    } catch (e) {
      return false; // malformed app origin → deny
    }

    // The application origin itself must be a real HTTP(S) origin. Rejects an
    // opaque / non-network appOrigin (file:, data:, etc.) up front, so an
    // opaque origin serialized as "null" can never match a "null" request
    // origin further down.
    if (!isHttpUrl(base)) return false;

    // (2) Parse the request URL. Resolve relative URLs against appOrigin so a
    // root-relative "/favicon.ico" is judged same-origin, while an absolute
    // cross-origin URL keeps its own origin.
    var parsed;
    try {
      parsed = new URL(input.url, base);
    } catch (e) {
      return false; // malformed / missing url → deny
    }

    // The request URL must also be HTTP(S): explicitly reject file:, data:,
    // blob:, javascript:, and any other non-network scheme regardless of how
    // its origin / pathname would otherwise compare.
    if (!isHttpUrl(parsed)) return false;

    // Reject any opaque origin (serialized as the string "null") on either side.
    if (base.origin === 'null' || parsed.origin === 'null') return false;

    // (3) Same-origin only (compare the full origin: scheme + host + port).
    if (parsed.origin !== base.origin) return false;

    // (5) Exact allowlisted pathname (ignores parsed.search / parsed.hash).
    return isAllowlistedPath(parsed.pathname);
  }

  // ── Navigation detection ───────────────────────────────────────────────────
  // Classifies a request as a document navigation. Does NOT make navigations
  // cacheable — it exists so the fetch handler can route navigations to a
  // network-first / network-only path. True when request.mode === "navigate"
  // OR the Accept header contains "text/html" (case-insensitive). Fails closed
  // to false for missing / malformed input and never throws.
  function isNavigationRequest(request) {
    if (!request || typeof request !== 'object') return false;

    if (request.mode === 'navigate') return true;

    var headers = request.headers;
    if (!headers || typeof headers.get !== 'function') return false;

    var accept;
    try {
      accept = headers.get('Accept');
    } catch (e) {
      return false;
    }
    if (typeof accept !== 'string') return false;
    return accept.toLowerCase().indexOf('text/html') !== -1;
  }

  // Frozen so the exported surface (constants + function handles + the already
  // frozen STATIC_ALLOWLIST) cannot be reassigned or extended by a caller.
  var SWPolicy = Object.freeze({
    // cache ownership
    CACHE_PREFIX: CACHE_PREFIX,
    CACHE_VERSION: CACHE_VERSION,
    CURRENT_STATIC_CACHE: CURRENT_STATIC_CACHE,
    isOwnedCacheName: isOwnedCacheName,
    // allowlist
    STATIC_ALLOWLIST: STATIC_ALLOWLIST,
    isAllowlistedPath: isAllowlistedPath,
    // request eligibility
    isCacheableRequest: isCacheableRequest,
    // navigation classification
    isNavigationRequest: isNavigationRequest
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = SWPolicy;
  root.SWPolicy = SWPolicy;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this));
