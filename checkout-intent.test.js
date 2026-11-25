/* checkout-intent.js — a signed-out buyer returns to checkout after sign-in. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CI = require('./checkout-intent.js');
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

function fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _m: m,
  };
}

test('read: round-trips a valid slug inside the TTL', () => {
  const now = 1_000_000;
  assert.strictEqual(CI.read(CI.serialize('muscle_gain', now), now + 1000), 'muscle_gain');
});

test('read: stale, future-dated, malformed and invalid intents are ignored', () => {
  const now = 1_000_000;
  assert.strictEqual(CI.read(CI.serialize('muscle_gain', now), now + CI.TTL_MS + 1), null);
  assert.strictEqual(CI.read(CI.serialize('muscle_gain', now + 5000), now), null);
  assert.strictEqual(CI.read('not json', now), null);
  assert.strictEqual(CI.read('', now), null);
  assert.strictEqual(CI.read(null, now), null);
  assert.strictEqual(CI.read(JSON.stringify({ slug: 'x', at: 'later' }), now), null);
});

test('only a slug is accepted, so no URL can ever be produced from storage', () => {
  for (const bad of ['https://evil.example', '//evil', '../app', 'Muscle_Gain', 'a b', 'a?x=1', '', null, 7]) {
    assert.strictEqual(CI.isValidSlug(bad), false, String(bad));
    assert.strictEqual(CI.checkoutUrl(bad), null);
  }
  assert.strictEqual(CI.read(JSON.stringify({ slug: 'https://evil.example', at: 1 }), 1), null);
  assert.strictEqual(CI.checkoutUrl('glute_builder'), 'checkout.html?product=glute_builder');
});

test('destination: pending checkout wins, otherwise the fallback', () => {
  assert.strictEqual(CI.destination('fat_loss_blueprint', 'app.html'), 'checkout.html?product=fat_loss_blueprint');
  assert.strictEqual(CI.destination(null, 'app.html'), 'app.html');
});

test('save/take: read once, so Back from checkout cannot loop', () => {
  const prev = global.sessionStorage;
  global.sessionStorage = fakeStorage();
  try {
    assert.strictEqual(CI.save('ai_membership', 100), true);
    assert.strictEqual(CI.next('app.html', 200), 'checkout.html?product=ai_membership');
    assert.strictEqual(CI.next('app.html', 300), 'app.html', 'consumed');
    assert.strictEqual(CI.save('not a slug', 100), false);
    assert.strictEqual(global.sessionStorage._m.size, 0);
  } finally {
    if (prev === undefined) delete global.sessionStorage; else global.sessionStorage = prev;
  }
});

test('storage failure degrades to the normal route, never throws', () => {
  const prev = global.sessionStorage;
  global.sessionStorage = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  try {
    assert.strictEqual(CI.save('muscle_gain', 1), false);
    assert.strictEqual(CI.next('app.html', 1), 'app.html');
  } finally {
    if (prev === undefined) delete global.sessionStorage; else global.sessionStorage = prev;
  }
});

test('wiring: signed-out Buy saves the intent before sending to sign-in', () => {
  for (const f of ['store.html', 'checkout.html']) {
    const src = read(f);
    assert.match(src, /<script src="checkout-intent\.js"><\/script>/, f);
    assert.match(src, /CheckoutIntent\.save\(slug, Date\.now\(\)\)/, f);
  }
});

test('wiring: every post-auth dashboard exit honours a pending checkout', () => {
  for (const f of ['auth.html', 'onboarding.html']) {
    const src = read(f);
    assert.match(src, /<script src="checkout-intent\.js"><\/script>/, f);
    assert.match(src, /CheckoutIntent\.next\('app\.html', Date\.now\(\)\)/, f);
  }
  const ob = read('onboarding.html');
  assert.strictEqual((ob.match(/window\.location\.replace\('app\.html'\)/g) || []).length, 0,
    'onboarding must not bypass homeAfterAuth()');
  assert.strictEqual((ob.match(/window\.location\.replace\(homeAfterAuth\(\)\)/g) || []).length, 4);
  assert.doesNotMatch(read('auth.html'), /window\.location\.href = 'app\.html'/);
});

test('signed-in checkout clears any leftover intent', () => {
  assert.match(read('checkout.html'), /CheckoutIntent\.clear\(\)/);
});
