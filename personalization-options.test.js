/* Phase 4.3.9F — "See other options". Presentation over the engine's own
 * ranking: these tests prove there is no second ranking, nothing listed fails
 * the equipment gate, and the copy states catalog facts only. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const P = require('./personalization-core.js');
const PC = require('./program-catalog.js');

const ROWS = [
  { slug: 'fat_loss_blueprint', name: '90 Day Fat Loss Blueprint', goal: 'fatloss', difficulty: 'Beginner – Intermediate', duration_weeks: 12, recommended_days_per_week: 4, equipment_summary: 'Full Gym', status: 'published', sort_order: 1, page_path: 'program-fat-loss.html' },
  { slug: 'muscle_gain', name: 'Muscle Gain', goal: 'muscle', difficulty: 'Beginner – Intermediate', duration_weeks: 8, recommended_days_per_week: 3, equipment_summary: 'Full Gym', status: 'published', sort_order: 2, page_path: 'program-muscle-gain.html' },
  { slug: 'glute_builder', name: 'Glute Builder', goal: 'muscle', difficulty: 'Beginner – Intermediate', duration_weeks: 8, recommended_days_per_week: 3, equipment_summary: 'Full Gym', status: 'published', sort_order: 3, page_path: 'program-glute-builder.html' },
  { slug: 'bodyweight_foundations', name: 'Bodyweight Foundations', goal: 'muscle', difficulty: 'Beginner – Intermediate', duration_weeks: 8, recommended_days_per_week: 3, equipment_summary: 'Bodyweight', status: 'published', sort_order: 4, page_path: 'program-bodyweight.html' },
];
const CATALOG = PC.pcNormalizeCatalog(ROWS);
const plan = (profile) => P.derivePersonalizedStart(profile, { catalog: CATALOG });

test('other options are the engine\'s own alternatives, in order, capped at two', () => {
  const p = plan({ goal: 'muscle', gym_access: 'full_gym', training_days: 3 });
  assert.equal(P.OTHER_OPTIONS_MAX, 2);
  assert.deepStrictEqual(P.otherOptions(p).map((o) => o.slug), p.training.alternatives.slice(0, 2).map((o) => o.slug));
  assert.deepStrictEqual(P.otherOptions(p, 5).map((o) => o.slug), p.training.alternatives.map((o) => o.slug));
});

test('across every onboarding combination, an option is never the pick and never fails the equipment gate', () => {
  for (const goal of ['fatloss', 'recomp', 'muscle']) for (const exp of ['beginner', 'intermediate', 'advanced'])
    for (const gym of ['full_gym', 'home_basic', 'bodyweight']) for (const days of [2, 3, 4, 5, 6]) {
      const p = plan({ goal, training_experience: exp, gym_access: gym, training_days: days });
      const pick = p.training.recommendedProgram;
      for (const o of P.otherOptions(p, 10)) {
        assert.notEqual(o.slug, pick && pick.slug);
        const supported = P.EQUIPMENT_ACCESS[String(o.equipmentSummary).toLowerCase()];
        assert.ok(supported && supported.includes(gym), o.name + ' must suit ' + gym);
      }
    }
});

test('no recommendation (or an equipment no-fit) means no other options', () => {
  assert.deepStrictEqual(P.otherOptions({ training: { recommendedProgram: null, alternatives: [{ slug: 'x' }] } }), []);
  assert.deepStrictEqual(P.otherOptions(null), []);
  const noCatalog = P.derivePersonalizedStart({ goal: 'muscle', gym_access: 'full_gym' }, { catalog: [] });
  assert.deepStrictEqual(P.otherOptions(noCatalog), []);
});

test('an option states catalog facts, and says so when its goal differs from the user\'s', () => {
  const fat = plan({ goal: 'fatloss', gym_access: 'full_gym', training_days: 4 });
  const opt = P.otherOptions(fat)[0];
  assert.deepStrictEqual(P.describeOption(opt, fat), ['Different goal: Muscle Gain', 'Full Gym', '3 days / week']);
  const muscle = plan({ goal: 'muscle', gym_access: 'full_gym', training_days: 3 });
  assert.deepStrictEqual(P.describeOption(P.otherOptions(muscle)[0], muscle), ['Goal: Muscle Gain', 'Full Gym', '3 days / week']);
  const recomp = plan({ goal: 'recomp', gym_access: 'full_gym', training_days: 3 });
  assert.ok(P.describeOption(P.otherOptions(recomp)[0], recomp).every((x) => !/Different goal/.test(x)),
    'recomp accepts muscle Programs, so they are not a different goal');
  assert.deepStrictEqual(P.describeOption(null), []);
});

test('Train and onboarding render the options; Home stays a one-line hero', () => {
  const W = fs.readFileSync(path.join(__dirname, 'workout.html'), 'utf8');
  assert.match(W, /Personalization\.otherOptions\(plan\)/);
  assert.match(W, />See other options<\/button>/);
  assert.match(W, /function toggleOtherOptions\(btn\)/);
  assert.match(W, /aria-expanded/);
  const O = fs.readFileSync(path.join(__dirname, 'onboarding.html'), 'utf8');
  assert.match(O, /id="ob-rOtherOptions"/);
  assert.match(O, /'Other options: '/);
  const A = fs.readFileSync(path.join(__dirname, 'app.html'), 'utf8');
  assert.ok(!/otherOptions/.test(A));
});
