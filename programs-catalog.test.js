/* ──────────────────────────────────────────────────────────────────────────
 * Phase 4.3.6 CP1a — canonical Program catalog contract
 *
 * CI is offline and holds no secrets, so these tests cannot query Supabase.
 * Instead CATALOG below MIRRORS the rows CP1a seeded into public.programs —
 * the same pattern benchmarks/exercise-fixtures.js uses to mirror the
 * exercises table id-for-id.
 *
 * CP1b retired PROGRAM_META, PROGRAM_URLS, GOAL_PROGRAM_MAP and the
 * schedules.js PROGRAM_NAMES map, so the earlier drift tests against those
 * constants are replaced by single-source guards: the constants must stay
 * gone, and no second canonical Program metadata source may reappear.
 * ──────────────────────────────────────────────────────────────────────── */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { GOAL_LABELS, pgGoalMismatch } = require('./program-state.js');
const {
  pcNormalizeProgram, pcNormalizeCatalog, pcSortCatalog, pcBySlug, pcByGoal,
  pcProgramName, pcPagePath, pcIsProgramProduct,
} = require('./program-catalog.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

// Source with comments stripped. Guards that assert "this module must not do
// X" have to inspect CODE — otherwise a doc comment explaining that X belongs
// elsewhere trips the very test that documents the boundary.
const readCode = (f) => read(f)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/* Mirrors public.programs as seeded by migration create_programs_catalog. */
const CATALOG = [
  { slug: 'fat_loss_blueprint', name: '90 Day Fat Loss Blueprint',
    description: '12-week fat loss system', goal: 'fatloss',
    difficulty: 'Beginner – Intermediate', duration_weeks: 12,
    recommended_days_per_week: 4, equipment_summary: 'Any Setup',
    included_with_membership: true, standalone_purchasable: true,
    status: 'published', sort_order: 1, page_path: 'program-fat-loss.html' },
  { slug: 'muscle_gain', name: 'Muscle Gain',
    description: '8-week hypertrophy program', goal: 'muscle',
    difficulty: 'Beginner', duration_weeks: 8,
    recommended_days_per_week: 3, equipment_summary: 'Any Setup',
    included_with_membership: true, standalone_purchasable: true,
    status: 'published', sort_order: 2, page_path: 'program-muscle-gain.html' },
  { slug: 'glute_builder', name: 'Glute Builder',
    description: "Women's lower-body program", goal: 'muscle',
    difficulty: 'All Levels', duration_weeks: 8,
    recommended_days_per_week: 3, equipment_summary: 'Any Setup',
    included_with_membership: true, standalone_purchasable: true,
    status: 'published', sort_order: 3, page_path: 'program-glute-builder.html' },
];

/* The purchases.product CHECK enum, verbatim from the live constraint. A
 * catalog row is NOT authorization to sell — roadmap §10.9. */
const PURCHASES_PRODUCT_ENUM = [
  'fat_loss_blueprint', 'muscle_gain', 'glute_builder', 'ai_membership',
];

const bySlug = (s) => CATALOG.find((p) => p.slug === s);

/* ── 1 · shape and identity ─────────────────────────────────────────────── */

test('catalog: exactly the three shipped Programs, no speculative rows', () => {
  assert.strictEqual(CATALOG.length, 3);
  assert.deepStrictEqual(CATALOG.map((p) => p.slug).sort(),
    ['fat_loss_blueprint', 'glute_builder', 'muscle_gain']);
});

test('catalog: slugs are unique', () => {
  const slugs = CATALOG.map((p) => p.slug);
  assert.strictEqual(new Set(slugs).size, slugs.length);
});

test('catalog: planned Programs are absent until they are real identities', () => {
  // Home Strength / Full Gym Strength stay planned roadmap content (4.3.6K).
  for (const p of CATALOG) {
    assert.ok(!/home_strength|full_gym/.test(p.slug), `unexpected row ${p.slug}`);
  }
});

/* ── 2 · owner decision R2 (2026-08-21) ─────────────────────────────────── */

test('R2: all three are membership-included AND standalone-purchasable', () => {
  for (const p of CATALOG) {
    assert.strictEqual(p.included_with_membership, true, `${p.slug} membership`);
    assert.strictEqual(p.standalone_purchasable, true, `${p.slug} standalone`);
    assert.strictEqual(p.status, 'published', `${p.slug} status`);
  }
});

/* ── 3 · the three approved metadata decisions ──────────────────────────── */

test('decision: Fat Loss keeps the "90 Day" name but duration_weeks = 12', () => {
  const p = bySlug('fat_loss_blueprint');
  assert.strictEqual(p.duration_weeks, 12, 'not 13 — no mathematical conversion');
  assert.match(p.name, /^90 Day /, 'the established product name is preserved');
  assert.ok(!/12 Week/i.test(p.name), 'the product was NOT silently renamed');
});

test('decision: Glute Builder goal = muscle, reusing the existing taxonomy', () => {
  assert.strictEqual(bySlug('glute_builder').goal, 'muscle');
  for (const p of CATALOG) {
    assert.ok(p.goal !== 'glutes', 'no new glutes taxonomy was created');
  }
});

test('decision: Muscle Gain canonical name is exactly "Muscle Gain"', () => {
  assert.strictEqual(bySlug('muscle_gain').name, 'Muscle Gain');
});

/* ── 4 · vocabulary and sell-ability invariants ─────────────────────────── */

test('catalog: every goal uses the live GOAL_LABELS vocabulary', () => {
  for (const p of CATALOG) {
    assert.ok(Object.hasOwn(GOAL_LABELS, p.goal),
      `${p.slug} goal "${p.goal}" is outside the established taxonomy`);
  }
});

test('catalog: sellable slugs stay a subset of the purchases.product CHECK', () => {
  // Roadmap §10.9 — a catalog row is not a licence to sell. Adding a
  // standalone_purchasable slug outside this enum requires a DDL migration
  // and explicit owner approval.
  for (const p of CATALOG) {
    if (!p.standalone_purchasable) continue;
    assert.ok(PURCHASES_PRODUCT_ENUM.includes(p.slug),
      `${p.slug} is sellable but absent from the purchases.product CHECK`);
  }
});

test('catalog: status values are constrained', () => {
  for (const p of CATALOG) {
    assert.ok(['draft', 'published', 'retired'].includes(p.status));
  }
});

/* ── 5 · CP1b · single canonical source ─────────────────────────────────── */

test('CP1b: the retired constants are gone from program-state.js', () => {
  const src = read('program-state.js');
  for (const dead of ['PROGRAM_META', 'PROGRAM_URLS', 'GOAL_PROGRAM_MAP']) {
    assert.ok(!new RegExp(`var ${dead}\\s*=`).test(src),
      `${dead} still defines Program metadata — second canonical source`);
  }
});

test('CP1b: schedules.js no longer holds Program display names', () => {
  const src = read('schedules.js');
  assert.ok(!/var PROGRAM_NAMES\s*=/.test(src),
    'PROGRAM_NAMES had already drifted ("90-Day" vs "90 Day") — it must not return');
  assert.ok(!/function programName/.test(src),
    'programName now lives in program-catalog.js');
});

test('CP1b: schedules.js keeps what it owns — schedules and session labels', () => {
  const src = read('schedules.js');
  assert.match(src, /var PROGRAM_SCHEDULES\s*=/, 'execution schedules stay here');
  assert.match(src, /var SESSION_LABELS\s*=/, 'session labels stay here');
});

test('CP1b: exactly one module defines programName', () => {
  const defs = ['program-catalog.js', 'program-state.js', 'schedules.js',
    'workout-history.js', 'dashboard-model.js']
    .filter((f) => /function programName/.test(read(f)));
  assert.deepStrictEqual(defs, ['program-catalog.js']);
});

test('CP1b: GOAL_LABELS survives — it is user goal vocabulary, not catalog', () => {
  // profile.html renders the USER's own profiles.goal with this. Programs
  // merely reuse the same words; retiring it would break an unrelated surface.
  assert.deepStrictEqual(Object.keys(GOAL_LABELS).sort(),
    ['fatloss', 'muscle', 'recomp']);
  assert.match(read('profile.html'), /GOAL_LABELS\[/, 'still consumed by profile');
});

/* ── 6 · CP1b · catalog interpretation ──────────────────────────────────── */

const ROWS = CATALOG.map((p) => ({
  slug: p.slug, name: p.name, description: p.description, goal: p.goal,
  difficulty: p.difficulty, duration_weeks: p.duration_weeks,
  recommended_days_per_week: p.recommended_days_per_week,
  equipment_summary: p.equipment_summary,
  included_with_membership: p.included_with_membership,
  standalone_purchasable: p.standalone_purchasable,
  status: p.status, sort_order: p.sort_order, page_path: p.page_path,
}));
const NORM = pcNormalizeCatalog(ROWS);

test('loader: normalization maps every catalog column', () => {
  const p = pcBySlug(NORM, 'fat_loss_blueprint');
  assert.strictEqual(p.name, '90 Day Fat Loss Blueprint');
  assert.strictEqual(p.durationWeeks, 12);
  assert.strictEqual(p.recommendedDaysPerWeek, 4);
  assert.strictEqual(p.equipmentSummary, 'Any Setup');
  assert.strictEqual(p.includedWithMembership, true);
  assert.strictEqual(p.standalonePurchasable, true);
  assert.strictEqual(p.pagePath, 'program-fat-loss.html');
});

test('loader: a malformed row is dropped, not thrown on', () => {
  assert.strictEqual(pcNormalizeProgram(null), null);
  assert.strictEqual(pcNormalizeProgram({ name: 'no slug' }), null);
  assert.strictEqual(pcNormalizeCatalog([null, { slug: 'x' }]).length, 1);
});

test('loader: an unnamed row falls back to its slug, never blank', () => {
  assert.strictEqual(pcNormalizeProgram({ slug: 'x' }).name, 'x');
});

test('lookup: slug lookup, including misses', () => {
  assert.strictEqual(pcBySlug(NORM, 'muscle_gain').name, 'Muscle Gain');
  assert.strictEqual(pcBySlug(NORM, 'nope'), null);
  assert.strictEqual(pcBySlug(NORM, null), null);
});

test('lookup: goal lookup reproduces the retired GOAL_PROGRAM_MAP exactly', () => {
  // Legacy: { fatloss: 'fat_loss_blueprint', muscle: 'muscle_gain' }.
  // glute_builder also has goal=muscle, so lowest sort_order must win.
  assert.strictEqual(pcByGoal(NORM, 'fatloss').slug, 'fat_loss_blueprint');
  assert.strictEqual(pcByGoal(NORM, 'muscle').slug, 'muscle_gain');
  assert.strictEqual(pcByGoal(NORM, 'recomp'), null, 'legacy map had no recomp');
  assert.strictEqual(pcByGoal(NORM, null), null);
});

test('lookup: goal tie-break is sort_order, not array order', () => {
  const reversed = pcNormalizeCatalog(ROWS.slice().reverse());
  assert.strictEqual(pcByGoal(reversed, 'muscle').slug, 'muscle_gain');
});

test('lookup: page path', () => {
  assert.strictEqual(pcPagePath(NORM, 'glute_builder'), 'program-glute-builder.html');
  assert.strictEqual(pcPagePath(NORM, 'nope'), null);
});

test('lookup: programName returns "" for unknown slugs, as before', () => {
  assert.strictEqual(pcProgramName(NORM, 'glute_builder'), 'Glute Builder');
  assert.strictEqual(pcProgramName(NORM, 'nope'), '');
  assert.strictEqual(pcProgramName([], 'muscle_gain'), '');
});

test('lookup: program-vs-membership product test replaces PROGRAM_META[product]', () => {
  assert.strictEqual(pcIsProgramProduct(NORM, 'muscle_gain'), true);
  assert.strictEqual(pcIsProgramProduct(NORM, 'ai_membership'), false,
    'membership is not a Program — it must not appear in owned programs');
});

test('sort: catalog order is deterministic', () => {
  assert.deepStrictEqual(pcSortCatalog(NORM).map((p) => p.slug),
    ['fat_loss_blueprint', 'muscle_gain', 'glute_builder']);
});

/* ── 7 · CP1b · parity of the migrated behaviour ────────────────────────── */

test('parity: pgGoalMismatch behaves as it did on GOAL_PROGRAM_MAP', () => {
  const owned = ['fat_loss_blueprint', 'muscle_gain'];
  const m = pgGoalMismatch('muscle', 'fat_loss_blueprint', owned, NORM);
  assert.strictEqual(m.slug, 'muscle_gain');
  assert.strictEqual(m.name, 'Muscle Gain');
  assert.strictEqual(m.goalLabel, 'Muscle Gain');

  assert.strictEqual(pgGoalMismatch('muscle', 'muscle_gain', owned, NORM), null,
    'no nudge when it is already active');
  assert.strictEqual(pgGoalMismatch('muscle', 'fat_loss_blueprint', ['fat_loss_blueprint'], NORM), null,
    'no nudge for a program the user does not own');
  assert.strictEqual(pgGoalMismatch('recomp', null, owned, NORM), null,
    'recomp maps to no program, as before');
  assert.strictEqual(pgGoalMismatch('muscle', null, owned, []), null,
    'an empty catalog degrades to no nudge rather than throwing');
});

/* ── 8 · CP1b · consumer wiring and performance discipline ──────────────── */

test('wiring: pages that resolve Program state load the catalog first', () => {
  for (const page of ['app.html', 'profile.html']) {
    const src = read(page);
    const cat = src.indexOf('program-catalog.js');
    const state = src.indexOf('program-state.js');
    assert.ok(cat > -1, `${page} loads program-catalog.js`);
    assert.ok(state === -1 || cat < state, `${page} loads the catalog before program-state`);
  }
});

test('perf: Home does not add a sequential catalog round trip', () => {
  // The catalog fetch must ride alongside the purchases query, not before it.
  // 4.3.5F is still unmeasured, so Home's critical path must not grow.
  const src = read('program-state.js');
  assert.match(src, /Promise\.all\(\[\s*\n?\s*pcLoadCatalog\(\)/,
    'pgLoadOwnedPrograms must parallelise the catalog fetch');
  assert.ok(!/await pcLoadCatalog\(\);\s*\n\s*var res = await supabaseClient/.test(src),
    'never sequential');
});

test('perf: session cache means later navigations issue no catalog request', () => {
  const src = read('program-catalog.js');
  assert.match(src, /sessionStorage/, 'session-scoped cache exists');
  assert.match(src, /pcInflight/, 'concurrent callers are deduped in-flight');
});

test('privacy: the cached catalog carries no user data', () => {
  // Roadmap §2.5 governs authenticated/per-user data. The catalog is public
  // product metadata, so caching it is compliant — but only while it stays
  // free of user columns.
  const src = readCode('program-catalog.js');
  assert.ok(!/user_id|auth\.uid|purchases/.test(src),
    'the catalog module must never read user or purchase state');
});

test('scope: CP1b did not take on entitlement enforcement (that is CP2)', () => {
  const src = readCode('program-catalog.js');
  assert.ok(!/hasAccess|canAccess|isEntitled|entitle/i.test(src),
    'access flags are exposed as data only; CP2 owns enforcement');
});

test('scope: the public store page was not migrated to the catalog', () => {
  // store.html serves anonymous visitors and the catalog is RLS-restricted to
  // authenticated users, so a catalog-driven store would render empty when
  // logged out. Its card copy is marketing presentation, not canonical data.
  assert.ok(!/program-catalog\.js/.test(read('store.html')),
    'store.html must stay static for anonymous visitors');
});

/* ── 6 · CP1a scope guard ───────────────────────────────────────────────── */

test('scope: the catalog carries no session/workout prescription content', () => {
  // Premium prescriptions stay in program_workouts behind its entitlement
  // policy. Browse metadata must never carry them (owner decision O2).
  const forbidden = ['exercises', 'sets', 'reps_low', 'reps_high', 'rest_sec',
    'session_key', 'sessions'];
  for (const p of CATALOG) {
    for (const key of forbidden) {
      assert.ok(!Object.hasOwn(p, key),
        `${p.slug} exposes prescription field "${key}" — violates O2`);
    }
  }
});

test('scope: the catalog carries no price (Stripe stays authoritative)', () => {
  for (const p of CATALOG) {
    assert.ok(!Object.hasOwn(p, 'price'), 'price must not be duplicated');
  }
});
