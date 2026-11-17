/* program-page.js — shared Program page logic (Phase 4.3.9-L). */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const P = require('./program-page.js');

function schedules() {
  const s = {};
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'schedules.js'), 'utf8'), s);
  return s;
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const SIX = ['home_strength', 'home_fat_loss', 'bodyweight_fat_loss',
  'advanced_muscle', 'advanced_fat_loss', 'advanced_home_strength'];
const DAYS = [2, 3, 4, 5, 6];
const rows = (keys) => keys.map((k, i) => ({ session_key: k, name: 'Name ' + k, sort_order: i + 1 }));

/* ── scope ──────────────────────────────────────────────────────────────── */

test('only the six catalog Programs are handled; everything else is null', () => {
  assert.deepEqual(P.CATALOG_SLUGS.slice().sort(), SIX.slice().sort());
  SIX.forEach((s) => assert.equal(P.pagePathFor(s), 'program.html?slug=' + s));
  ['bodyweight_foundations', 'muscle_gain', 'fat_loss_blueprint', 'glute_builder',
    'HOME_STRENGTH', '', null, undefined, {}, 'home_strength ']
    .forEach((s) => {
      assert.equal(P.isCatalogProgram(s), false, String(s));
      assert.equal(P.pagePathFor(s), null, String(s));
      assert.equal(P.weekPlan(s, 4, ['a', 'b', 'c', 'd']), null, String(s));
      assert.equal(P.restNote(s, 'full_body'), null, String(s));
      assert.equal(P.equipmentNote(s), null, String(s));
    });
});

/* ── resolveWeek ────────────────────────────────────────────────────────── */

test('resolveWeek: every approved list resolves in schedule order, repeats included', () => {
  const S = schedules();
  SIX.forEach((slug) => {
    DAYS.forEach((d) => {
      const keys = plain(S.getScheduleForDays(slug, d));
      const linked = rows(S.getAllSessionsForProgram(slug)).reverse();   // DB order never decides
      const r = P.resolveWeek(keys, linked);
      assert.equal(r.ok, true, slug + ' ' + d);
      assert.deepEqual(r.sessions.map((s) => s.session_key), keys, slug + ' ' + d);
      assert.deepEqual(r.sessions.map((s) => s.position), keys.map((_, i) => i + 1));
    });
  });
});

test('resolveWeek: fails closed on a missing, duplicated or malformed Routine; ignores extras', () => {
  const keys = ['full_a', 'conditioning_core', 'full_b', 'conditioning_core', 'full_c'];
  const all = rows(['full_a', 'full_b', 'full_c', 'conditioning_core']);
  assert.equal(P.resolveWeek(keys, all).ok, true);
  assert.deepEqual(plain(P.resolveWeek(keys, all.slice(0, 3))), { ok: false, reason: 'missing' });
  assert.deepEqual(plain(P.resolveWeek(keys, all.concat([{ session_key: 'full_a', name: 'Again' }]))),
    { ok: false, reason: 'duplicate' }, 'two Routines for one key');
  assert.deepEqual(plain(P.resolveWeek(keys, all.concat([]).map((r) => r.session_key === 'full_b' ? { session_key: 'full_b' } : r))),
    { ok: false, reason: 'invalid_loaded' });
  // An unexpected extra linked Routine never renders and never breaks the week.
  const extra = P.resolveWeek(keys, all.concat([{ session_key: 'secret', name: 'Hidden' }, null, { session_key: 'x' }]));
  assert.equal(extra.ok, true);
  assert.ok(!extra.sessions.some((s) => s.session_key === 'secret'));
  [null, [], [''], [1], 'full_a'].forEach((e) =>
    assert.equal(P.resolveWeek(e, all).reason, 'invalid_expected', JSON.stringify(e)));
  assert.equal(P.resolveWeek(keys, null).reason, 'invalid_loaded');
});

/* ── weekPlan ───────────────────────────────────────────────────────────── */

