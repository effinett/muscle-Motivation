/* Phase 4.3.7 — personalization-core.js
 *
 * The engine is the only thing that decides what a new user's starting setup
 * is, so these tests pin BEHAVIOUR, not implementation: the ranking hierarchy,
 * the honesty rules (no reason code without a real, discriminating input), the
 * degradation path for every missing field, and purity.
 *
 * The catalog fixture mirrors the three PUBLISHED production rows exactly —
 * including the en dash in "Beginner – Intermediate" and the fact that every
 * Program is "Any Setup" — so a test passing here means the real catalog
 * behaves the same way. */

const test = require('node:test');
const assert = require('node:assert');

const P = require('./personalization-core.js');

/* ── fixtures ─────────────────────────────────────────────────────────────── */

// Mirrors public.programs as normalized by program-catalog.js pcNormalizeProgram.
function catalog() {
  return [
    { slug: 'fat_loss_blueprint', name: '90 Day Fat Loss Blueprint', goal: 'fatloss',
      difficulty: 'Beginner – Intermediate', durationWeeks: 12,
      recommendedDaysPerWeek: 4, equipmentSummary: 'Any Setup',
      includedWithMembership: true, standalonePurchasable: true,
      status: 'published', sortOrder: 1, pagePath: 'program-fat-loss.html' },
    { slug: 'muscle_gain', name: 'Muscle Gain', goal: 'muscle',
      difficulty: 'Beginner', durationWeeks: 8,
      recommendedDaysPerWeek: 3, equipmentSummary: 'Any Setup',
      includedWithMembership: true, standalonePurchasable: true,
      status: 'published', sortOrder: 2, pagePath: 'program-muscle-gain.html' },
    { slug: 'glute_builder', name: 'Glute Builder', goal: 'muscle',
      difficulty: 'All Levels', durationWeeks: 8,
      recommendedDaysPerWeek: 3, equipmentSummary: 'Any Setup',
      includedWithMembership: true, standalonePurchasable: true,
      status: 'published', sortOrder: 3, pagePath: 'program-glute-builder.html' },
  ];
}

// A complete, freshly-onboarded profile.
function completeProfile(over) {
  return Object.assign({
    full_name: 'Jordan',
    age: 32, gender: 'male',
    height_cm: 177.8, weight_lbs: 185, body_fat_pct: 22,
    goal: 'fatloss', timeline: 'steady',
    activity_level: 1.35, training_days: 4,
    training_experience: 'beginner', gym_access: 'full_gym',
    maintenance_calories: 2600, target_calories: 2100,
    protein_target: 167, fat_target: 58, carb_target: 234,
    training_split: 'Upper / Lower Split',
    goal_weight_lbs: 165, onboarding_complete: true,
    active_program: null,
  }, over || {});
}

function derive(profile, over) {
  return P.derivePersonalizedStart(profile,
    Object.assign({ catalog: catalog() }, over || {}));
}

function slug(plan) {
  return plan.training.recommendedProgram && plan.training.recommendedProgram.slug;
}

/* ── 1–2 · goal drives the recommendation ─────────────────────────────────── */

test('fat-loss goal recommends the fat-loss Program', () => {
  const plan = derive(completeProfile({ goal: 'fatloss' }));
  assert.strictEqual(slug(plan), 'fat_loss_blueprint');
  assert.ok(plan.training.reasons.includes(P.REASON.GOAL_MATCH));
  assert.strictEqual(plan.training.status, P.STATUS.READY);
});

test('muscle goal recommends a muscle Program', () => {
  const plan = derive(completeProfile({ goal: 'muscle', training_days: 3 }));
  assert.strictEqual(plan.training.recommendedProgram.goal, 'muscle');
  assert.ok(plan.training.reasons.includes(P.REASON.GOAL_MATCH));
});

/* ── 3–4 · the hierarchy: schedule breaks ties, never beats goal ──────────── */

test('exact training-day fit wins when goal rank is equal', () => {
  // Both muscle Programs recommend 3 days; the fat-loss Program recommends 4.
  // A muscle user training 3 days must get a 3-day Program.
  const plan = derive(completeProfile({ goal: 'muscle', training_days: 3 }));
  assert.strictEqual(plan.training.recommendedProgram.recommendedDaysPerWeek, 3);
  assert.ok(plan.training.reasons.includes(P.REASON.TRAINING_DAYS_MATCH));
});

