/* ──────────────────────────────────────────────────────────────────────────
 * Phase 4.3.6 CP1a — canonical Program catalog contract
 *
 * CI is offline and holds no secrets, so these tests cannot query Supabase.
 * Instead CATALOG below MIRRORS the rows CP1a seeded into public.programs —
 * the same pattern benchmarks/exercise-fixtures.js uses to mirror the
 * exercises table id-for-id.
 *
 * The value is drift detection. Until CP1b routes consumers through the
 * catalog, program-state.js remains the LIVE source of program metadata.
 * If someone edits PROGRAM_META or PROGRAM_URLS between now and CP1b, the
 * catalog silently disagrees with production and CP1b changes behaviour
 * without anyone noticing. These tests fail instead.
 * ──────────────────────────────────────────────────────────────────────── */

const test = require('node:test');
const assert = require('node:assert');
const { PROGRAM_META, PROGRAM_URLS, GOAL_LABELS } = require('./program-state.js');

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

/* ── 5 · drift detection against the CURRENT live consumers ─────────────── */
/* program-state.js still owns program metadata in production until CP1b.    */

test('drift: catalog name matches the live PROGRAM_META name', () => {
  for (const p of CATALOG) {
    assert.strictEqual(p.name, PROGRAM_META[p.slug].name,
      `${p.slug} name drifted from PROGRAM_META — reconcile before CP1b`);
  }
});

test('drift: catalog description matches the live PROGRAM_META desc', () => {
  for (const p of CATALOG) {
    assert.strictEqual(p.description, PROGRAM_META[p.slug].desc,
      `${p.slug} description drifted from PROGRAM_META — reconcile before CP1b`);
  }
});

test('drift: catalog page_path matches the live PROGRAM_URLS entry', () => {
  for (const p of CATALOG) {
    assert.strictEqual(p.page_path, PROGRAM_URLS[p.slug],
      `${p.slug} page_path drifted from PROGRAM_URLS — reconcile before CP1b`);
  }
});

test('drift: catalog covers every program PROGRAM_META declares', () => {
  // If a program is added to PROGRAM_META without a catalog row, CP1b would
  // silently drop it from every surface it routes through the catalog.
  assert.deepStrictEqual(Object.keys(PROGRAM_META).sort(),
    CATALOG.map((p) => p.slug).sort());
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
