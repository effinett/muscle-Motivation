// checkout-embedded.test.js — on-site (Stripe Embedded Checkout) contract.
//
// The buyer now pays on checkout.html instead of being redirected to Stripe.
// What must NOT change: identity comes from the bearer token, the price comes
// from the server map, and client_reference_id + metadata still carry the user
// so the existing webhook → purchases pipeline is untouched. The hosted {url}
// contract stays as the default and as the fallback when no publishable key is
// configured, so the change is safe to deploy before the env var exists.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ROUTE = path.join(ROOT, 'api/create-checkout-session.js');

// ── Harness: fake Stripe SDK + fake Supabase auth, fresh module per env ──────
function loadRoute(env) {
  const created = [];
  class FakeStripe {
    constructor() {
      this.checkout = {
        sessions: {
          create: async (params) => {
            created.push(params);
            return params.ui_mode === 'embedded'
              ? { id: 'cs_test_1', client_secret: 'cs_test_1_secret_abc' }
              : { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' };
          },
        },
      };
    }
  }
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; }
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];

  const origLoad = Module._load;
  Module._load = function (request, ...rest) {
    if (request === 'stripe') return FakeStripe;
    return origLoad.call(this, request, ...rest);
  };
  delete require.cache[ROUTE];
  let handler;
  try { handler = require(ROUTE); } finally { Module._load = origLoad; }

  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  return { handler, created };
}

const BASE_ENV = {
  STRIPE_SECRET_KEY: 'sk_test_x',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: undefined, // skip customer lookup → customer_email path
  SITE_URL: 'https://musclemotivation.fit',
  STRIPE_PRICE_FAT_LOSS: 'price_fat',
  STRIPE_PRICE_MEMBERSHIP: 'price_member',
};

function fakeRes() {
  return {
    statusCode: 200, body: undefined, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

async function call(handler, body, { token = 'good' } = {}) {
  const origFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if (String(url).endsWith('/auth/v1/user')) {
      const ok = opts.headers.Authorization === 'Bearer good';
      return { ok, json: async () => ({ id: 'user-123', email: 'a@b.co' }) };
    }
    throw new Error('unexpected fetch ' + url);
  };
  try {
    const res = fakeRes();
    await handler({ method: 'POST', body, headers: token ? { authorization: `Bearer ${token}` } : {} }, res);
    return res;
  } finally {
    global.fetch = origFetch;
  }
}

// ── Server contract ─────────────────────────────────────────────────────────

test('default request keeps the hosted-redirect contract unchanged', async () => {
  const { handler, created } = loadRoute({ ...BASE_ENV, STRIPE_PUBLISHABLE_KEY: 'pk_test_x' });
  const res = await call(handler, { product: 'fat_loss_blueprint' });
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(Object.keys(res.body), ['url']);
  const p = created[0];
  assert.strictEqual(p.ui_mode, undefined);
  assert.strictEqual(p.success_url, 'https://musclemotivation.fit/app.html?purchase=success');
  assert.strictEqual(p.cancel_url, 'https://musclemotivation.fit/store.html?purchase=cancelled');
});

test('embedded request returns a client secret + publishable key, never a url', async () => {
  const { handler, created } = loadRoute({ ...BASE_ENV, STRIPE_PUBLISHABLE_KEY: 'pk_test_x' });
  const res = await call(handler, { product: 'fat_loss_blueprint', ui: 'embedded' });
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body, { clientSecret: 'cs_test_1_secret_abc', publishableKey: 'pk_test_x' });
  const p = created[0];
  assert.strictEqual(p.ui_mode, 'embedded');
  assert.strictEqual(p.return_url, 'https://musclemotivation.fit/app.html?purchase=success');
  // Stripe rejects success_url / cancel_url in embedded mode.
  assert.strictEqual(p.success_url, undefined);
  assert.strictEqual(p.cancel_url, undefined);
});

test('embedded keeps the webhook identity contract (user from token, price from server)', async () => {
  const { handler, created } = loadRoute({ ...BASE_ENV, STRIPE_PUBLISHABLE_KEY: 'pk_test_x' });
  await call(handler, { product: 'ai_membership', ui: 'embedded', price: 'price_evil', user_id: 'someone-else' });
  const p = created[0];
  assert.strictEqual(p.client_reference_id, 'user-123');
  assert.deepStrictEqual(p.metadata, { product: 'ai_membership', user_id: 'user-123' });
  assert.deepStrictEqual(p.line_items, [{ price: 'price_member', quantity: 1 }]);
  assert.strictEqual(p.mode, 'subscription');
  assert.deepStrictEqual(p.subscription_data, { metadata: { product: 'ai_membership', user_id: 'user-123' } });
});

test('embedded falls back to the hosted url when no publishable key is configured', async () => {
  const { handler, created } = loadRoute({ ...BASE_ENV, STRIPE_PUBLISHABLE_KEY: undefined });
  const res = await call(handler, { product: 'fat_loss_blueprint', ui: 'embedded' });
  assert.deepStrictEqual(Object.keys(res.body), ['url']);
  assert.strictEqual(created[0].ui_mode, undefined);
});

test('embedded still requires a valid session', async () => {
  const { handler, created } = loadRoute({ ...BASE_ENV, STRIPE_PUBLISHABLE_KEY: 'pk_test_x' });
  const res = await call(handler, { product: 'fat_loss_blueprint', ui: 'embedded' }, { token: 'bad' });
  assert.strictEqual(res.statusCode, 401);
  assert.strictEqual(created.length, 0);
});

// ── Page + store wiring ─────────────────────────────────────────────────────