test('a mismatched goal never outranks a matched goal on schedule alone', () => {
  // 3 training days is an EXACT fit for both muscle Programs and off-by-one
  // for the fat-loss Program. A fat-loss user must still get fat loss.
  const plan = derive(completeProfile({ goal: 'fatloss', training_days: 3 }));
  assert.strictEqual(slug(plan), 'fat_loss_blueprint');
  assert.ok(plan.training.reasons.includes(P.REASON.GOAL_MATCH));
  // ...and it must NOT claim a schedule match it does not have.
  assert.ok(!plan.training.reasons.includes(P.REASON.TRAINING_DAYS_MATCH));
});

test('recomp resolves to muscle first, and never claims an exact goal match', () => {
  const plan = derive(completeProfile({ goal: 'recomp', training_days: 3 }));
  assert.strictEqual(plan.training.recommendedProgram.goal, 'muscle');
  assert.ok(plan.training.reasons.includes(P.REASON.GOAL_PARTIAL_MATCH));
  assert.ok(!plan.training.reasons.includes(P.REASON.GOAL_MATCH));
  // A partial match is still a real goal signal, so training is ready.
  assert.strictEqual(plan.training.status, P.STATUS.READY);
});

test('recomp ranks fat loss above nothing, below muscle', () => {
  assert.ok(P.goalRank('recomp', 'muscle') > P.goalRank('recomp', 'fatloss'));
  assert.ok(P.goalRank('recomp', 'fatloss') > P.goalRank('recomp', 'nonsense'));
  assert.ok(P.goalRank('fatloss', 'fatloss') > P.goalRank('recomp', 'muscle'));
});

/* ── 5 · difficulty mapping is explicit and deterministic ─────────────────── */

test('difficulty maps to experience levels exactly, en dash included', () => {
  const fatLoss = catalog()[0];   // 'Beginner – Intermediate'
  assert.strictEqual(P.experienceFit('beginner', fatLoss), 1);
  assert.strictEqual(P.experienceFit('intermediate', fatLoss), 1);
  assert.strictEqual(P.experienceFit('advanced', fatLoss), -1);
  // 'All Levels' suits everyone.
  assert.strictEqual(P.experienceFit('advanced', catalog()[2]), 1);
});

test('an unknown difficulty string is no signal, never a mismatch', () => {
  const odd = Object.assign(catalog()[1], { difficulty: 'Elite Powerbuilding' });
  assert.strictEqual(P.experienceFit('beginner', odd), 0);
  assert.strictEqual(P.experienceFit('advanced', odd), 0);
});

test('experience breaks a tie between two equally-matched Programs', () => {
  // Both muscle Programs: goal equal, 3 days equal. muscle_gain is 'Beginner'
  // (excludes advanced), glute_builder is 'All Levels' (includes it).
  const adv = derive(completeProfile(
    { goal: 'muscle', training_days: 3, training_experience: 'advanced' }));
  assert.strictEqual(slug(adv), 'glute_builder');
  assert.ok(adv.training.reasons.includes(P.REASON.EXPERIENCE_MATCH));

  // A beginner suits both, so experience stops discriminating and catalog
  // order decides — and no experience reason is claimed.
  const beg = derive(completeProfile(
    { goal: 'muscle', training_days: 3, training_experience: 'beginner' }));
  assert.strictEqual(slug(beg), 'muscle_gain');
  assert.ok(!beg.training.reasons.includes(P.REASON.EXPERIENCE_MATCH));
});

test('experience below a Program level is a warning, not a rejection', () => {
  // Advanced fat-loss user: the fat-loss Program still wins on goal, but the
  // level gap is surfaced honestly instead of silently swallowed.
  const plan = derive(completeProfile(
    { goal: 'fatloss', training_experience: 'advanced' }));
  assert.strictEqual(slug(plan), 'fat_loss_blueprint');
  assert.ok(plan.warnings.includes(P.WARNING.EXPERIENCE_MISMATCH));
  assert.ok(!plan.training.reasons.includes(P.REASON.EXPERIENCE_MATCH));
});

/* ── 6 · equipment mapping is deterministic and never falsely claimed ─────── */

