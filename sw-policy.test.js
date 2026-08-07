'use strict';

// Phase 4.3.2 — Checkpoint 1. Unit coverage for the pure service-worker
// cache-policy core (`sw-policy.js`): cache ownership, the approved static
// allowlist, default-deny request eligibility, and navigation classification.
// Pure Node (node:test) — no DOM, no browser, no network, no packages.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SWPolicy = require('./sw-policy.js');
const ROOT = __dirname;

const APP = 'https://muscle-motivation.example';
const SUPABASE = 'https://igzvphmhyrdjjvzbxnuh.supabase.co';

// Minimal Headers-like stub with ordinary case-insensitive get().
function headers(map) {
  const store = {};
  for (const k of Object.keys(map || {})) store[k.toLowerCase()] = map[k];
  return {
    get(name) {
      if (typeof name !== 'string') return null;
      const v = store[name.toLowerCase()];
      return v === undefined ? null : v;
    }
  };
}

// ── Cache constants and ownership ────────────────────────────────────────────

test('cache: CURRENT_STATIC_CACHE is deterministic and prefix+version derived', () => {
  assert.strictEqual(SWPolicy.CACHE_PREFIX, 'mm-static-');
  assert.strictEqual(typeof SWPolicy.CACHE_VERSION, 'number');
  assert.strictEqual(
    SWPolicy.CURRENT_STATIC_CACHE,
    SWPolicy.CACHE_PREFIX + 'v' + SWPolicy.CACHE_VERSION
  );
});

test('cache: current cache name begins with mm-static-', () => {
  assert.ok(SWPolicy.CURRENT_STATIC_CACHE.startsWith('mm-static-'));
});

test('cache: a different version would produce a different cache name', () => {
  // Re-derive with a hypothetical bumped version using the exposed prefix.
  const v1 = SWPolicy.CACHE_PREFIX + 'v' + SWPolicy.CACHE_VERSION;
  const v2 = SWPolicy.CACHE_PREFIX + 'v' + (SWPolicy.CACHE_VERSION + 1);
  assert.strictEqual(v1, SWPolicy.CURRENT_STATIC_CACHE);
  assert.notStrictEqual(v1, v2);
});

test('cache: isOwnedCacheName accepts mm-static-* names', () => {
  assert.strictEqual(SWPolicy.isOwnedCacheName('mm-static-v1'), true);
  assert.strictEqual(SWPolicy.isOwnedCacheName('mm-static-v2'), true);
  assert.strictEqual(SWPolicy.isOwnedCacheName('mm-static-legacy'), true);
  assert.strictEqual(SWPolicy.isOwnedCacheName(SWPolicy.CURRENT_STATIC_CACHE), true);
});

test('cache: isOwnedCacheName rejects non-owned / broad / malformed names', () => {
  assert.strictEqual(SWPolicy.isOwnedCacheName('mm-runtime-v1'), false);
  assert.strictEqual(SWPolicy.isOwnedCacheName('mm-v1'), false);
  assert.strictEqual(SWPolicy.isOwnedCacheName('mm-'), false);
  assert.strictEqual(SWPolicy.isOwnedCacheName('mm-static-'), false); // prefix alone is not a cache
  assert.strictEqual(SWPolicy.isOwnedCacheName('workbox-precache-v2'), false);
  assert.strictEqual(SWPolicy.isOwnedCacheName('other-mm-static-v1'), false); // prefix must be at start
  assert.strictEqual(SWPolicy.isOwnedCacheName(''), false);
  assert.strictEqual(SWPolicy.isOwnedCacheName(null), false);
  assert.strictEqual(SWPolicy.isOwnedCacheName(undefined), false);
  assert.strictEqual(SWPolicy.isOwnedCacheName(123), false);
  assert.strictEqual(SWPolicy.isOwnedCacheName({}), false);
  assert.strictEqual(SWPolicy.isOwnedCacheName(['mm-static-v1']), false);
});

// ── Allowlist integrity ──────────────────────────────────────────────────────

const EXPECTED_ALLOWLIST = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/favicon.ico'
];

test('allowlist: exactly the approved paths, no more no less', () => {
  assert.deepStrictEqual(
    [...SWPolicy.STATIC_ALLOWLIST].sort(),
    [...EXPECTED_ALLOWLIST].sort()
  );
});

test('allowlist: no duplicate entries', () => {
  const seen = new Set(SWPolicy.STATIC_ALLOWLIST);
  assert.strictEqual(seen.size, SWPolicy.STATIC_ALLOWLIST.length);
});

