'use strict';

// Phase 4.3.2 — Checkpoint 2. Behavior + safety coverage for the service-worker
// runtime (`sw-runtime.js`) and the thin entrypoint (`sw.js`). Pure Node
// (node:test) with injected fakes — no DOM, no browser, no network, no
// packages, no service-worker-mock. `sw-policy.js` remains the single policy
// source of truth; no security policy is duplicated here.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SWPolicy = require('./sw-policy.js');
const SWRuntime = require('./sw-runtime.js');

const ROOT = __dirname;
const APP = 'https://muscle-motivation.example';
const SUPABASE = 'https://igzvphmhyrdjjvzbxnuh.supabase.co';
const CURRENT = SWPolicy.CURRENT_STATIC_CACHE;

const SW_SRC = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const RUNTIME_SRC = fs.readFileSync(path.join(ROOT, 'sw-runtime.js'), 'utf8');

// "Must NOT contain" safety scans run against COMMENT-STRIPPED code so the
// guarantees are about executable code, not documentation prose (the comments
// legitimately name supabase / /api / offline / caches.match to explain intent).
// Neither worker file contains "//" or "/*" inside a string/URL, so a naive
// strip is exact here.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, '');
}
const SW_CODE = stripComments(SW_SRC);
const RUNTIME_CODE = stripComments(RUNTIME_SRC);

// ── Fakes ─────────────────────────────────────────────────────────────────

function response(opts) {
  opts = opts || {};
  const self_ = {
    ok: opts.ok !== undefined ? opts.ok : true,
    status: opts.status !== undefined ? opts.status : 200,
    type: opts.type || 'basic',
    redirected: opts.redirected || false,
    _id: opts._id || 'resp',
    _clonedFrom: opts._clonedFrom || null
  };
  self_.clone = function () {
    if (opts.cloneThrows) throw new Error('clone');
    return response(Object.assign({}, opts, { cloneThrows: false, _id: self_._id + ':clone', _clonedFrom: self_ }));
  };
  return self_;
}

function request(opts) {
  opts = opts || {};
  const hasAuth = !!opts.auth;
  return {
    url: opts.url,
    method: opts.method || 'GET',
    mode: opts.mode,
    headers: {
      has(name) { return String(name).toLowerCase() === 'authorization' ? hasAuth : false; },
      get(name) { return String(name).toLowerCase() === 'accept' ? (opts.accept || null) : null; }
    }
  };
}

function installEvent() {
  return { _waited: [], waitUntil(p) { this._waited.push(p); } };
}
function fetchEvent(req, opts) {
  opts = opts || {};
  const ev = {
    request: req, _responded: false, _response: undefined, _waited: [],
    respondWith(p) { this._responded = true; this._response = p; }
  };
  if (!opts.noWaitUntil) {
    ev.waitUntil = function (p) {
      if (opts.waitUntilThrows) throw new Error('waitUntil unavailable');
      this._waited.push(p);
    };
  }
  return ev;
}

function cacheEnv(opts) {
  opts = opts || {};
  const log = { open: [], keys: 0, delete: [], match: [], put: [], addAll: [], broadMatch: 0 };
  function makeCache(name) {
    return {
      addAll(list) {
        log.addAll.push({ name, list: Array.prototype.slice.call(list) });
        return opts.addAllReject ? Promise.reject(new Error('addAll')) : Promise.resolve();
      },
      match(req) {
        log.match.push({ name, url: req && req.url });
        if (opts.matchReject) return Promise.reject(new Error('match'));
        return Promise.resolve(opts.hit ? opts.hit(name, req) : undefined);
      },
      put(req, res) {
        log.put.push({ name, url: req && req.url, res });
        if (opts.putThrows) throw new Error('put-sync');
        if (opts.putPending) return new Promise(function () { /* never settles */ });
        return opts.putReject ? Promise.reject(new Error('put')) : Promise.resolve();
      }
    };
  }
  const caches = {
    open(name) {
      log.open.push(name);
      return opts.openReject ? Promise.reject(new Error('open')) : Promise.resolve(makeCache(name));
    },
    keys() { log.keys++; return opts.keysReject ? Promise.reject(new Error('keys')) : Promise.resolve(opts.names || []); },
    delete(name) {
      log.delete.push(name);
      return (opts.deleteReject && opts.deleteReject(name)) ? Promise.reject(new Error('delete')) : Promise.resolve(true);
    },
    match(req) { log.broadMatch++; return Promise.resolve(undefined); }
  };
  return { caches, log };
}

function makeRuntime(env, cfg) {
  cfg = cfg || {};
  const skip = { count: 0 };
  const fetchSpy = { calls: [] };
  const deps = {
    policy: 'policy' in cfg ? cfg.policy : SWPolicy,
    caches: env ? env.caches : undefined,
    fetch(req) {
      fetchSpy.calls.push(req && req.url);
      return cfg.fetchReject ? Promise.reject(new Error('network'))
        : Promise.resolve(cfg.networkResponse || response({ _id: 'net' }));
    },
    skipWaiting() { skip.count++; return cfg.skipReturn ? cfg.skipReturn() : undefined; },
    origin: cfg.origin || APP
  };
  return { app: SWRuntime.createRuntime(deps), skip, fetchSpy };
}