test('equipment maps deterministically', () => {
  const any = catalog()[0];                                    // 'Any Setup'
  assert.strictEqual(P.equipmentFit('bodyweight', any), 1);
  assert.strictEqual(P.equipmentFit('full_gym', any), 1);

  const gymOnly = Object.assign(catalog()[1], { equipmentSummary: 'Full Gym' });
  assert.strictEqual(P.equipmentFit('full_gym', gymOnly), 1);
  assert.strictEqual(P.equipmentFit('bodyweight', gymOnly), -1);
  assert.strictEqual(P.equipmentFit(null, gymOnly), 0);        // no signal
});

test('equipment earns no reason code while every Program is "Any Setup"', () => {
  // The real catalog: equipment agrees with everything, so it explains
  // nothing about why THIS Program was picked and must stay silent.
  const plan = derive(completeProfile({ gym_access: 'bodyweight' }));
  assert.ok(!plan.training.reasons.includes(P.REASON.EQUIPMENT_MATCH));
  assert.ok(!plan.warnings.includes(P.WARNING.EQUIPMENT_MISMATCH));
});

test('equipment earns its reason code once it actually discriminates', () => {
  const list = catalog();
  list[1].equipmentSummary = 'Full Gym';     // muscle_gain needs a gym
  list[2].equipmentSummary = 'Bodyweight';   // glute_builder does not
  const plan = P.derivePersonalizedStart(
    completeProfile({ goal: 'muscle', training_days: 3, gym_access: 'bodyweight',
      training_experience: 'beginner' }),
    { catalog: list });
  assert.strictEqual(slug(plan), 'glute_builder');
  assert.ok(plan.training.reasons.includes(P.REASON.EQUIPMENT_MATCH));
});

/* ── 7 · recommendation is independent of access ──────────────────────────── */

test('an inaccessible Program is still the best-fit recommendation', () => {
  const plan = derive(completeProfile({ goal: 'fatloss' }), { accessibleSlugs: [] });
  assert.strictEqual(slug(plan), 'fat_loss_blueprint');
  assert.strictEqual(plan.training.recommendedProgram.accessible, false);
});

test('owning a different Program never changes the ranking', () => {
  const withAccess = derive(completeProfile({ goal: 'fatloss' }),
    { accessibleSlugs: ['glute_builder'] });
  const without = derive(completeProfile({ goal: 'fatloss' }));
  assert.strictEqual(slug(withAccess), slug(without));
  assert.deepStrictEqual(withAccess.training.reasons, without.training.reasons);
  assert.strictEqual(withAccess.training.recommendedProgram.accessible, false);
});

test('omitting accessibleSlugs reports "not evaluated", not "no access"', () => {
  const plan = derive(completeProfile());
  assert.strictEqual(plan.training.recommendedProgram.accessible, null);
});

/* ── 8–9 · degradation ────────────────────────────────────────────────────── */

test('no catalog yields a partial result with nutrition intact', () => {
  const plan = P.derivePersonalizedStart(completeProfile(), { catalog: [] });
  assert.strictEqual(plan.training.recommendedProgram, null);
  assert.ok(plan.warnings.includes(P.WARNING.NO_CATALOG));
  // Nutrition is unaffected by a catalog failure.
  assert.strictEqual(plan.nutrition.status, P.STATUS.READY);
  assert.strictEqual(plan.nutrition.calories, 2100);
  assert.strictEqual(plan.status, P.STATUS.PARTIAL);
});

test('a missing context object does not throw', () => {
  const plan = P.derivePersonalizedStart(completeProfile(), null);
  assert.strictEqual(plan.training.recommendedProgram, null);
  assert.strictEqual(plan.nutrition.calories, 2100);
});

test('missing goal degrades and never invents a recommendation reason', () => {
  const plan = derive(completeProfile({ goal: null }));
  assert.ok(plan.missing.includes('goal'));
  assert.ok(plan.warnings.includes(P.WARNING.NO_GOAL));
  assert.strictEqual(plan.training.status, P.STATUS.PARTIAL);
  assert.strictEqual(plan.status, P.STATUS.PARTIAL);
  // A recommendation may still exist (ranked by schedule) but must not claim
  // any goal reason.
  assert.ok(!plan.training.reasons.includes(P.REASON.GOAL_MATCH));
  assert.ok(!plan.training.reasons.includes(P.REASON.GOAL_PARTIAL_MATCH));
});