test('allowlist: every entry is a root-relative pathname (starts with /)', () => {
  for (const p of SWPolicy.STATIC_ALLOWLIST) {
    assert.strictEqual(typeof p, 'string');
    assert.ok(p.startsWith('/'), `${p} is root-relative`);
  }
});

test('allowlist: no forbidden token appears in any entry', () => {
  const forbidden = ['/api/', '.html', '.js', '.css', 'supabase', 'http://', 'https://', '*'];
  for (const p of SWPolicy.STATIC_ALLOWLIST) {
    for (const bad of forbidden) {
      assert.ok(!p.includes(bad), `${p} must not contain "${bad}"`);
    }
  }
});

test('allowlist: every allowlisted asset exists in the repository', () => {
  for (const p of SWPolicy.STATIC_ALLOWLIST) {
    const rel = p.replace(/^\//, '');
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${p} exists on disk`);
  }
});

test('allowlist: no directory-prefix or wildcard matching is possible', () => {
  // A path under an allowlisted directory must NOT be treated as allowlisted.
  assert.strictEqual(SWPolicy.isAllowlistedPath('/icons/'), false);
  assert.strictEqual(SWPolicy.isAllowlistedPath('/icons/other.png'), false);
  assert.strictEqual(SWPolicy.isAllowlistedPath('/icons/icon-192.png/extra'), false);
  assert.strictEqual(SWPolicy.isAllowlistedPath('/favicon.ico/'), false);
  // Exact members do match.
  for (const p of SWPolicy.STATIC_ALLOWLIST) {
    assert.strictEqual(SWPolicy.isAllowlistedPath(p), true, `${p} matches exactly`);
  }
});

// ── Cacheable requests: positive ─────────────────────────────────────────────

test('cacheable: same-origin allowlisted icon GET, no auth header', () => {
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: '/icons/icon-192.png', method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), true);
});

test('cacheable: absolute same-origin URL for an allowlisted asset', () => {
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: APP + '/favicon.ico', method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), true);
});

test('cacheable: allowlisted asset with a query string (query ignored)', () => {
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: '/icons/icon-512.png?v=3', method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), true);
});

test('cacheable: allowlisted asset with a fragment (fragment ignored)', () => {
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: '/icons/apple-touch-icon.png#x', method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), true);
});

test('cacheable: ordinary lowercase "get" method is normalized', () => {
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: '/favicon.ico', method: 'get', appOrigin: APP, hasAuthorizationHeader: false
  }), true);
});

// ── Cacheable requests: negative (default deny) ──────────────────────────────

test('deny: first-party API routes are never cacheable', () => {
  for (const p of ['/api/usda-search', '/api/ai-food-parse', '/api/create-checkout-session',
                   '/api/usda-food', '/api/usda-barcode', '/api/customer-portal']) {
    assert.strictEqual(SWPolicy.isCacheableRequest({
      url: p, method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
    }), false, `${p} denied`);
  }
});

test('deny: HTML navigations are never cacheable', () => {
  for (const p of ['/app.html', '/nutrition.html', '/workout.html', '/index.html', '/']) {
    assert.strictEqual(SWPolicy.isCacheableRequest({
      url: p, method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
    }), false, `${p} denied`);
  }
});

test('deny: unlisted same-origin assets (js/css/logo/manifest)', () => {
  for (const p of ['/food-core.js', '/nutrition.js', '/safe-area.css', '/manifest.webmanifest',
                   '/logo.png', '/logow.png', '/icons/icon-96.png']) {
    assert.strictEqual(SWPolicy.isCacheableRequest({
      url: p, method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
    }), false, `${p} denied`);
  }
});

test('deny: Supabase REST and auth URLs (cross-origin)', () => {
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: SUPABASE + '/rest/v1/nutrition_logs', method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), false);
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: SUPABASE + '/auth/v1/token', method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), false);
});

test('deny: CDN script and Google Fonts URLs (cross-origin)', () => {
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.0/dist/umd/supabase.js',
    method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), false);
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: 'https://unpkg.com/lucide@1.23.0/dist/umd/lucide.min.js',
    method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), false);
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: 'https://fonts.googleapis.com/css2?family=Bebas+Neue',
    method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), false);
});

test('deny: cross-origin URL with an allowlisted-looking pathname', () => {
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: 'https://evil.example/favicon.ico', method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), false);
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: 'https://evil.example/icons/icon-192.png', method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), false);
});

test('deny: non-GET methods for an allowlisted path', () => {
  for (const m of ['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
    assert.strictEqual(SWPolicy.isCacheableRequest({
      url: '/favicon.ico', method: m, appOrigin: APP, hasAuthorizationHeader: false
    }), false, `${m} denied`);
  }
});

test('deny: authorization-bearing GET for an allowlisted path', () => {
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: '/favicon.ico', method: 'GET', appOrigin: APP, hasAuthorizationHeader: true
  }), false);
});

test('deny: missing hasAuthorizationHeader is treated as unsafe (must be exactly false)', () => {
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: '/favicon.ico', method: 'GET', appOrigin: APP
  }), false);
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: '/favicon.ico', method: 'GET', appOrigin: APP, hasAuthorizationHeader: undefined
  }), false);
  // Truthy non-boolean also denied.
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: '/favicon.ico', method: 'GET', appOrigin: APP, hasAuthorizationHeader: 'no'
  }), false);
});

test('deny: malformed url, malformed app origin, and missing url', () => {
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: 'ht!tp://[bad', method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), false);
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: '/favicon.ico', method: 'GET', appOrigin: 'not a url', hasAuthorizationHeader: false
  }), false);
  assert.strictEqual(SWPolicy.isCacheableRequest({
    method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), false);
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: '/favicon.ico', method: 'GET', appOrigin: '', hasAuthorizationHeader: false
  }), false);
});

test('deny: case-mismatched pathname (comparison is case-sensitive)', () => {
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: '/Favicon.ico', method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), false);
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: '/icons/ICON-192.png', method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), false);
});

test('deny: directory-prefix / filename-suffix / substring lookalikes', () => {
  for (const p of ['/favicon.ico.map', '/favicon.icon', '/icons/icon-192.png.bak',
                   '/nested/favicon.ico', '/icons/icon-192.png/x', '/xfavicon.ico']) {
    assert.strictEqual(SWPolicy.isCacheableRequest({
      url: p, method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
    }), false, `${p} denied`);
  }
});

test('deny: unknown / empty / non-object input defaults to false, never throws', () => {
  assert.strictEqual(SWPolicy.isCacheableRequest(undefined), false);
  assert.strictEqual(SWPolicy.isCacheableRequest(null), false);
  assert.strictEqual(SWPolicy.isCacheableRequest({}), false);
  assert.strictEqual(SWPolicy.isCacheableRequest('string'), false);
  assert.strictEqual(SWPolicy.isCacheableRequest(42), false);
});

// ── Navigation detection ─────────────────────────────────────────────────────

test('navigation: mode "navigate" is a navigation', () => {
  assert.strictEqual(SWPolicy.isNavigationRequest({ mode: 'navigate', headers: headers({}) }), true);
  assert.strictEqual(SWPolicy.isNavigationRequest({ mode: 'navigate' }), true);
});

test('navigation: Accept text/html is a navigation', () => {
  assert.strictEqual(SWPolicy.isNavigationRequest({
    mode: 'cors', headers: headers({ Accept: 'text/html' })
  }), true);
});

test('navigation: mixed-case HTML media type is a navigation', () => {
  assert.strictEqual(SWPolicy.isNavigationRequest({
    mode: 'no-cors', headers: headers({ Accept: 'TEXT/HTML' })
  }), true);
});

test('navigation: HTML among multiple accepted content types', () => {
  assert.strictEqual(SWPolicy.isNavigationRequest({
    mode: 'cors',
    headers: headers({ Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' })
  }), true);
});

test('navigation: image / script / API-style requests are not navigations', () => {
  assert.strictEqual(SWPolicy.isNavigationRequest({
    mode: 'no-cors', headers: headers({ Accept: 'image/avif,image/webp,*/*' })
  }), false);
  assert.strictEqual(SWPolicy.isNavigationRequest({
    mode: 'cors', headers: headers({ Accept: '*/*' })
  }), false);
  assert.strictEqual(SWPolicy.isNavigationRequest({
    mode: 'cors', headers: headers({ Accept: 'application/json' })
  }), false);
});

test('navigation: missing headers → false (no throw)', () => {
  assert.strictEqual(SWPolicy.isNavigationRequest({ mode: 'cors' }), false);
  assert.strictEqual(SWPolicy.isNavigationRequest({ mode: 'cors', headers: null }), false);
  assert.strictEqual(SWPolicy.isNavigationRequest({ mode: 'cors', headers: {} }), false);
});

test('navigation: malformed request object → false, helper never throws', () => {
  assert.strictEqual(SWPolicy.isNavigationRequest(undefined), false);
  assert.strictEqual(SWPolicy.isNavigationRequest(null), false);
  assert.strictEqual(SWPolicy.isNavigationRequest('nav'), false);
  assert.strictEqual(SWPolicy.isNavigationRequest(7), false);
  // headers.get throws → swallowed to false.
  assert.strictEqual(SWPolicy.isNavigationRequest({
    mode: 'cors', headers: { get() { throw new Error('boom'); } }
  }), false);
});

// ── Protocol / opaque-origin hardening ───────────────────────────────────────

test('deny: file:/// appOrigin (opaque, non-HTTP) is never cacheable', () => {
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: '/favicon.ico', method: 'GET', appOrigin: 'file:///', hasAuthorizationHeader: false
  }), false);
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: 'file:///favicon.ico', method: 'GET', appOrigin: 'file:///', hasAuthorizationHeader: false
  }), false);
});

test('deny: data: request URL is not cacheable', () => {
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: 'data:text/html,<b>x</b>', method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), false);
});

test('deny: blob: request URL is not cacheable', () => {
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: 'blob:' + APP + '/2b8c0f11-0000', method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), false);
});

test('deny: javascript: request URL is not cacheable', () => {
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: 'javascript:void(0)', method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), false);
});

test('deny: non-HTTP appOrigin schemes (ftp:) are never cacheable', () => {
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: '/favicon.ico', method: 'GET', appOrigin: 'ftp://host/', hasAuthorizationHeader: false
  }), false);
});

test('allow/deny: protocol-relative URL resolves to a real host and is judged by it', () => {
  // Cross-origin protocol-relative → denied.
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: '//evil.example/favicon.ico', method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), false);
  // Same-host protocol-relative to an allowlisted asset → allowed (inherits https).
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: '//muscle-motivation.example/favicon.ico', method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), true);
});

test('credentials-in-URL: classified by actual parsed host', () => {
  // userinfo does not change the origin → same-origin allowlisted asset allowed.
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: 'https://user:pass@muscle-motivation.example/favicon.ico',
    method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), true);
  // Host is the part after '@' — a credential-looking prefix targeting another
  // host is cross-origin → denied.
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: 'https://muscle-motivation.example@evil.example/favicon.ico',
    method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), false);
});

// ── Frozen export surface + no-drift ─────────────────────────────────────────

test('frozen: STATIC_ALLOWLIST is frozen', () => {
  assert.strictEqual(Object.isFrozen(SWPolicy.STATIC_ALLOWLIST), true);
});

test('frozen: mutating the exported allowlist cannot alter eligibility', () => {
  const before = SWPolicy.isCacheableRequest({
    url: '/api/usda-search', method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  });
  assert.strictEqual(before, false);
  // Attempt to inject a path (silently ignored in sloppy mode / throws in strict —
  // either way the array must be unchanged and the decision must not flip).
  try { SWPolicy.STATIC_ALLOWLIST.push('/api/usda-search'); } catch (e) { /* frozen throw */ }
  assert.ok(!SWPolicy.STATIC_ALLOWLIST.includes('/api/usda-search'), 'array unchanged');
  assert.strictEqual(SWPolicy.isCacheableRequest({
    url: '/api/usda-search', method: 'GET', appOrigin: APP, hasAuthorizationHeader: false
  }), false, 'eligibility unchanged after mutation attempt');
});

test('frozen: the exported SWPolicy object is frozen', () => {
  assert.strictEqual(Object.isFrozen(SWPolicy), true);
  try { SWPolicy.isCacheableRequest = () => true; } catch (e) { /* frozen throw */ }
  assert.notStrictEqual(SWPolicy.isCacheableRequest(), true, 'handler not replaceable');
});

test('exports: CommonJS require and the global expose the same frozen object', () => {
  // Re-require returns the identical cached export.
  const again = require('./sw-policy.js');
  assert.strictEqual(again, SWPolicy);
  // The IIFE also assigns the same object onto the global under SWPolicy.
  if (typeof globalThis.SWPolicy !== 'undefined') {
    assert.strictEqual(globalThis.SWPolicy, SWPolicy, 'global mirror is the same reference');
  }
  for (const k of ['CACHE_PREFIX', 'CACHE_VERSION', 'CURRENT_STATIC_CACHE', 'isOwnedCacheName',
                   'STATIC_ALLOWLIST', 'isAllowlistedPath', 'isCacheableRequest', 'isNavigationRequest']) {
    assert.ok(k in SWPolicy, `API exposes ${k}`);
  }
});

// ── Contract sanity ──────────────────────────────────────────────────────────

test('contract: STATIC_ALLOWLIST is an array of strings', () => {
  assert.ok(Array.isArray(SWPolicy.STATIC_ALLOWLIST));
  for (const p of SWPolicy.STATIC_ALLOWLIST) assert.strictEqual(typeof p, 'string');
});