// ── A. Policy loading & contract ────────────────────────────────────────────

test('contract: sw.js imports /sw-policy.js and uses self.SWPolicy', () => {
  assert.match(SW_SRC, /importScripts\(\s*['"]\/sw-policy\.js['"]\s*\)/);
  assert.match(SW_SRC, /self\.SWPolicy/);
});

test('contract: sw.js loads the runtime and injects real globals', () => {
  assert.match(SW_SRC, /importScripts\(\s*['"]\/sw-runtime\.js['"]\s*\)/);
  assert.match(SW_SRC, /self\.SWRuntime/);
  assert.match(SW_SRC, /self\.caches/);
  assert.match(SW_SRC, /self\.location\.origin/);
});

test('contract: sw.js does not duplicate the allowlist, prefix, or cache name', () => {
  assert.ok(!SW_CODE.includes('/icons/'), 'no hard-coded allowlist paths');
  assert.ok(!SW_CODE.includes('mm-static-'), 'no hard-coded cache prefix / current cache name');
  assert.ok(!SW_CODE.includes('favicon.ico'), 'no hard-coded favicon allowlist entry');
});

test('contract: sw-runtime does not duplicate policy constants', () => {
  assert.ok(!RUNTIME_CODE.includes('/icons/'), 'runtime holds no allowlist paths');
  assert.ok(!RUNTIME_CODE.includes('mm-static-'), 'runtime holds no cache prefix / current cache name');
});

test('contract: sw.js fails safe when policy/runtime unavailable (guard present)', () => {
  // The entrypoint attaches listeners only after validatePolicy passes.
  assert.match(SW_SRC, /validatePolicy\(policy\)/);
  assert.match(SW_SRC, /if\s*\(\s*!runtime[\s\S]*return;/);
});

test('contract: validatePolicy rejects missing policy and missing members', () => {
  assert.strictEqual(SWRuntime.validatePolicy(undefined), false);
  assert.strictEqual(SWRuntime.validatePolicy(null), false);
  assert.strictEqual(SWRuntime.validatePolicy({}), false);
  const full = SWPolicy;
  assert.strictEqual(SWRuntime.validatePolicy(full), true);
  for (const drop of ['CACHE_PREFIX', 'CURRENT_STATIC_CACHE', 'STATIC_ALLOWLIST',
                      'isOwnedCacheName', 'isCacheableRequest', 'isNavigationRequest']) {
    const partial = Object.assign({}, full);
    delete partial[drop];
    assert.strictEqual(SWRuntime.validatePolicy(partial), false, `missing ${drop} → invalid`);
  }
});

// ── B. Install ───────────────────────────────────────────────────────────────

test('install: opens only the current cache and addAll the exact allowlist', async () => {
  const env = cacheEnv();
  const { app, skip } = makeRuntime(env);
  const ev = installEvent();
  app.onInstall(ev);
  assert.strictEqual(ev._waited.length, 1, 'uses waitUntil once');
  await ev._waited[0];
  assert.deepStrictEqual(env.log.open, [CURRENT], 'only the current static cache is opened');
  assert.strictEqual(env.log.addAll.length, 1);
  assert.deepStrictEqual(env.log.addAll[0].list, SWPolicy.STATIC_ALLOWLIST.slice(), 'exact approved allowlist');
  assert.strictEqual(env.log.delete.length, 0, 'no cache deletion during install');
  assert.strictEqual(skip.count, 0, 'no skipWaiting during install');
});

test('install: rejects when cache.open fails (no partial activation)', async () => {
  const env = cacheEnv({ openReject: true });
  const { app } = makeRuntime(env);
  const ev = installEvent();
  app.onInstall(ev);
  await assert.rejects(ev._waited[0]);
});

test('install: rejects when any precache entry fails (all-or-nothing)', async () => {
  const env = cacheEnv({ addAllReject: true });
  const { app } = makeRuntime(env);
  const ev = installEvent();
  app.onInstall(ev);
  await assert.rejects(ev._waited[0]);
  assert.strictEqual(env.log.delete.length, 0);
});

// ── C. Activate ──────────────────────────────────────────────────────────────

test('activate: deletes only obsolete owned caches, preserves everything else', async () => {
  const env = cacheEnv({
    names: [CURRENT, 'mm-static-v0', 'mm-static-legacy', 'mm-runtime-v1', 'mm-cache',
            'workbox-precache-v2', 'lucide-cache', 'random']
  });
  const { app, skip } = makeRuntime(env);
  const ev = installEvent();
  app.onActivate(ev);
  assert.strictEqual(ev._waited.length, 1, 'uses waitUntil');
  await ev._waited[0];
  assert.strictEqual(env.log.keys, 1, 'reads all cache names');
  assert.deepStrictEqual(env.log.delete.sort(), ['mm-static-legacy', 'mm-static-v0'].sort(),
    'only obsolete mm-static-* caches deleted');
  assert.ok(!env.log.delete.includes(CURRENT), 'current cache preserved');
  for (const keep of ['mm-runtime-v1', 'mm-cache', 'workbox-precache-v2', 'lucide-cache', 'random']) {
    assert.ok(!env.log.delete.includes(keep), `${keep} preserved`);
  }
  assert.strictEqual(skip.count, 0, 'no skipWaiting on activate');
});

test('activate: with nothing obsolete deletes nothing', async () => {
  const env = cacheEnv({ names: [CURRENT, 'workbox-x', 'other'] });
  const { app } = makeRuntime(env);
  const ev = installEvent();
  app.onActivate(ev);
  await ev._waited[0];
  assert.strictEqual(env.log.delete.length, 0);
});

test('activate: rejects if an owned-cache deletion fails', async () => {
  const env = cacheEnv({
    names: [CURRENT, 'mm-static-v0'],
    deleteReject: (n) => n === 'mm-static-v0'
  });
  const { app } = makeRuntime(env);
  const ev = installEvent();
  app.onActivate(ev);
  await assert.rejects(ev._waited[0]);
});

test('obsoleteOwnedCaches: pure helper filters correctly', () => {
  const names = [CURRENT, 'mm-static-old', 'mm-runtime-v1', 'workbox-1', 'x'];
  assert.deepStrictEqual(SWRuntime.obsoleteOwnedCaches(names, SWPolicy), ['mm-static-old']);
  assert.deepStrictEqual(SWRuntime.obsoleteOwnedCaches(null, SWPolicy), []);
  assert.deepStrictEqual(SWRuntime.obsoleteOwnedCaches([CURRENT], SWPolicy), []);
});

// ── D. Fetch pass-through (never intercepts) ─────────────────────────────────

const PASS_THROUGH = [
  ['navigation mode', request({ url: APP + '/app.html', mode: 'navigate' })],
  ['Accept text/html', request({ url: APP + '/x', accept: 'text/html' })],
  ['/app.html', request({ url: APP + '/app.html' })],
  ['/nutrition.html', request({ url: APP + '/nutrition.html' })],
  ['/workout.html', request({ url: APP + '/workout.html' })],
  ['/api/usda-search', request({ url: APP + '/api/usda-search' })],
  ['/api/ai-food-parse', request({ url: APP + '/api/ai-food-parse' })],
  ['/api/create-checkout-session', request({ url: APP + '/api/create-checkout-session' })],
  ['supabase REST', request({ url: SUPABASE + '/rest/v1/nutrition_logs' })],
  ['supabase auth', request({ url: SUPABASE + '/auth/v1/token' })],
  ['CDN script', request({ url: 'https://cdn.jsdelivr.net/npm/x/supabase.js' })],
  ['Google Fonts', request({ url: 'https://fonts.googleapis.com/css2?family=Bebas' })],
  ['cross-origin lookalike', request({ url: 'https://evil.example/favicon.ico' })],
  ['auth-bearing icon', request({ url: APP + '/favicon.ico', auth: true })],
  ['POST', request({ url: APP + '/favicon.ico', method: 'POST' })],
  ['PUT', request({ url: APP + '/favicon.ico', method: 'PUT' })],
  ['PATCH', request({ url: APP + '/favicon.ico', method: 'PATCH' })],
  ['DELETE', request({ url: APP + '/favicon.ico', method: 'DELETE' })],
  ['unknown same-origin', request({ url: APP + '/secret/thing' })],
  ['same-origin JS', request({ url: APP + '/food-core.js' })],
  ['same-origin CSS', request({ url: APP + '/safe-area.css' })],
  ['web manifest', request({ url: APP + '/manifest.webmanifest' })]
];

for (const [label, req] of PASS_THROUGH) {
  test(`fetch pass-through: ${label} is never intercepted`, () => {
    const env = cacheEnv();
    const { app, fetchSpy } = makeRuntime(env);
    const ev = fetchEvent(req);
    app.onFetch(ev);
    assert.strictEqual(ev._responded, false, 'respondWith not called');
    assert.strictEqual(env.log.open.length, 0, 'no cache opened');
    assert.strictEqual(env.log.match.length, 0, 'no cache match');
    assert.strictEqual(env.log.broadMatch, 0, 'no broad caches.match');
    assert.strictEqual(fetchSpy.calls.length, 0, 'no worker-level fetch');
  });
}

test('fetch pass-through: malformed request object is never intercepted', () => {
  const env = cacheEnv();
  const { app, fetchSpy } = makeRuntime(env);
  for (const bad of [undefined, null, {}, { request: null }, { request: {} }]) {
    const ev = fetchEvent(bad && bad.request !== undefined ? bad.request : bad);
    app.onFetch(ev);
    assert.strictEqual(ev._responded, false);
  }
  assert.strictEqual(env.log.open.length, 0);
  assert.strictEqual(fetchSpy.calls.length, 0);
});

test('fetch fails closed: missing policy → no interception', () => {
  const env = cacheEnv();
  const { app } = makeRuntime(env, { policy: undefined });
  const ev = fetchEvent(request({ url: APP + '/favicon.ico' }));
  app.onFetch(ev);
  assert.strictEqual(ev._responded, false, 'no policy → never intercept');
  assert.strictEqual(env.log.open.length, 0);
});

test('fetch fails closed: classifier that throws → no interception', () => {
  const env = cacheEnv();
  const throwingPolicy = Object.assign({}, SWPolicy, {
    isCacheableRequest() { throw new Error('boom'); }
  });
  const { app } = makeRuntime(env, { policy: throwingPolicy });
  const ev = fetchEvent(request({ url: APP + '/favicon.ico' }));
  app.onFetch(ev);
  assert.strictEqual(ev._responded, false, 'classifier throw → fail closed');
  assert.strictEqual(env.log.open.length, 0);
});

// ── E. Eligible static-asset fetch ───────────────────────────────────────────

const ICON = APP + '/favicon.ico';

test('eligible: cache hit returns cached response, no network', async () => {
  const cached = response({ _id: 'cached' });
  const env = cacheEnv({ hit: () => cached });
  const { app, fetchSpy } = makeRuntime(env);
  const ev = fetchEvent(request({ url: ICON }));
  app.onFetch(ev);
  assert.strictEqual(ev._responded, true, 'respondWith called once');
  const out = await ev._response;
  assert.strictEqual(out, cached, 'returns the cached response');
  assert.deepStrictEqual(env.log.open, [CURRENT], 'opens only the current cache');
  assert.ok(env.log.match.every((m) => m.name === CURRENT), 'matches only the current cache');
  assert.strictEqual(env.log.broadMatch, 0, 'no broad caches.match');
  assert.strictEqual(fetchSpy.calls.length, 0, 'no network on hit');
  assert.strictEqual(env.log.put.length, 0, 'no write on hit');
});

test('eligible: cache miss fetches network and repairs with a clone', async () => {
  const net = response({ _id: 'net', ok: true, status: 200, type: 'basic' });
  const env = cacheEnv({ hit: () => undefined });
  const { app, fetchSpy } = makeRuntime(env, { networkResponse: net });
  const ev = fetchEvent(request({ url: ICON }));
  app.onFetch(ev);
  const out = await ev._response;
  assert.strictEqual(out, net, 'returns the original network response');
  assert.strictEqual(fetchSpy.calls.length, 1, 'network fetched once');
  assert.deepStrictEqual(env.log.open, [CURRENT], 'only current cache opened');
  await new Promise((r) => setImmediate(r)); // let the fire-and-forget put settle
  assert.strictEqual(env.log.put.length, 1, 'repair write happened');
  assert.strictEqual(env.log.put[0].res._clonedFrom, net, 'stored a CLONE, not the original');
  assert.notStrictEqual(env.log.put[0].res, net, 'original response not stored directly');
  assert.strictEqual(env.log.broadMatch, 0);
});

for (const [label, res] of [
  ['non-OK', response({ ok: false, status: 500 })],
  ['opaque', response({ ok: false, type: 'opaque' })],
  ['opaqueredirect', response({ ok: false, type: 'opaqueredirect' })],
  ['redirected', response({ ok: true, status: 200, redirected: true })],
  ['status 206', response({ ok: true, status: 206 })]
]) {
  test(`eligible: repair skipped for ${label} response`, async () => {
    const env = cacheEnv({ hit: () => undefined });
    const { app } = makeRuntime(env, { networkResponse: res });
    const ev = fetchEvent(request({ url: ICON }));
    app.onFetch(ev);
    const out = await ev._response;
    assert.strictEqual(out, res, 'returns the network response unchanged');
    await new Promise((r) => setImmediate(r));
    assert.strictEqual(env.log.put.length, 0, `no cache write for ${label}`);
  });
}

test('isCacheableResponse: pure guard', () => {
  assert.strictEqual(SWRuntime.isCacheableResponse(response({ ok: true, status: 200 })), true);
  assert.strictEqual(SWRuntime.isCacheableResponse(response({ ok: false, status: 404 })), false);
  assert.strictEqual(SWRuntime.isCacheableResponse(response({ ok: true, status: 206 })), false);
  assert.strictEqual(SWRuntime.isCacheableResponse(response({ type: 'opaque' })), false);
  assert.strictEqual(SWRuntime.isCacheableResponse(response({ type: 'opaqueredirect' })), false);
  assert.strictEqual(SWRuntime.isCacheableResponse(response({ ok: true, redirected: true })), false);
  assert.strictEqual(SWRuntime.isCacheableResponse(null), false);
});

test('eligible: network failure with no cache hit rejects naturally', async () => {
  const env = cacheEnv({ hit: () => undefined });
  const { app } = makeRuntime(env, { fetchReject: true });
  const ev = fetchEvent(request({ url: ICON }));
  app.onFetch(ev);
  assert.strictEqual(ev._responded, true);
  await assert.rejects(ev._response, /network/, 'no synthesized fallback — rejects');
  assert.strictEqual(env.log.put.length, 0);
});

test('eligible: cache OPEN failure falls back to direct network', async () => {
  const net = response({ _id: 'net' });
  const env = cacheEnv({ openReject: true });
  const { app, fetchSpy } = makeRuntime(env, { networkResponse: net });
  const ev = fetchEvent(request({ url: ICON }));
  app.onFetch(ev);
  const out = await ev._response;
  assert.strictEqual(out, net, 'served from network when cache open fails');
  assert.strictEqual(fetchSpy.calls.length, 1);
  assert.strictEqual(env.log.match.length, 0, 'no match attempted after open failure');
  assert.strictEqual(env.log.put.length, 0, 'no repair against an unavailable cache');
});

test('eligible: cache MATCH failure falls back to direct network', async () => {
  const net = response({ _id: 'net' });
  const env = cacheEnv({ matchReject: true });
  const { app, fetchSpy } = makeRuntime(env, { networkResponse: net });
  const ev = fetchEvent(request({ url: ICON }));
  app.onFetch(ev);
  const out = await ev._response;
  assert.strictEqual(out, net, 'served from network when match rejects');
  assert.strictEqual(fetchSpy.calls.length, 1);
  assert.strictEqual(env.log.put.length, 0);
});

test('eligible: cache PUT failure does not block the network response', async () => {
  const net = response({ _id: 'net', ok: true, status: 200 });
  const env = cacheEnv({ hit: () => undefined, putReject: true });
  const { app } = makeRuntime(env, { networkResponse: net });
  const ev = fetchEvent(request({ url: ICON }));
  app.onFetch(ev);
  const out = await ev._response;
  assert.strictEqual(out, net, 'network response returned despite put failure');
});

// ── E2. Repair lifetime (event.waitUntil) ────────────────────────────────────

test('repair: safe response returns without waiting for the repair write', async () => {
  const net = response({ _id: 'net', ok: true, status: 200 });
  const env = cacheEnv({ hit: () => undefined, putPending: true }); // put never settles
  const { app } = makeRuntime(env, { networkResponse: net });
  const ev = fetchEvent(request({ url: ICON }));
  app.onFetch(ev);
  const out = await ev._response; // resolves even though the repair is pending
  assert.strictEqual(out, net);
  assert.strictEqual(ev._waited.length, 1, 'repair promise handed to waitUntil');
  let settled = false;
  ev._waited[0].then(() => { settled = true; });
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(settled, false, 'repair still pending — response was not blocked on it');
});

test('repair: waitUntil receives a promise that resolves after a successful put', async () => {
  const net = response({ _id: 'net', ok: true, status: 200 });
  const env = cacheEnv({ hit: () => undefined });
  const { app } = makeRuntime(env, { networkResponse: net });
  const ev = fetchEvent(request({ url: ICON }));
  app.onFetch(ev);
  await ev._response;
  assert.strictEqual(ev._waited.length, 1);
  await ev._waited[0]; // resolves (does not hang / reject)
  assert.strictEqual(env.log.put.length, 1, 'put performed');
});

test('repair: rejected cache.put is swallowed by the waitUntil promise', async () => {
  const net = response({ _id: 'net', ok: true, status: 200 });
  const env = cacheEnv({ hit: () => undefined, putReject: true });
  const { app } = makeRuntime(env, { networkResponse: net });
  const ev = fetchEvent(request({ url: ICON }));
  app.onFetch(ev);
  const out = await ev._response;
  assert.strictEqual(out, net, 'response unaffected by put rejection');
  assert.strictEqual(ev._waited.length, 1);
  await ev._waited[0]; // resolves, never rejects
});

test('repair: synchronous cache.put throw is swallowed', async () => {
  const net = response({ _id: 'net', ok: true, status: 200 });
  const env = cacheEnv({ hit: () => undefined, putThrows: true });
  const { app } = makeRuntime(env, { networkResponse: net });
  const ev = fetchEvent(request({ url: ICON }));
  app.onFetch(ev);
  const out = await ev._response;
  assert.strictEqual(out, net, 'response returned despite sync put throw');
  assert.strictEqual(ev._waited.length, 1);
  await ev._waited[0]; // contained → resolves
});

test('repair: synchronous response.clone throw is swallowed', async () => {
  const net = response({ _id: 'net', ok: true, status: 200, cloneThrows: true });
  const env = cacheEnv({ hit: () => undefined });
  const { app } = makeRuntime(env, { networkResponse: net });
  const ev = fetchEvent(request({ url: ICON }));
  app.onFetch(ev);
  const out = await ev._response;
  assert.strictEqual(out, net, 'response returned despite clone() throw');
  assert.strictEqual(env.log.put.length, 0, 'no put attempted when clone fails');
  assert.strictEqual(ev._waited.length, 1);
  await ev._waited[0]; // contained → resolves
});

test('repair: missing event.waitUntil does not block or reject the response', async () => {
  const net = response({ _id: 'net', ok: true, status: 200 });
  const env = cacheEnv({ hit: () => undefined });
  const { app } = makeRuntime(env, { networkResponse: net });
  const ev = fetchEvent(request({ url: ICON }), { noWaitUntil: true });
  app.onFetch(ev);
  const out = await ev._response;
  assert.strictEqual(out, net, 'valid response returned without waitUntil');
});

test('repair: throwing event.waitUntil is contained; response still returned', async () => {
  const net = response({ _id: 'net', ok: true, status: 200 });
  const env = cacheEnv({ hit: () => undefined });
  const { app } = makeRuntime(env, { networkResponse: net });
  const ev = fetchEvent(request({ url: ICON }), { waitUntilThrows: true });
  app.onFetch(ev);
  const out = await ev._response;
  assert.strictEqual(out, net, 'valid response returned even if waitUntil throws');
});

test('repair: ineligible requests never call waitUntil or respondWith', () => {
  const env = cacheEnv();
  const { app } = makeRuntime(env);
  for (const [, req] of PASS_THROUGH) {
    const ev = fetchEvent(req);
    app.onFetch(ev);
    assert.strictEqual(ev._responded, false);
    assert.strictEqual(ev._waited.length, 0, 'no waitUntil on ineligible request');
  }
});

test('repair: cache hit schedules no repair work', async () => {
  const cached = response({ _id: 'cached' });
  const env = cacheEnv({ hit: () => cached });
  const { app } = makeRuntime(env);
  const ev = fetchEvent(request({ url: ICON }));
  app.onFetch(ev);
  await ev._response;
  assert.strictEqual(ev._waited.length, 0, 'no waitUntil on hit');
  assert.strictEqual(env.log.put.length, 0);
});

for (const [label, res] of [
  ['non-OK', response({ ok: false, status: 500 })],
  ['opaque', response({ ok: false, type: 'opaque' })],
  ['status 206', response({ ok: true, status: 206 })]
]) {
  test(`repair: unsafe (${label}) response schedules no repair work`, async () => {
    const env = cacheEnv({ hit: () => undefined });
    const { app } = makeRuntime(env, { networkResponse: res });
    const ev = fetchEvent(request({ url: ICON }));
    app.onFetch(ev);
    await ev._response;
    assert.strictEqual(ev._waited.length, 0, `no waitUntil for ${label}`);
    assert.strictEqual(env.log.put.length, 0);
  });
}

// ── F. Message ───────────────────────────────────────────────────────────────

test('message: {type:"SKIP_WAITING"} calls skipWaiting exactly once', () => {
  const env = cacheEnv();
  const { app, skip } = makeRuntime(env);
  app.onMessage({ data: { type: 'SKIP_WAITING' } });
  assert.strictEqual(skip.count, 1);
  assert.strictEqual(env.log.delete.length, 0, 'no cache deletion from message');
  assert.strictEqual(env.log.open.length, 0, 'no cache open from message');
});

for (const [label, ev] of [
  ['unknown type', { data: { type: 'NUKE' } }],
  ['missing data', {}],
  ['null data', { data: null }],
  ['string data', { data: 'SKIP_WAITING' }],
  ['number data', { data: 5 }],
  ['object without type', { data: {} }],
  ['undefined event', undefined]
]) {
  test(`message: ${label} is ignored`, () => {
    const env = cacheEnv();
    const { app, skip } = makeRuntime(env);
    app.onMessage(ev);
    assert.strictEqual(skip.count, 0);
    assert.strictEqual(env.log.delete.length, 0);
  });
}

async function expectNoUnhandled(fn) {
  const caught = [];
  const onRej = (r) => caught.push(r);
  process.on('unhandledRejection', onRej);
  try {
    fn();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
  } finally {
    process.removeListener('unhandledRejection', onRej);
  }
  assert.deepStrictEqual(caught, [], 'no unhandled rejection surfaced');
}

test('skipWaiting: resolved promise creates no rejection', async () => {
  const env = cacheEnv();
  const { app, skip } = makeRuntime(env, { skipReturn: () => Promise.resolve() });
  await expectNoUnhandled(() => app.onMessage({ data: { type: 'SKIP_WAITING' } }));
  assert.strictEqual(skip.count, 1);
});

test('skipWaiting: rejected promise is swallowed (no unhandled rejection)', async () => {
  const env = cacheEnv();
  const { app, skip } = makeRuntime(env, { skipReturn: () => Promise.reject(new Error('skip')) });
  await expectNoUnhandled(() => app.onMessage({ data: { type: 'SKIP_WAITING' } }));
  assert.strictEqual(skip.count, 1);
});

test('skipWaiting: synchronous throw is contained', () => {
  const env = cacheEnv();
  const { app, skip } = makeRuntime(env, { skipReturn: () => { throw new Error('sync'); } });
  assert.doesNotThrow(() => app.onMessage({ data: { type: 'SKIP_WAITING' } }));
  assert.strictEqual(skip.count, 1);
});

test('skipWaiting: non-promise return is accepted without error', () => {
  const env = cacheEnv();
  const { app, skip } = makeRuntime(env, { skipReturn: () => 42 });
  assert.doesNotThrow(() => app.onMessage({ data: { type: 'SKIP_WAITING' } }));
  assert.strictEqual(skip.count, 1);
});

test('skipWaiting: unknown message never invokes skipWaiting even with a throwing impl', () => {
  const env = cacheEnv();
  const { app, skip } = makeRuntime(env, { skipReturn: () => { throw new Error('should not run'); } });
  assert.doesNotThrow(() => app.onMessage({ data: { type: 'NOPE' } }));
  assert.strictEqual(skip.count, 0, 'skipWaiting not called for a non-SKIP_WAITING message');
});

// ── F2. Native receiver binding (Checkpoint 4 controlled-update defect guard) ──
// The browser's real self.skipWaiting is a receiver-sensitive native method: it
// throws "Illegal invocation" unless called with the ServiceWorkerGlobalScope as
// its receiver. If sw.js injected it UNBOUND (skipWaiting: self.skipWaiting) the
// runtime's `doSkipWaiting()` call would run it with `this === undefined`, it
// would throw, the throw would be contained, and the waiting worker would NEVER
// activate — exactly the observed browser symptom. sw.js instead injects the
// self-bound wrapper `function () { return self.skipWaiting(); }`. These tests
// prove the wrapper preserves the receiver AND that an unbound injection is
// genuinely detectable (the effect never happens).

// A stand-in for self.skipWaiting: throws unless invoked with `g` as receiver,
// and only records the activation effect when it is correctly bound.
function receiverSensitiveScope() {
  const g = { skipWaitingCalls: 0, activated: false };
  g.skipWaiting = function () {
    if (this !== g) throw new TypeError('Illegal invocation');
    g.skipWaitingCalls += 1;
    g.activated = true;
    return Promise.resolve();
  };
  return g;
}
function runtimeWith(skipWaiting) {
  const env = cacheEnv();
  const app = SWRuntime.createRuntime({
    policy: SWPolicy, caches: env.caches,
    fetch: () => Promise.resolve(response()), skipWaiting, origin: APP
  });
  return { app, env };
}

test('receiver: self-bound wrapper (as in sw.js) preserves the receiver → activation runs', async () => {
  const g = receiverSensitiveScope();
  const { app } = runtimeWith(function () { return g.skipWaiting(); }); // sw.js form
  const waited = [];
  app.onMessage({ data: { type: 'SKIP_WAITING' }, waitUntil: (p) => waited.push(p) });
  assert.strictEqual(g.skipWaitingCalls, 1, 'native skipWaiting actually invoked');
  assert.strictEqual(g.activated, true, 'waiting-worker activation effect happened');
  assert.strictEqual(waited.length, 1, 'skipWaiting promise handed to event.waitUntil');
  await waited[0]; // contained → resolves
});

test('receiver: UNBOUND native-style injection fails to activate (this test would catch the regression)', () => {
  const g = receiverSensitiveScope();
  const { app } = runtimeWith(g.skipWaiting); // WRONG: unbound → this !== g → throws
  // The runtime contains the throw (no crash), but the activation effect never
  // happens — reproducing the "waiting worker never activates" defect.
  assert.doesNotThrow(() => app.onMessage({ data: { type: 'SKIP_WAITING' }, waitUntil: () => {} }));
  assert.strictEqual(g.skipWaitingCalls, 0, 'unbound call threw before any effect');
  assert.strictEqual(g.activated, false, 'waiting worker never activated');
});

test('receiver: only exact {type:"SKIP_WAITING"} invokes the bound native method', () => {
  const g = receiverSensitiveScope();
  const { app } = runtimeWith(function () { return g.skipWaiting(); });
  for (const ev of [{ data: { type: 'NOPE' } }, {}, { data: null }, { data: 'SKIP_WAITING' }, { data: 5 }, undefined]) {
    app.onMessage(ev);
  }
  assert.strictEqual(g.skipWaitingCalls, 0, 'no other message type activates');
});

test('receiver: sync throw and rejected promise stay contained with waitUntil present', async () => {
  const throwing = runtimeWith(function () { throw new Error('sync'); });
  const w = [];
  assert.doesNotThrow(() => throwing.app.onMessage({ data: { type: 'SKIP_WAITING' }, waitUntil: (p) => w.push(p) }));
  if (w.length) await w[0]; // contained → resolves, never rejects

  const rejecting = runtimeWith(function () { return Promise.reject(new Error('async')); });
  await expectNoUnhandled(() =>
    rejecting.app.onMessage({ data: { type: 'SKIP_WAITING' }, waitUntil: () => {} }));
});

test('receiver: waitUntil is optional — activation still runs when the event lacks it', () => {
  const g = receiverSensitiveScope();
  const { app } = runtimeWith(function () { return g.skipWaiting(); });
  assert.doesNotThrow(() => app.onMessage({ data: { type: 'SKIP_WAITING' } })); // no waitUntil
  assert.strictEqual(g.skipWaitingCalls, 1, 'skipWaiting still invoked without waitUntil');
});

// ── F3. Worker acknowledgment (SKIP_WAITING_ACK through event.ports[0]) ───────

function fakeAckPort() {
  const p = { posted: [], _throws: false, postMessage(m) { if (p._throws) throw new Error('port'); p.posted.push(m); } };
  return p;
}

test('ack: worker sends { type: "SKIP_WAITING_ACK" } through event.ports[0] after skipWaiting', () => {
  const g = receiverSensitiveScope();
  const { app } = runtimeWith(function () { return g.skipWaiting(); });
  const port = fakeAckPort();
  const waited = [];
  app.onMessage({ data: { type: 'SKIP_WAITING' }, ports: [port], waitUntil: (pr) => waited.push(pr) });
  assert.strictEqual(g.skipWaitingCalls, 1, 'skipWaiting invoked (before the ack)');
  assert.strictEqual(waited.length, 1, 'waitUntil received the skipWaiting promise');
  assert.strictEqual(port.posted.length, 1, 'acknowledgment sent');
  assert.deepStrictEqual(port.posted[0], { type: 'SKIP_WAITING_ACK' });
});

test('ack: a missing port is safe — no throw, and skipWaiting still runs', () => {
  const g = receiverSensitiveScope();
  const { app } = runtimeWith(function () { return g.skipWaiting(); });
  assert.doesNotThrow(() => app.onMessage({ data: { type: 'SKIP_WAITING' } }));               // no ports
  assert.doesNotThrow(() => app.onMessage({ data: { type: 'SKIP_WAITING' }, ports: [] }));     // empty ports
  assert.strictEqual(g.skipWaitingCalls, 2, 'skipWaiting invoked both times');
});

test('ack: a throwing ack port is contained and never blocks skipWaiting', () => {
  const g = receiverSensitiveScope();
  const { app } = runtimeWith(function () { return g.skipWaiting(); });
  const port = fakeAckPort(); port._throws = true;
  assert.doesNotThrow(() => app.onMessage({ data: { type: 'SKIP_WAITING' }, ports: [port] }));
  assert.strictEqual(g.skipWaitingCalls, 1, 'skipWaiting still invoked despite ack failure');
});

test('ack: an unknown message sends no ack and invokes no skipWaiting', () => {
  const g = receiverSensitiveScope();
  const { app } = runtimeWith(function () { return g.skipWaiting(); });
  const port = fakeAckPort();
  for (const ev of [{ data: { type: 'NOPE' }, ports: [port] }, { data: null, ports: [port] }, {}]) {
    app.onMessage(ev);
  }
  assert.strictEqual(g.skipWaitingCalls, 0);
  assert.strictEqual(port.posted.length, 0);
});

// ── G. Static safety scans ───────────────────────────────────────────────────

const FORBIDDEN_BOTH = [
  ['clients.claim', /clients\s*\.\s*claim\s*\(/],
  ['localStorage', /localStorage/],
  ['sessionStorage', /sessionStorage/],
  ['indexedDB', /indexedDB/],
  ['document access', /\bdocument\b/],
  ['cookie access', /\.cookie\b/],
  ['navigator.serviceWorker', /navigator\s*\.\s*serviceWorker/],
  ['serviceWorker.register', /serviceWorker\s*\.\s*register/],
  ['registration.update', /registration\s*\.\s*update\s*\(/],
  ['push listener', /addEventListener\(\s*['"]push['"]/],
  ['pushManager', /pushManager/],
  ['notification listener', /addEventListener\(\s*['"]notification/],
  ['Notification', /\bNotification\b/],
  ['sync listener', /addEventListener\(\s*['"](periodic)?sync['"]/],
  ['navigationPreload', /navigationPreload/],
  ['workbox', /workbox/i],
  ['HTML fallback', /text\/html/],
  ['offline page', /offline/i]
];

for (const [label, re] of FORBIDDEN_BOTH) {
  test(`safety scan (sw.js): no ${label}`, () => {
    assert.ok(!re.test(SW_CODE), `sw.js must not contain ${label}`);
  });
  test(`safety scan (sw-runtime.js): no ${label}`, () => {
    assert.ok(!re.test(RUNTIME_CODE), `sw-runtime.js must not contain ${label}`);
  });
}

test('safety scan: no /api/ or supabase allowlist inside worker files', () => {
  for (const src of [SW_CODE, RUNTIME_CODE]) {
    assert.ok(!src.includes('/api/'), 'no /api/ path baked into worker code');
    assert.ok(!/supabase/i.test(src), 'no supabase URL baked into worker code');
  }
});

test('safety scan: no broad caches.match( in worker files', () => {
  // Only per-cache `cache.match(...)` is allowed; a global `caches.match(` would
  // search every cache (including obsolete ones) and is forbidden.
  assert.ok(!/\bcaches\s*\.\s*match\s*\(/.test(RUNTIME_CODE), 'runtime uses only current-cache match');
  assert.ok(!/\bcaches\s*\.\s*match\s*\(/.test(SW_CODE), 'sw.js does no matching');
});

test('safety scan: sw.js importScripts only the two approved local modules', () => {
  const imports = [...SW_SRC.matchAll(/importScripts\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
  assert.deepStrictEqual(imports, ['/sw-policy.js', '/sw-runtime.js']);
  for (const spec of imports) {
    assert.ok(spec.startsWith('/'), 'first-party root-relative import only');
    assert.ok(!/^https?:/.test(spec), 'no external importScripts');
  }
});

test('safety scan: no install-time skipWaiting; skipWaiting only via message path', () => {
  // sw.js exposes skipWaiting solely as an injected dependency; it must not be
  // called inside the install listener.
  assert.ok(!/addEventListener\(\s*['"]install['"][^;]*skipWaiting/.test(SW_CODE),
    'sw.js: no skipWaiting in the install listener');
  // In the runtime, the only skipWaiting invocation is doSkipWaiting() inside
  // onMessage; onInstall must not reference skipWaiting.
  const onInstallBody = RUNTIME_CODE.slice(
    RUNTIME_CODE.indexOf('function onInstall'),
    RUNTIME_CODE.indexOf('function onActivate')
  );
  assert.ok(onInstallBody.length > 0, 'onInstall body located');
  assert.ok(!/skipWaiting/i.test(onInstallBody), 'runtime: install path never touches skipWaiting');
});

test('safety scan: no page-registration / DOM / reload logic in the worker', () => {
  for (const src of [SW_CODE, RUNTIME_CODE]) {
    assert.ok(!/\blocation\s*\.\s*reload\s*\(/.test(src), 'no reload()');
    assert.ok(!/\bunregister\s*\(/.test(src), 'no unregister()');
    // `window` appears only in the universal dual-export guard
    // (`typeof window !== 'undefined' ? window : this`); it is never dereferenced.
    assert.ok(!/window\s*\./.test(src), 'no window.<member> DOM access');
  }
});