test('an invalid legacy goal value is treated as no goal', () => {
  const plan = derive(completeProfile({ goal: 'bulking' }));
  assert.strictEqual(plan.goal, null);
  assert.ok(plan.warnings.includes(P.WARNING.NO_GOAL));
});

test('a null profile produces needs_input rather than throwing', () => {
  const plan = derive(null);
  assert.strictEqual(plan.status, P.STATUS.NEEDS_INPUT);
  assert.strictEqual(plan.nutrition.calories, null);
  assert.strictEqual(plan.goal, null);
  assert.deepStrictEqual(plan.focus, { id: 'set_goal', field: 'goal' });
});

test('missing training days is recorded and never guessed', () => {
  const plan = derive(completeProfile({ training_days: null }));
  assert.strictEqual(plan.training.trainingDays, null);
  assert.ok(plan.missing.includes('training_days'));
  assert.ok(plan.warnings.includes(P.WARNING.NO_TRAINING_DAYS));
  assert.ok(!plan.training.reasons.includes(P.REASON.TRAINING_DAYS_MATCH));
  // Goal still decides, so the recommendation survives.
  assert.strictEqual(slug(plan), 'fat_loss_blueprint');
});

test('training_days = 0 is a real answer, not a missing one', () => {
  const plan = derive(completeProfile({ training_days: 0 }));
  assert.strictEqual(plan.training.trainingDays, 0);
  assert.ok(!plan.missing.includes('training_days'));
  assert.deepStrictEqual(plan.focus, { id: 'start_training', field: 'training_days' });
});

/* ── 10–11 · nutrition is READ, never recomputed ──────────────────────────── */

test('nutrition targets are the persisted values verbatim', () => {
  const plan = derive(completeProfile({
    target_calories: 1987, protein_target: 173,
    maintenance_calories: 2487, carb_target: 201, fat_target: 55,
  }));
  assert.strictEqual(plan.nutrition.calories, 1987);
  assert.strictEqual(plan.nutrition.protein, 173);
  assert.strictEqual(plan.nutrition.maintenance, 2487);
  assert.strictEqual(plan.nutrition.carbs, 201);
  assert.strictEqual(plan.nutrition.fat, 55);
  // Deficit restates the stored relationship; it does not re-derive it.
  assert.strictEqual(plan.nutrition.direction, 'deficit');
  assert.strictEqual(plan.nutrition.delta, 500);
});

test('a surplus is reported as a surplus', () => {
  const plan = derive(completeProfile({
    goal: 'muscle', maintenance_calories: 2600, target_calories: 2850,
  }));
  assert.strictEqual(plan.nutrition.direction, 'surplus');
  assert.strictEqual(plan.nutrition.delta, 250);
});

test('missing targets degrade without fabricating a number', () => {
  const plan = derive(completeProfile({ target_calories: null, protein_target: null }));
  assert.strictEqual(plan.nutrition.status, P.STATUS.NEEDS_INPUT);
  assert.strictEqual(plan.nutrition.calories, null);
  assert.strictEqual(plan.nutrition.protein, null);
  assert.strictEqual(plan.nutrition.direction, null);
  assert.ok(plan.warnings.includes(P.WARNING.NO_TARGETS));
  assert.strictEqual(plan.status, P.STATUS.PARTIAL);   // training still resolved
});

test('one target present is partial, not ready', () => {
  const plan = derive(completeProfile({ protein_target: null }));
  assert.strictEqual(plan.nutrition.status, P.STATUS.PARTIAL);
  assert.ok(plan.warnings.includes(P.WARNING.PARTIAL_TARGETS));
  assert.ok(plan.missing.includes('protein_target'));
});

test('no maintenance value means no deficit claim', () => {
  const plan = derive(completeProfile({ maintenance_calories: null }));
  assert.strictEqual(plan.nutrition.calories, 2100);
  assert.strictEqual(plan.nutrition.direction, null);
  assert.strictEqual(plan.nutrition.delta, null);
});

/* ── 12 · determinism and stable tie-breaking ─────────────────────────────── */

test('ranking is stable regardless of input order', () => {
  const forward = catalog();
  const reversed = catalog().reverse();
  const profile = completeProfile({ goal: 'muscle', training_days: 3 });
  const a = P.derivePersonalizedStart(profile, { catalog: forward });
  const b = P.derivePersonalizedStart(profile, { catalog: reversed });
  assert.strictEqual(slug(a), slug(b));
  assert.deepStrictEqual(
    a.training.alternatives.map((x) => x.slug),
    b.training.alternatives.map((x) => x.slug));
});

