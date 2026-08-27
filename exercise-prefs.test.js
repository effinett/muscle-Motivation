/* Phase 4.3.6J — exercise-prefs.js
 *
 * Covers the §37 data-model and §38 recents matrices that are decidable purely.
 * The load-bearing assertions are the identity ones: a legacy name-only row can
 * never become a favorite or a canonical recent, and an inactive/archived item
 * never returns to the picker. Row-level security is proven live, not here. */

'use strict';
const test = require('node:test');
const assert = require('node:assert');

const Prefs = require('./exercise-prefs');
const {
  identityKey, canFavorite, favoriteRow, favoriteMatch, indexFavorites,
  isFavorited, sortFavorites, buildFavorites, buildRecents, buildCatalogs,
  shouldShowShortcuts, LIMITS
} = Prefs;

const CANON_A = '11111111-1111-4111-8111-111111111111';
const CANON_B = '22222222-2222-4222-8222-222222222222';
const CUSTOM_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const USER = 'user-1';

const canonical = [
  { id: CANON_A, name: 'Bench Press', category: 'Horizontal Push', equipment: 'Barbell' },
  { id: CANON_B, name: 'Dumbbell Press', category: 'Horizontal Push', equipment: 'Dumbbell' },
  { id: 'inactive-1', name: 'Retired Move', category: 'X', equipment: 'Barbell', is_active: false }
];
const customs = [
  { id: CUSTOM_A, name: 'Effi Special Curl', category: null, archived_at: null },
  { id: 'archived-1', name: 'Old Custom', category: null, archived_at: '2026-01-01T00:00:00Z' }
];
const catalogs = buildCatalogs(canonical, customs);

const canonRef = { name: 'Bench Press', exerciseId: CANON_A, customId: null };
const customRef = { name: 'Effi Special Curl', exerciseId: null, customId: CUSTOM_A };
const legacyRef = { name: 'Bench Press', exerciseId: null, customId: null };

/* ── 1 + 2 + 7 + 10. identity keys and favoritability ────────────────────── */

test('canonical and custom references are favoritable; legacy is not', () => {
  assert.strictEqual(canFavorite(canonRef), true);
  assert.strictEqual(canFavorite(customRef), true);
  assert.strictEqual(canFavorite(legacyRef), false);
  assert.strictEqual(canFavorite({ name: 'x', exerciseId: CANON_A, customId: CUSTOM_A }), false);
  assert.strictEqual(canFavorite(null), false);
});

test('identity keys never collide across kinds', () => {
  assert.strictEqual(identityKey(canonRef), 'canon:' + CANON_A);
  assert.strictEqual(identityKey(customRef), 'custom:' + CUSTOM_A);
  assert.notStrictEqual(identityKey(canonRef), identityKey(customRef));
  assert.strictEqual(identityKey(legacyRef), null);
});

test('a legacy reference produces no insertable row — it cannot reach the DB', () => {
  assert.strictEqual(favoriteRow(legacyRef, USER), null);
  assert.strictEqual(favoriteMatch(legacyRef), null);
  assert.strictEqual(favoriteRow({ name: 'x', exerciseId: CANON_A, customId: CUSTOM_A }, USER), null);
});

test('favorite rows populate exactly one identity column (the DB XOR check)', () => {
  const c = favoriteRow(canonRef, USER);
  assert.deepStrictEqual(c, { user_id: USER, exercise_id: CANON_A, user_exercise_id: null });
  const u = favoriteRow(customRef, USER);
  assert.deepStrictEqual(u, { user_id: USER, exercise_id: null, user_exercise_id: CUSTOM_A });
  [c, u].forEach((r) => {
    const set = [r.exercise_id, r.user_exercise_id].filter((v) => v != null);
    assert.strictEqual(set.length, 1, 'exactly one identity column');
  });
});

test('favoriteMatch mirrors favoriteRow so unfavorite targets the same row', () => {
  assert.deepStrictEqual(favoriteMatch(canonRef), { column: 'exercise_id', value: CANON_A });
  assert.deepStrictEqual(favoriteMatch(customRef), { column: 'user_exercise_id', value: CUSTOM_A });
});

test('a favorite row carries no name — a rename cannot break or stale it', () => {
  const r = favoriteRow(canonRef, USER);
  assert.ok(!('name' in r) && !('exercise_name' in r));
  assert.deepStrictEqual(Object.keys(r).sort(), ['exercise_id', 'user_exercise_id', 'user_id']);
});

/* ── 3. duplicate favorite is idempotent at the model level ───────────────── */

test('the same exercise favorited twice indexes and renders once', () => {
  const rows = [
    { exercise_id: CANON_A, created_at: '2026-08-01T00:00:00Z' },
    { exercise_id: CANON_A, created_at: '2026-08-02T00:00:00Z' }
  ];
  const idx = indexFavorites(rows);
  assert.strictEqual(Object.keys(idx).length, 1);
  const built = buildFavorites(rows, catalogs);
  assert.strictEqual(built.filter((f) => f.key === 'canon:' + CANON_A).length, 2,
    'the builder renders what it is given — the DB partial unique is what prevents the duplicate row');
});