test('store Buy buttons go to the on-site checkout page, not to Stripe', () => {
  const store = read('store.html');
  const fn = store.slice(store.indexOf('async function buyProduct'), store.indexOf('function showStoreToast'));
  assert.match(fn, /checkout\.html\?product=\$\{encodeURIComponent\(slug\)\}/);
  assert.doesNotMatch(fn, /create-checkout-session/);
});

test('checkout page covers exactly the sellable slugs and asks for embedded mode', () => {
  const page = read('checkout.html');
  const route = read('api/create-checkout-session.js');
  const serverSlugs = [...route.matchAll(/^\s{2}(\w+):\s*\{ price:/gm)].map((m) => m[1]).sort();
  const block = page.slice(page.indexOf('const PRODUCT_COPY'), page.indexOf('};', page.indexOf('const PRODUCT_COPY')));
  const pageSlugs = [...block.matchAll(/^\s{4}(\w+):\s*\{ title:/gm)].map((m) => m[1]).sort();
  assert.ok(serverSlugs.length > 0);
  assert.deepStrictEqual(pageSlugs, serverSlugs);
  assert.match(page, /ui: 'embedded'/);
  assert.match(page, /<script src="https:\/\/js\.stripe\.com\/v3\/"><\/script>/);
  assert.match(page, /initEmbeddedCheckout/);
  // The page never decides the price.
  assert.doesNotMatch(block, /price/i);
});

test('CSP allows Stripe Embedded Checkout and keeps the existing hardening', () => {
  const csp = JSON.parse(read('vercel.json')).headers[0].headers
    .find((h) => h.key === 'Content-Security-Policy').value;
  const dir = (name) => (csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(name + ' ')) || '');
  for (const o of ['https://js.stripe.com', 'https://checkout.stripe.com']) {
    assert.ok(dir('script-src').includes(o), `script-src ${o}`);
    assert.ok(dir('frame-src').includes(o), `frame-src ${o}`);
  }
  assert.ok(dir('frame-src').includes('https://hooks.stripe.com'), '3DS frames');
  assert.ok(dir('connect-src').includes('https://api.stripe.com'));
  assert.ok(dir('connect-src').includes('https://checkout.stripe.com'));
  assert.strictEqual(dir('frame-ancestors'), "frame-ancestors 'none'");
  assert.strictEqual(dir('object-src'), "object-src 'none'");
});

// ── Already-owned guard (2026-11-24, Effi) ──────────────────────────────────
// With a service key configured, the route reads the user's purchases and
// refuses a second purchase of the same thing — through the shared resolver.

async function callWithPurchases(handler, body, rows, { purchasesOk = true } = {}) {
  const origFetch = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'user-123', email: 'a@b.co' }) };
    if (u.includes('/rest/v1/purchases')) {
      if (!purchasesOk) return { ok: false, json: async () => ({}) };
      return { ok: true, json: async () => rows };
    }
    if (u.includes('/rest/v1/profiles')) return { ok: true, json: async () => [] };
    throw new Error('unexpected fetch ' + u);
  };
  try {
    const res = fakeRes();
    await handler({ method: 'POST', body, headers: { authorization: 'Bearer good' } }, res);
    return res;
  } finally {
    global.fetch = origFetch;
  }
}

const GUARD_ENV = { ...BASE_ENV, SUPABASE_SERVICE_ROLE_KEY: 'svc', STRIPE_PUBLISHABLE_KEY: 'pk_test_x',
  STRIPE_PRICE_MUSCLE_GAIN: 'price_mg' };

test('guard: an active standalone owner gets 409 and no Stripe session', async () => {
  const { handler, created } = loadRoute(GUARD_ENV);
  const res = await callWithPurchases(handler, { product: 'muscle_gain', ui: 'embedded' },
    [{ product: 'muscle_gain', status: 'active' }]);
  assert.strictEqual(res.statusCode, 409);
  assert.deepStrictEqual(res.body, { error: 'Already owned', owned: true });
  assert.strictEqual(created.length, 0);
});

test('guard: a current member cannot start a second membership', async () => {
  const { handler, created } = loadRoute(GUARD_ENV);
  const res = await callWithPurchases(handler, { product: 'ai_membership', ui: 'embedded' },
    [{ product: 'ai_membership', status: 'past_due' }]);
  assert.strictEqual(res.statusCode, 409);
  assert.strictEqual(created.length, 0);
});

test('guard: refunded / canceled rows never block a purchase', async () => {
  const { handler, created } = loadRoute(GUARD_ENV);
  const res = await callWithPurchases(handler, { product: 'muscle_gain', ui: 'embedded' }, [
    { product: 'muscle_gain', status: 'refunded' },
    { product: 'ai_membership', status: 'canceled' },
  ]);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(created.length, 1);
});

test('guard: a member may still buy a Program standalone (survives a lapse)', async () => {
  const { handler, created } = loadRoute(GUARD_ENV);
  const res = await callWithPurchases(handler, { product: 'muscle_gain', ui: 'embedded' },
    [{ product: 'ai_membership', status: 'active' }]);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(created.length, 1);
});

test('guard: fails open when purchases cannot be read', async () => {
  const { handler, created } = loadRoute(GUARD_ENV);
  const res = await callWithPurchases(handler, { product: 'muscle_gain', ui: 'embedded' }, null, { purchasesOk: false });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(created.length, 1);
});

test('checkout page explains a 409 instead of showing a generic error', () => {
  const page = read('checkout.html');
  assert.match(page, /res\.status === 409/);
  assert.match(page, /You already have this — no charge was made\./);
});