test('identical inputs always produce an identical plan', () => {
  const profile = completeProfile();
  const a = JSON.stringify(derive(profile));
  for (let i = 0; i < 5; i++) assert.strictEqual(JSON.stringify(derive(profile)), a);
});

test('a full sort_order tie falls back to slug', () => {
  const flat = catalog().map((p) => Object.assign({}, p, {
    goal: 'muscle', sortOrder: 0, difficulty: 'All Levels',
    recommendedDaysPerWeek: 3,
  }));
  const plan = P.derivePersonalizedStart(
    completeProfile({ goal: 'muscle', training_days: 3 }), { catalog: flat });
  assert.strictEqual(slug(plan), 'fat_loss_blueprint');   // alphabetically first
});

test('a catalog row with no slug is skipped, not crashed on', () => {
  const list = catalog().concat([{ name: 'Broken', goal: 'fatloss' }, null]);
  const plan = P.derivePersonalizedStart(completeProfile(), { catalog: list });
  assert.strictEqual(slug(plan), 'fat_loss_blueprint');
});

/* ── 13–14 · purity ───────────────────────────────────────────────────────── */

test('the profile object is never mutated', () => {
  const profile = completeProfile();
  const before = JSON.stringify(profile);
  derive(profile);
  P.buildPersonalContext(profile, { catalog: catalog() });
  assert.strictEqual(JSON.stringify(profile), before);
});

test('the catalog is never mutated', () => {
  const list = catalog();
  const before = JSON.stringify(list);
  P.derivePersonalizedStart(completeProfile(), { catalog: list });
  assert.strictEqual(JSON.stringify(list), before);
});

test('the returned plan holds no reference into the caller\'s catalog', () => {
  const list = catalog();
  const plan = P.derivePersonalizedStart(completeProfile(), { catalog: list });
  plan.training.recommendedProgram.name = 'MUTATED';
  assert.strictEqual(list[0].name, '90 Day Fat Loss Blueprint');
});

/* ── 15 · no I/O, no clock, no randomness ─────────────────────────────────── */