test('isFavorited reads membership by identity, never by name', () => {
  const idx = indexFavorites([{ exercise_id: CANON_A }, { user_exercise_id: CUSTOM_A }]);
  assert.strictEqual(isFavorited(idx, canonRef), true);
  assert.strictEqual(isFavorited(idx, customRef), true);
  assert.strictEqual(isFavorited(idx, legacyRef), false, 'same NAME as a favorite, but no id');
  assert.strictEqual(isFavorited(idx, { exerciseId: CANON_B }), false);
});

/* ── 16. favorites ordering ───────────────────────────────────────────────── */

test('favorites list most-recently-favorited first, deterministically', () => {
  const rows = [
    { exercise_id: CANON_A, created_at: '2026-08-01T00:00:00Z' },
    { user_exercise_id: CUSTOM_A, created_at: '2026-08-03T00:00:00Z' },
    { exercise_id: CANON_B, created_at: '2026-08-02T00:00:00Z' }
  ];
  const got = buildFavorites(rows, catalogs).map((f) => f.name);
  assert.deepStrictEqual(got, ['Effi Special Curl', 'Dumbbell Press', 'Bench Press']);
  // Input order must not matter.
  const shuffled = buildFavorites(rows.slice().reverse(), catalogs).map((f) => f.name);
  assert.deepStrictEqual(got, shuffled);
});

test('equal timestamps break on identity key, never on input order', () => {
  const t = '2026-08-01T00:00:00Z';
  const a = sortFavorites([{ exercise_id: CANON_B, created_at: t }, { exercise_id: CANON_A, created_at: t }]);
  const b = sortFavorites([{ exercise_id: CANON_A, created_at: t }, { exercise_id: CANON_B, created_at: t }]);
  assert.deepStrictEqual(a.map((r) => r.exercise_id), b.map((r) => r.exercise_id));
});

/* ── 9 + 34. inactive canonical is omitted, preference row preserved ──────── */

test('an inactive canonical favorite is omitted from the picker, not remapped', () => {
  const rows = [{ exercise_id: 'inactive-1', created_at: '2026-08-05T00:00:00Z' },
                { exercise_id: CANON_A, created_at: '2026-08-01T00:00:00Z' }];
  const got = buildFavorites(rows, catalogs);
  assert.deepStrictEqual(got.map((f) => f.name), ['Bench Press']);
  // The stored row is untouched — omission is a display decision only.
  assert.strictEqual(rows.length, 2);
});

test('an unknown canonical id is dropped rather than rendered from a stored name', () => {
  const got = buildFavorites([{ exercise_id: 'ghost-id', created_at: '2026-08-05T00:00:00Z' }], catalogs);
  assert.deepStrictEqual(got, []);
});

/* ── 8 + 35. archived / deleted customs ───────────────────────────────────── */

test('an archived custom favorite is omitted', () => {
  const got = buildFavorites([{ user_exercise_id: 'archived-1', created_at: '2026-08-05T00:00:00Z' }], catalogs);
  assert.deepStrictEqual(got, []);
});

test('a deleted custom (absent from the catalog) is omitted, not resurrected by name', () => {
  const got = buildFavorites([{ user_exercise_id: 'deleted-999', created_at: '2026-08-05T00:00:00Z' }], catalogs);
  assert.deepStrictEqual(got, []);
});

/* ══════════════════════════════════════════════════════════════════════════
 * RECENTS — §38
 * ══════════════════════════════════════════════════════════════════════ */

const usage = (over) => Object.assign({ exerciseId: null, customId: null, name: '' }, over);

/* ── 11 + 13 + 14 + 15. ordering, dedupe, identity ───────────────────────── */

test('recents preserve newest-first order from the caller', () => {
  const got = buildRecents([
    usage({ exerciseId: CANON_B, name: 'Dumbbell Press' }),
    usage({ exerciseId: CANON_A, name: 'Bench Press' })
  ], catalogs);
  assert.deepStrictEqual(got.map((r) => r.name), ['Dumbbell Press', 'Bench Press']);
});

test('a repeated exercise appears once, at its NEWEST occurrence', () => {
  const got = buildRecents([
    usage({ exerciseId: CANON_A, name: 'Bench Press' }),      // newest
    usage({ exerciseId: CANON_B, name: 'Dumbbell Press' }),
    usage({ exerciseId: CANON_A, name: 'Bench Press' })       // older duplicate
  ], catalogs);
  assert.deepStrictEqual(got.map((r) => r.name), ['Bench Press', 'Dumbbell Press']);
  assert.strictEqual(got.filter((r) => r.name === 'Bench Press').length, 1);
});

test('canonical and custom identity are both preserved and kept distinct', () => {
  const got = buildRecents([
    usage({ customId: CUSTOM_A, name: 'Effi Special Curl' }),
    usage({ exerciseId: CANON_A, name: 'Bench Press' })
  ], catalogs);
  assert.deepStrictEqual(got.map((r) => r.kind), ['custom', 'canonical']);
  assert.strictEqual(got[0].customId, CUSTOM_A);
  assert.strictEqual(got[0].exerciseId, null);
  assert.strictEqual(got[1].exerciseId, CANON_A);
  assert.strictEqual(got[1].customId, null);
});