const APPROVED_DAYS = {
  2: ['Mon', 'Thu'], 3: ['Mon', 'Wed', 'Fri'], 4: ['Mon', 'Tue', 'Thu', 'Fri'],
  5: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat'], 6: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

test('weekPlan: suggested weekdays match the approved plan for every Program and frequency', () => {
  const S = schedules();
  SIX.forEach((slug) => {
    DAYS.forEach((d) => {
      const keys = plain(S.getScheduleForDays(slug, d));
      const plan = P.weekPlan(slug, d, keys);
      const wantDays = (slug === 'home_strength' && d === 4) ? ['Mon', 'Wed', 'Fri', 'Sat']
        : (slug === 'advanced_fat_loss' && d === 4) ? ['Mon', 'Tue', 'Thu', 'Sat'] : APPROVED_DAYS[d];
      if (keys.length === d) {
        assert.equal(plan.mode, 'fixed', slug + ' ' + d);
        assert.deepEqual(plan.rows.map((r) => r.day), wantDays, slug + ' ' + d);
        assert.deepEqual(plan.rows.map((r) => r.key), keys, slug + ' ' + d);
      } else {
        assert.equal(plan.mode, 'rotate', slug + ' ' + d);
        assert.deepEqual(plan.days, wantDays, slug + ' ' + d);
        assert.deepEqual(plan.keys, keys, slug + ' ' + d);
      }
    });
  });
});

test('weekPlan: the approved Advanced Fat Loss weeks read exactly as the plan wrote them', () => {
  const S = schedules();
  const line = (d) => P.weekPlan('advanced_fat_loss', d, plain(S.getScheduleForDays('advanced_fat_loss', d)))
    .rows.map((r) => r.day + ' ' + r.key).join(' · ');
  assert.equal(line(2), 'Mon upper · Thu lower');
  assert.equal(line(3), 'Mon lower · Wed upper · Fri full_body');
  assert.equal(line(4), 'Mon lower · Tue upper · Thu full_body · Sat conditioning_core');
  assert.equal(line(5), 'Mon lower · Tue upper · Wed full_body · Fri upper · Sat conditioning_core');
  assert.equal(line(6), 'Mon lower · Tue upper · Wed full_body · Thu upper · Fri conditioning_core · Sat upper');
});

test('weekPlan: an invalid frequency or empty list has no plan', () => {
  [0, 1, 7, 3.5, '4', null, undefined].forEach((d) =>
    assert.equal(P.weekPlan('home_strength', d, ['full_a', 'full_b', 'full_c']), null, String(d)));
  assert.equal(P.weekPlan('home_strength', 3, []), null);
  assert.equal(P.weekPlan('home_strength', 3, null), null);
});

/* ── rest notes and equipment copy ──────────────────────────────────────── */

test('restNote: only Advanced Fat Loss Full Body has a note, worded as approved', () => {
  assert.equal(P.restNote('advanced_fat_loss', 'full_body'),
    'Don’t do this session the day after Lower. Leave at least one day in between. ' +
    'An Upper day or a rest day both count.');
  // 1d removed the Conditioning + Core and Lower notes.
  ['lower', 'upper', 'conditioning_core'].forEach((k) => assert.equal(P.restNote('advanced_fat_loss', k), null, k));
  const S = schedules();
  SIX.filter((s) => s !== 'advanced_fat_loss').forEach((slug) =>
    S.getAllSessionsForProgram(slug).forEach((k) => assert.equal(P.restNote(slug, k), null, slug + ' ' + k)));
});

test('equipmentNote: every Program has copy; home Programs name the approved items; no emojis', () => {
  SIX.forEach((s) => {
    const c = P.equipmentNote(s);
    assert.ok(typeof c === 'string' && c.length > 20, s);
    assert.doesNotMatch(c, /\p{Extended_Pictographic}/u, s + ' has no emoji');
  });
  ['home_strength', 'home_fat_loss', 'advanced_home_strength'].forEach((s) => {
    assert.match(P.equipmentNote(s), /dumbbells/, s);
    assert.match(P.equipmentNote(s), /long resistance band/, s);
    assert.match(P.equipmentNote(s), /door anchor is optional/, s);
  });
  assert.doesNotMatch(P.equipmentNote('home_strength'), /mini band/, 'Home Strength needs no mini band');
  assert.match(P.equipmentNote('home_fat_loss'), /mini band/);
  assert.match(P.equipmentNote('advanced_home_strength'), /mini band/);
  assert.match(P.equipmentNote('bodyweight_fat_loss'), /No equipment/);
});
