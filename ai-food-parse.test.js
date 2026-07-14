// Regression tests for /api/ai-food-parse guards: method, config, auth,
// input caps, and the FAIL-CLOSED daily cap (the cost-control contract).
// Run via `npm test` (node --test). No network: Supabase auth/REST and the
// Anthropic endpoint are stubbed at global.fetch. The model call itself is
// covered by exercising the failure path (a connection error must map to a
// friendly 502) and by asserting the structured-output schema stays
// nutrition-free (CLAUDE.md §11).

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const ROUTE_PATH = path.join(__dirname, 'api', 'ai-food-parse.js');

function makeRes() {
  const res = { statusCode: null, body: null, headers: {} };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

function freshRoute() {
  delete require.cache[require.resolve(ROUTE_PATH)];
  return require(ROUTE_PATH);
}

// Stub state driven per-test.
const state = { used: 0, inserts: 0, insertOk: true };

function installFetchStub() {
  global.fetch = async (url, opts) => {
    const u = String(url);
    opts = opts || {};
    if (u.includes('/auth/v1/user')) {
      const token = (opts.headers.Authorization || '').replace('Bearer ', '');
      if (token === 'good') return { ok: true, json: async () => ({ id: 'user-1' }) };
      return { ok: false };
    }
    if (u.includes('/rest/v1/ai_usage')) {
      if (opts.method === 'HEAD') {
        return { ok: true, headers: { get: () => `0-${state.used - 1}/${state.used}` } };
      }
      if (opts.method === 'POST') { state.inserts++; return { ok: state.insertOk }; }
    }
    // Anything else (the Anthropic endpoint) fails like a network error —
    // the route must map it to a friendly 502, never a crash.
    throw new Error('unexpected fetch ' + u);
  };
}

test('GET → 405 with Allow header', async () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon';
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const route = freshRoute();
  const res = makeRes();
  await route({ method: 'GET', headers: {} }, res);
  assert.strictEqual(res.statusCode, 405);
  assert.strictEqual(res.headers.Allow, 'POST');
});

test('missing ANTHROPIC_API_KEY / service key → 500 not-configured', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const route = freshRoute();
  const res = makeRes();
  await route({ method: 'POST', headers: {}, body: { text: 'eggs' } }, res);
  assert.strictEqual(res.statusCode, 500);
});

test('auth, caps, and fail-closed behavior', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test-not-real';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  const route = freshRoute();
  installFetchStub();

  // bad token → 401
  let res = makeRes();
  await route({ method: 'POST', headers: { authorization: 'Bearer bad' }, body: { text: 'eggs' } }, res);
  assert.strictEqual(res.statusCode, 401);

  // input caps → 400
  res = makeRes();
  await route({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { text: ' ' } }, res);
  assert.strictEqual(res.statusCode, 400, 'empty text');
  res = makeRes();
  await route({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { text: 'x'.repeat(301) } }, res);
  assert.strictEqual(res.statusCode, 400, 'over 300 chars');

  // at the daily limit → 429, and NO usage row is inserted
  state.used = 30; state.inserts = 0; state.insertOk = true;
  res = makeRes();
  await route({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { text: '2 eggs' } }, res);
  assert.strictEqual(res.statusCode, 429);
  assert.strictEqual(state.inserts, 0, 'no usage row at the limit');

  // usage insert failing → 503 FAIL CLOSED (no spend without a record)
  state.used = 3; state.insertOk = false;
  res = makeRes();
  await route({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { text: '2 eggs' } }, res);
  assert.strictEqual(res.statusCode, 503);

  // under the limit: usage recorded BEFORE the model call; a model
  // connection failure maps to a friendly 502
  state.used = 3; state.insertOk = true; state.inserts = 0;
  res = makeRes();
  await route({ method: 'POST', headers: { authorization: 'Bearer good' }, body: { text: '2 eggs and toast' } }, res);
  assert.strictEqual(state.inserts, 1, 'usage row recorded before spend');
  assert.strictEqual(res.statusCode, 502);
  assert.ok(res.body.error.includes('normally'), 'friendly fallback message');
});

test('parse schema stays nutrition-free (§11) and exposes the harness surface', () => {
  process.env.ANTHROPIC_API_KEY = 'sk-test-not-real';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
  const route = freshRoute();
  const { PARSE_SCHEMA, SYSTEM_PROMPT, parseFoods } = route._internals;

  assert.strictEqual(typeof parseFoods, 'function');
  const itemSchema = PARSE_SCHEMA.properties.items.items;
  assert.deepStrictEqual(itemSchema.required, ['text', 'query', 'brand', 'quantity', 'unit', 'grams']);
  assert.ok(!JSON.stringify(PARSE_SCHEMA).match(/calorie|protein|carb|fat/i),
    'schema must not contain nutrition fields');
  assert.ok(SYSTEM_PROMPT.includes('never output calories'));
  // meal values must match the client's NU_MEALS ('snack', not 'snacks')
  const mealEnum = PARSE_SCHEMA.properties.meal.anyOf[0].enum;
  assert.deepStrictEqual(mealEnum, ['breakfast', 'lunch', 'dinner', 'snack']);
});