/* ── 16. legacy is never guessed ──────────────────────────────────────────── */

test('a legacy name-only usage is dropped, never matched to a canonical exercise', () => {
  const got = buildRecents([
    usage({ name: 'Bench Press' }),                            // legacy: no ids
    usage({ exerciseId: CANON_B, name: 'Dumbbell Press' })
  ], catalogs);
  assert.deepStrictEqual(got.map((r) => r.name), ['Dumbbell Press']);
  assert.ok(!got.some((r) => r.name === 'Bench Press'),
    'a legacy row whose NAME matches a canonical exercise must not resolve to it');
});

test('a dual-id usage row is dropped rather than treated as canonical', () => {
  const got = buildRecents([usage({ exerciseId: CANON_A, customId: CUSTOM_A })], catalogs);
  assert.deepStrictEqual(got, []);
});

/* ── 17 + 18. inactive canonical, deleted custom ─────────────────────────── */

test('an inactive canonical exercise is omitted from recents', () => {
  const got = buildRecents([
    usage({ exerciseId: 'inactive-1', name: 'Retired Move' }),
    usage({ exerciseId: CANON_A, name: 'Bench Press' })
  ], catalogs);
  assert.deepStrictEqual(got.map((r) => r.name), ['Bench Press']);
});

test('an archived or deleted custom does not become selectable again', () => {
  const got = buildRecents([
    usage({ customId: 'archived-1', name: 'Old Custom' }),
    usage({ customId: 'deleted-999', name: 'Gone Custom' }),
    usage({ exerciseId: CANON_A, name: 'Bench Press' })
  ], catalogs);
  assert.deepStrictEqual(got.map((r) => r.name), ['Bench Press']);
});

/* ── 19. limit ────────────────────────────────────────────────────────────── */

test('recents are capped at the documented short limit', () => {
  const many = [];
  for (let i = 0; i < 40; i++) many.push(usage({ exerciseId: CANON_A + '-' + i }));
  const cat = buildCatalogs(many.map((u, i) => ({ id: CANON_A + '-' + i, name: 'Ex ' + i })), []);
  const got = buildRecents(many, cat);
  assert.strictEqual(got.length, LIMITS.recents);
  assert.strictEqual(LIMITS.recents, 8);
  assert.strictEqual(buildRecents(many, cat, { limit: 3 }).length, 3);
});

test('dedupe happens before the limit, so the list is 8 DISTINCT exercises', () => {
  const many = [];
  for (let i = 0; i < 20; i++) { many.push(usage({ exerciseId: CANON_A })); }
  for (let i = 0; i < 10; i++) { many.push(usage({ exerciseId: CANON_B })); }
  const got = buildRecents(many, catalogs);
  assert.deepStrictEqual(got.map((r) => r.name), ['Bench Press', 'Dumbbell Press']);
});

/* ── 20. no mutation of inputs ────────────────────────────────────────────── */

test('neither builder mutates the rows it is given (history is never touched)', () => {
  const usages = [usage({ exerciseId: CANON_A, name: 'Bench Press' })];
  const favs = [{ exercise_id: CANON_A, created_at: '2026-08-01T00:00:00Z' }];
  const uSnap = JSON.stringify(usages), fSnap = JSON.stringify(favs);
  buildRecents(usages, catalogs);
  buildFavorites(favs, catalogs);
  sortFavorites(favs);
  assert.strictEqual(JSON.stringify(usages), uSnap);
  assert.strictEqual(JSON.stringify(favs), fSnap);
});

/* ── §17 picker behaviour + robustness ───────────────────────────────────── */

test('shortcuts show only on an empty query — search results own a typed list', () => {
  assert.strictEqual(shouldShowShortcuts(''), true);
  assert.strictEqual(shouldShowShortcuts('   '), true);
  assert.strictEqual(shouldShowShortcuts(null), true);
  assert.strictEqual(shouldShowShortcuts(undefined), true);
  assert.strictEqual(shouldShowShortcuts('bench'), false);
  assert.strictEqual(shouldShowShortcuts(' b '), false);
});

test('malformed input never throws', () => {
  [null, undefined, [], [null], [{}], 'nope', 42].forEach((bad) => {
    assert.ok(Array.isArray(buildRecents(bad, catalogs)));
    assert.ok(Array.isArray(buildFavorites(bad, catalogs)));
    assert.ok(typeof indexFavorites(bad) === 'object');
  });
  assert.ok(Array.isArray(buildRecents([usage({ exerciseId: CANON_A })], null)));
  assert.ok(buildCatalogs(null, null).canonicalById);
});

test('identityType agrees with exercise-log (personalization never forks identity)', () => {
  const ExerciseLog = require('./exercise-log');
  [canonRef, customRef, legacyRef, { name: 'x', exerciseId: CANON_A, customId: CUSTOM_A }]
    .forEach((r) => assert.strictEqual(Prefs.identityType(r), ExerciseLog.identityType(r)));
});