test('the module requires nothing that could reach the network or DOM', () => {
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, 'personalization-core.js'), 'utf8');
  [/\bfetch\s*\(/, /supabaseClient/, /\bdocument\b/, /XMLHttpRequest/,
    /Math\.random/, /\bDate\.now\b/, /new Date\(/, /localStorage/, /sessionStorage/,
    /anthropic/i, /require\(/].forEach((re) => {
    assert.ok(!re.test(src), 'personalization-core.js must not contain ' + re);
  });
});

/* ── focus: one honest next priority ──────────────────────────────────────── */

test('focus points at the first genuinely missing setup step', () => {
  assert.strictEqual(derive(completeProfile({ goal: null })).focus.id, 'set_goal');
  assert.strictEqual(
    derive(completeProfile({ target_calories: null })).focus.id, 'set_targets');
  assert.strictEqual(
    derive(completeProfile({ training_days: null })).focus.id, 'set_training_days');
});

test('a complete profile with no active program is nudged to choose one', () => {
  const plan = derive(completeProfile());
  assert.strictEqual(plan.focus.id, 'choose_program');
  assert.strictEqual(plan.focus.slug, 'fat_loss_blueprint');
});

test('a fully set-up user gets no manufactured focus', () => {
  const plan = derive(completeProfile({ active_program: 'fat_loss_blueprint' }));
  assert.strictEqual(plan.focus, null);
  assert.strictEqual(plan.status, P.STATUS.READY);
});

/* ── 4.3.7F · personal context layer ──────────────────────────────────────── */

test('personal context reports stated facts and derived plan, nothing else', () => {
  const ctx = P.buildPersonalContext(completeProfile(), { catalog: catalog() });
  assert.strictEqual(ctx.identity.name, 'Jordan');
  assert.strictEqual(ctx.body.weightLbs, 185);
  assert.strictEqual(ctx.goal.key, 'fatloss');
  assert.strictEqual(ctx.targets.calories, 2100);
  assert.strictEqual(ctx.training.daysPerWeek, 4);
  assert.strictEqual(ctx.training.experience, 'beginner');
  assert.strictEqual(ctx.training.recommendedProgram, 'fat_loss_blueprint');
  assert.strictEqual(ctx.status, P.STATUS.READY);
});

test('personal context reports unknown as null, never a default', () => {
  const ctx = P.buildPersonalContext(
    { id: 'x', onboarding_complete: false }, { catalog: catalog() });
  assert.strictEqual(ctx.identity.name, null);
  assert.strictEqual(ctx.body.weightLbs, null);
  assert.strictEqual(ctx.goal, null);
  assert.strictEqual(ctx.targets.calories, null);
  assert.strictEqual(ctx.training.daysPerWeek, null);
  assert.strictEqual(ctx.training.experience, null);
  assert.strictEqual(ctx.onboardingComplete, false);
  assert.ok(ctx.missing.includes('goal'));
});

test('personal context is re-derived, so a profile edit cannot go stale', () => {
  const profile = completeProfile();
  const before = P.buildPersonalContext(profile, { catalog: catalog() });
  assert.strictEqual(before.training.recommendedProgram, 'fat_loss_blueprint');

  profile.goal = 'muscle';
  profile.training_days = 3;
  const after = P.buildPersonalContext(profile, { catalog: catalog() });
  assert.strictEqual(after.training.recommendedProgram, 'muscle_gain');
  assert.strictEqual(after.goal.key, 'muscle');
});

/* ── legacy / existing-user compatibility ─────────────────────────────────── */

test('a legacy profile with no experience or gym access still resolves', () => {
  // Every one of the 12 production profiles is in exactly this state today:
  // the two 4.3.7A columns are NULL.
  const legacy = completeProfile({ training_experience: null, gym_access: null });
  const plan = derive(legacy);
  assert.strictEqual(slug(plan), 'fat_loss_blueprint');
  assert.strictEqual(plan.status, P.STATUS.READY);
  // NULL is no signal: it must not appear as a mismatch warning or a reason.
  assert.ok(!plan.warnings.includes(P.WARNING.EXPERIENCE_MISMATCH));
  assert.ok(!plan.warnings.includes(P.WARNING.EQUIPMENT_MISMATCH));
  assert.ok(!plan.training.reasons.includes(P.REASON.EXPERIENCE_MATCH));
  assert.ok(!plan.training.reasons.includes(P.REASON.EQUIPMENT_MATCH));
});

test('a pre-onboarding profile row degrades to needs_input', () => {
  // The two production rows with onboarding_complete = false.
  const plan = derive({ id: 'legacy', onboarding_complete: false });
  assert.strictEqual(plan.status, P.STATUS.NEEDS_INPUT);
  assert.strictEqual(plan.nutrition.status, P.STATUS.NEEDS_INPUT);
  assert.ok(plan.missing.includes('goal'));
  assert.ok(plan.missing.includes('target_calories'));
});

test('changing training days re-ranks where the goal allows it', () => {
  const three = derive(completeProfile({ goal: 'muscle', training_days: 3 }));
  const six = derive(completeProfile({ goal: 'muscle', training_days: 6 }));
  // Both muscle Programs recommend 3 days, so the goal still decides and the
  // pick is stable — but the schedule reason must disappear at 6 days.
  assert.ok(three.training.reasons.includes(P.REASON.TRAINING_DAYS_MATCH));
  assert.ok(!six.training.reasons.includes(P.REASON.TRAINING_DAYS_MATCH));
});

test('reason codes are drawn only from the published vocabulary', () => {
  const known = Object.keys(P.REASON).map((k) => P.REASON[k]);
  [{}, completeProfile(), completeProfile({ goal: 'recomp' }),
    completeProfile({ goal: null }), completeProfile({ training_days: 0 }),
  ].forEach((profile) => {
    derive(profile).training.reasons.forEach((r) => {
      assert.ok(known.includes(r), 'unknown reason code: ' + r);
    });
  });
});

test('warning codes are drawn only from the published vocabulary', () => {
  const known = Object.keys(P.WARNING).map((k) => P.WARNING[k]);
  [{}, completeProfile({ goal: null, target_calories: null, protein_target: null,
    training_days: null, training_experience: 'advanced' }),
  ].forEach((profile) => {
    derive(profile).warnings.forEach((w) => {
      assert.ok(known.includes(w), 'unknown warning code: ' + w);
    });
  });
});
