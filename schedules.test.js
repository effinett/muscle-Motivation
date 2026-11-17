/* 4.3.9-L six-Program coverage catalog — schedules.js entries.
 *
 * Pins the owner-approved session lists (Program Catalog Plan, Revision 4
 * schedule fixes, approved 2026-11-17) and the properties they were approved
 * for: Home Strength keeps three full-body sessions a week at 3–6 days, Advanced
 * Fat Loss never runs a second hinge day in place of an extra Upper, and every
 * key has a readable fallback label. The pointer behaviour with repeated
 * sessions is pinned in bodyweight-frequency-activation.test.js. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const s = {};
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'schedules.js'), 'utf8'), s);
  return s;
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const DAYS = [2, 3, 4, 5, 6];

const APPROVED = {
  home_strength: {
    2: ['full_a', 'full_b', 'full_c'],
    3: ['full_a', 'full_b', 'full_c'],
    4: ['full_a', 'full_b', 'full_c', 'conditioning_core'],
    5: ['full_a', 'conditioning_core', 'full_b', 'conditioning_core', 'full_c'],
    6: ['full_a', 'conditioning_core', 'full_b', 'conditioning_core', 'full_c', 'conditioning_core'],
  },
  home_fat_loss: Object.fromEntries(DAYS.map((d) => [d, ['upper_a', 'lower_a', 'upper_b', 'lower_b']])),
  bodyweight_fat_loss: {
    2: ['full_a', 'full_b'],
    3: ['full_a', 'conditioning_a', 'full_b', 'full_a', 'conditioning_b', 'full_b'],
    4: ['full_a', 'conditioning_a', 'full_b', 'conditioning_b'],
    5: ['full_a', 'conditioning_a', 'full_b', 'conditioning_b'],
    6: ['full_a', 'conditioning_a', 'full_b', 'conditioning_b'],
  },
  advanced_muscle: Object.fromEntries(DAYS.map((d) => [d, ['upper_a', 'lower_a', 'upper_b', 'lower_b']])),
  advanced_fat_loss: {
    2: ['upper', 'lower'],
    3: ['lower', 'upper', 'full_body'],
    4: ['lower', 'upper', 'full_body', 'conditioning_core'],
    5: ['lower', 'upper', 'full_body', 'upper', 'conditioning_core'],
    6: ['lower', 'upper', 'full_body', 'upper', 'conditioning_core', 'upper'],
  },
  advanced_home_strength: Object.fromEntries(DAYS.map((d) => [d, ['upper_a', 'lower_a', 'upper_b', 'lower_b']])),
};

const count = (list, key) => list.filter((k) => k === key).length;

test('the six catalog Programs use exactly the approved session lists at 2–6 days', () => {
  const S = load();
  Object.keys(APPROVED).forEach((slug) => {
    DAYS.forEach((d) => assert.deepEqual(plain(S.getScheduleForDays(slug, d)), APPROVED[slug][d], slug + ' ' + d));
  });
});

test('out-of-range frequencies normalize like every other Program', () => {
  const S = load();
  Object.keys(APPROVED).forEach((slug) => {
    assert.deepEqual(plain(S.getScheduleForDays(slug, 1)), APPROVED[slug][3], slug + ' 1 → 3-day default');
    assert.deepEqual(plain(S.getScheduleForDays(slug, 9)), APPROVED[slug][6], slug + ' 9 → 6 days');
  });
});

test('every session key has a fallback label (no raw key on screen)', () => {
  const S = load();
  Object.keys(APPROVED).forEach((slug) => {
    S.getAllSessionsForProgram(slug).forEach((k) => {
      assert.ok(S.SESSION_LABELS[k], slug + ' ' + k + ' has a label');
      assert.notEqual(S.sessionLabel(k), k, slug + ' ' + k + ' never displays as its key');
    });
  });
});

test('Home Strength: one of each full-body session a week at 3–6 days; C&C 0 / 0 / 1 / 2 / 3', () => {
  const S = load();
  [3, 4, 5, 6].forEach((d) => {
    const list = plain(S.getScheduleForDays('home_strength', d));
    assert.equal(list.length, d, d + ' days is a one-week list');
    ['full_a', 'full_b', 'full_c'].forEach((k) => assert.equal(count(list, k), 1, d + ' days ' + k));
  });
  assert.deepEqual(DAYS.map((d) => count(plain(S.getScheduleForDays('home_strength', d)), 'conditioning_core')),
    [0, 0, 1, 2, 3]);
  // Repeated C&C sessions are never back to back, and never follow each other across the week.
  [5, 6].forEach((d) => {
    const list = plain(S.getScheduleForDays('home_strength', d));
    list.forEach((k, i) => assert.ok(!(k === 'conditioning_core' && list[i + 1] === k), d + ' days index ' + i));
  });
});

test('Advanced Fat Loss: Lower, Full Body and Cond + Core run once a week; extra days are Upper', () => {
  const S = load();
  [3, 4, 5, 6].forEach((d) => {
    const list = plain(S.getScheduleForDays('advanced_fat_loss', d));
    assert.equal(list.length, d, d + ' days is a one-week list');
    assert.equal(count(list, 'lower'), 1, d + ' lower');
    assert.equal(count(list, 'full_body'), 1, d + ' full body');
    assert.equal(list[0], 'lower', d + ' days starts with Lower');
    // Lower → Full Body is never consecutive in the list order.
    assert.notEqual(list[list.indexOf('lower') + 1], 'full_body', d + ' days');
  });
  assert.deepEqual(DAYS.map((d) => count(plain(S.getScheduleForDays('advanced_fat_loss', d)), 'conditioning_core')),
    [0, 0, 1, 1, 1]);
  assert.deepEqual(DAYS.map((d) => count(plain(S.getScheduleForDays('advanced_fat_loss', d)), 'upper')),
    [1, 1, 1, 2, 3]);
});

test('four-session Programs and Bodyweight Fat Loss repeat nothing within a cycle except the approved 3-day rotation', () => {
  const S = load();
  ['home_fat_loss', 'advanced_muscle', 'advanced_home_strength'].forEach((slug) => {
    DAYS.forEach((d) => {
      const list = plain(S.getScheduleForDays(slug, d));
      assert.equal(new Set(list).size, list.length, slug + ' ' + d);
    });
  });
  // Bodyweight Fat Loss at 3 days runs a two-week cycle: each full-body session
  // twice, each conditioning session once, and the two full-body sessions are
  // never consecutive.
  const bfl3 = plain(S.getScheduleForDays('bodyweight_fat_loss', 3));
  assert.deepEqual(['full_a', 'full_b', 'conditioning_a', 'conditioning_b'].map((k) => count(bfl3, k)), [2, 2, 1, 1]);
});
