/* ──────────────────────────────────────────────────────────────────────────
 * Phase 4.3.7 — personalization integration across the four surfaces
 *
 * The engine's own behaviour is pinned by personalization-core.test.js. This
 * file pins the WIRING and the boundaries the phase promised: nothing
 * auto-enrols, nothing duplicates the nutrition math, no surface invents its
 * own goal→program map, Home stays minimal, and the recommendation is never
 * gated on ownership.
 * ──────────────────────────────────────────────────────────────────────── */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
// Strip styles/comments so a rule named in prose is never mistaken for code.
const readCode = (f) => read(f)
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const ONBOARD = read('onboarding.html');
const ONBOARD_CODE = readCode('onboarding.html');
const HOME = read('app.html');
const HOME_CODE = readCode('app.html');
const TRAIN = read('workout.html');
const TRAIN_CODE = readCode('workout.html');
const PROFILE = read('profile.html');
const PROFILE_CODE = readCode('profile.html');
// Phase 4.3.9-L: the Home browse link is verified against the real parser, so
// a wiring guard cannot pass on a destination Train would not honour.
const AppNav = require('./app-nav.js');
const CORE = read('personalization-core.js');
// The engine's header documents the very things these tests forbid ("no
// user_programs row can ever appear", "no 'optimal'"), so the code assertions
// below must read the CODE, not the prose explaining it.
const CORE_CODE = readCode('personalization-core.js');

const SURFACES = [
  ['onboarding.html', ONBOARD, ONBOARD_CODE],
  ['app.html', HOME, HOME_CODE],
  ['workout.html', TRAIN, TRAIN_CODE],
];

/* ── load order ───────────────────────────────────────────────────────────── */

test('every surface that personalizes loads the engine', () => {
  SURFACES.forEach(([name, src]) => {
    assert.ok(/<script src="personalization-core\.js"><\/script>/.test(src),
      name + ' must load personalization-core.js');
  });
});

test('the engine loads AFTER program-catalog.js wherever a catalog is used', () => {
  SURFACES.forEach(([name, src]) => {
    const catalog = src.indexOf('src="program-catalog.js"');
    const engine = src.indexOf('src="personalization-core.js"');
    assert.ok(catalog >= 0, name + ' must load program-catalog.js');
    assert.ok(catalog < engine,
      name + ' must load program-catalog.js before personalization-core.js');
  });
});

/* ── 4.3.7A · the two new inputs ──────────────────────────────────────────── */

test('onboarding collects experience and gym access with the DB vocabulary', () => {
  ['beginner', 'intermediate', 'advanced'].forEach((v) => {
    assert.ok(ONBOARD.includes('value="' + v + '"'), 'missing experience option ' + v);
  });
  ['full_gym', 'home_basic', 'bodyweight'].forEach((v) => {
    assert.ok(ONBOARD.includes('value="' + v + '"'), 'missing gym access option ' + v);
  });
});

test('both new inputs are optional and persist "" as NULL', () => {
  // A blank first option that maps to null is what keeps "no answer" distinct
  // from a guessed answer all the way down to the column.
  assert.ok(/ob-experience'\)\.value \|\| null/.test(ONBOARD_CODE));
  assert.ok(/ob-gym'\)\.value \|\| null/.test(ONBOARD_CODE));
  assert.ok(/rc-experience'\)\.value \|\| null/.test(PROFILE_CODE));
  assert.ok(/rc-gym'\)\.value \|\| null/.test(PROFILE_CODE));
});

test('onboarding saves the new fields under their real column names', () => {
  assert.ok(/training_experience:\s*experience/.test(ONBOARD_CODE));
  assert.ok(/gym_access:\s*gymAccess/.test(ONBOARD_CODE));
});

test('profile can edit the new fields, so no one redoes onboarding for them', () => {
  assert.ok(PROFILE.includes('id="rc-experience"'));
  assert.ok(PROFILE.includes('id="rc-gym"'));
  assert.ok(/training_experience:\s*document\.getElementById/.test(PROFILE_CODE));
  assert.ok(/gym_access:\s*document\.getElementById/.test(PROFILE_CODE));
});

test('the new inputs stayed out of the calorie and macro math', () => {
  // They must not appear anywhere near the target calculation — this phase
  // changed no nutrition number for anyone.
  const calc = ONBOARD_CODE.slice(ONBOARD_CODE.indexOf('function calcBMR'),
    ONBOARD_CODE.indexOf('generatedPlan = {'));
  assert.ok(!/experience|gymAccess|gym_access/.test(calc));
  const rc = PROFILE_CODE.slice(PROFILE_CODE.indexOf('function runRecalc'),
    PROFILE_CODE.indexOf('recalcPlan = {'));
  assert.ok(!/experience|gym/.test(rc));
});

/* ── 4.3.7D/E · the engine is the ONLY recommender ────────────────────────── */

test('no surface reimplements goal → program mapping', () => {
  // The retired GOAL_PROGRAM_MAP must not come back in any form, and no page
  // may hardcode a program slug as a recommendation.
  SURFACES.concat([['profile.html', PROFILE, PROFILE_CODE]]).forEach(([name, , code]) => {
    assert.ok(!/GOAL_PROGRAM_MAP/.test(code), name + ' resurrects GOAL_PROGRAM_MAP');
  });
  // Recommendation slugs are never literals in the render paths.
  const rec = HOME_CODE.slice(HOME_CODE.indexOf('function renderRecommendation'),
    HOME_CODE.indexOf('function renderWeek'));
  assert.ok(!/fat_loss_blueprint|muscle_gain|glute_builder/.test(rec));
  const sug = TRAIN_CODE.slice(TRAIN_CODE.indexOf('function renderSuggestedProgram'),
    TRAIN_CODE.indexOf('async function loadTemplates'));
  assert.ok(!/fat_loss_blueprint|muscle_gain|glute_builder/.test(sug));
});

test('every surface gets its recommendation from derivePersonalizedStart', () => {
  SURFACES.forEach(([name, , code]) => {
    assert.ok(/Personalization\.derivePersonalizedStart\(/.test(code),
      name + ' must call the shared engine');
  });
});

test('reason copy comes from the shared table, never written per surface', () => {
  [['app.html', HOME_CODE], ['workout.html', TRAIN_CODE],
    ['onboarding.html', ONBOARD_CODE]].forEach(([name, code]) => {
    assert.ok(/Personalization\.describeReasons\(/.test(code) ||
      /Personalization\.REASON\./.test(code),
    name + ' must use the shared reason vocabulary');
  });
});

/* ── the hard boundaries ──────────────────────────────────────────────────── */

test('no recommendation path writes user_programs', () => {
  // Recommendation is not enrolment. The only user_programs writes in the app
  // are schedule bookkeeping, none of them inside a recommendation renderer.
  const renderers = [
    HOME_CODE.slice(HOME_CODE.indexOf('function renderRecommendation'),
      HOME_CODE.indexOf('function renderWeek')),
    TRAIN_CODE.slice(TRAIN_CODE.indexOf('function renderSuggestedProgram'),
      TRAIN_CODE.indexOf('async function loadTemplates')),
    ONBOARD_CODE.slice(ONBOARD_CODE.indexOf('function renderTrainingReveal')),
  ];
  renderers.forEach((r, i) => {
    assert.ok(r.length > 0, 'renderer ' + i + ' not found');
    assert.ok(!/user_programs/.test(r), 'renderer ' + i + ' touches user_programs');
    assert.ok(!/\.insert\(|\.upsert\(|\.update\(|\.delete\(/.test(r),
      'renderer ' + i + ' performs a write');
  });
});

test('the engine itself can never write or fetch anything', () => {
  [/user_programs/, /\.insert\(/, /\.upsert\(/, /\.update\(/, /\.delete\(/,
    /purchases/, /supabaseClient/].forEach((re) => {
    assert.ok(!re.test(CORE_CODE), 'personalization-core.js must not contain ' + re);
  });
});

test('Home shows the recommendation only when no session is programmed', () => {
  assert.ok(/TODAY_REC_STATES\s*=\s*\['open',\s*'choose'\]/.test(HOME_CODE));
  // 'resume', 'done' and 'start' already propose a specific workout.
  const rec = HOME_CODE.slice(HOME_CODE.indexOf('function renderRecommendation'),
    HOME_CODE.indexOf('function renderWeek'));
  assert.ok(/indexOf\(today\.state\) < 0.*row\.hidden = true/s.test(rec));
});

test('Train suggests only when nothing is already recommended', () => {
  assert.ok(/if \(!shown\) await renderSuggestedProgram\(profile\)/.test(TRAIN_CODE));
  // The pre-existing active-program path still runs first and unchanged.
  assert.ok(/shown = await renderActiveProgramSession\(profile\)/.test(TRAIN_CODE));
  assert.ok(/renderRecommended\(slug, keys\[idx % keys\.length\]\)/.test(TRAIN_CODE));
});

test('Home stays minimal: no carbs or fat added to its nutrition snapshot', () => {
  // Calories + Protein remains the default. The engine exposes carbs/fat for
  // the onboarding reveal; Home must not have started rendering them.
  const nut = HOME_CODE.slice(HOME_CODE.indexOf('function renderNutrition'),
    HOME_CODE.indexOf('function renderInsight'));
  assert.ok(!/carb|\bfat\b/i.test(nut), 'Home nutrition snapshot gained a macro');
});

test('the recommendation never gates on ownership', () => {
  // Neither Home nor Train may pass accessibleSlugs, and neither may fetch
  // purchases to decide what to recommend.
  const rec = HOME_CODE.slice(HOME_CODE.indexOf('function renderRecommendation'),
    HOME_CODE.indexOf('function renderWeek'));
  const sug = TRAIN_CODE.slice(TRAIN_CODE.indexOf('function renderSuggestedProgram'),
    TRAIN_CODE.indexOf('async function loadTemplates'));
  [rec, sug].forEach((block) => {
    assert.ok(!/accessibleSlugs/.test(block));
    assert.ok(!/purchases|loadPurchaseRowsOnce/.test(block));
  });
});

/* ── failure and performance discipline ───────────────────────────────────── */

test('a catalog failure never blocks onboarding from saving', () => {
  // The warm is fire-and-forget with a catch, and never awaited on the gate.
  assert.ok(/pcLoadCatalog\(\)\s*\n?\s*\.then\(/.test(ONBOARD_CODE));
  assert.ok(/\.catch\(function \(\) \{ programCatalog = \[\]; \}\)/.test(ONBOARD_CODE));
  assert.ok(!/await pcLoadCatalog\(\)/.test(ONBOARD_CODE));
  // The save path is untouched by personalization.
  const save = ONBOARD_CODE.slice(ONBOARD_CODE.indexOf('async function saveAndContinue'));
  assert.ok(!/Personalization|programCatalog/.test(save));
});

test('onboarding_complete semantics are unchanged by this phase', () => {
  // Still set by the plan generator, still saved by the same upsert.
  assert.ok(/onboarding_complete:\s*true/.test(ONBOARD_CODE));
  assert.ok(/upsertProfile\(currentUser\.id, generatedPlan\)/.test(ONBOARD_CODE));
});

test('the reveal cannot break the results step', () => {
  const reveal = ONBOARD_CODE.slice(ONBOARD_CODE.indexOf('function renderTrainingReveal'));
  assert.ok(/try \{/.test(reveal) && /catch \(e\)/.test(reveal),
    'the reveal must degrade rather than throw into the results step');
});

test('Home adds no request: it reads the already-warmed catalog synchronously', () => {
  const rec = HOME_CODE.slice(HOME_CODE.indexOf('function renderRecommendation'),
    HOME_CODE.indexOf('function renderWeek'));
  assert.ok(/pcCached\(\)/.test(rec), 'Home must read the session cache');
  assert.ok(!/await|pcLoadCatalog/.test(rec), 'Home must not fetch to personalize');
});

test('Train falls back to a cached catalog before ever fetching one', () => {
  assert.ok(/var catalog = pcCached\(\);\s*\n\s*if \(!catalog\) catalog = await pcLoadCatalog\(\);/
    .test(TRAIN_CODE));
});

/* ── copy discipline (§35) ────────────────────────────────────────────────── */

test('no surface claims AI, perfection or a guarantee', () => {
  const banned = /\b(AI picked|perfect for you|guaranteed|optimal|scientifically proven)\b/i;
  assert.ok(!banned.test(CORE_CODE),
    'personalization-core.js contains an unsupported claim');
  const { REASON_COPY } = require('./personalization-core.js');
  Object.keys(REASON_COPY).forEach((k) => {
    assert.ok(!banned.test(REASON_COPY[k]), 'reason copy overclaims: ' + k);
  });
});

test('no emoji reached the new personalization UI', () => {
  // CLAUDE.md §13: rows are text-only; Lucide icons + text badges only.
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.ok(!emoji.test(CORE));
  const reveal = ONBOARD.slice(ONBOARD.indexOf('ob-trainingBlock'),
    ONBOARD.indexOf('ob-nutritionLabel'));
  assert.ok(!emoji.test(reveal));
});

/* ── accessibility ────────────────────────────────────────────────────────── */

test('the new inputs are labelled', () => {
  assert.ok(/<label[^>]*for="rc-experience"/.test(PROFILE));
  assert.ok(/<label[^>]*for="rc-gym"/.test(PROFILE));
  // Onboarding's own pattern is a <label> immediately preceding the control
  // inside .field; match it rather than inventing a second convention.
  assert.ok(/<label>Training Experience[\s\S]{0,120}id="ob-experience"/.test(ONBOARD));
  assert.ok(/<label>Gym Access[\s\S]{0,120}id="ob-gym"/.test(ONBOARD));
});

test('the Train suggestion action is a real link, not a div', () => {
  assert.ok(/<a class="btn-tpl-start" href='/.test(TRAIN_CODE) ||
    /'<a class="btn-tpl-start" href="'/.test(TRAIN_CODE));
  // ...and it is sized as a touch target.
  assert.ok(/a\.btn-tpl-start \{[\s\S]*?min-height: 44px/.test(TRAIN));
});

test('the Home recommendation link is keyboard reachable and not a whole-card click', () => {
  assert.ok(/<a class="mm-hero-rec-link" id="todayRecLink"/.test(HOME));
  // The hero itself must not have become a clickable container.
  assert.ok(!/<section class="mm-hero"[^>]*onclick/.test(HOME));
});

test('BOTH recommendation links meet the 44px touch target', () => {
  // Production measurement caught the Home link at 32.5px: padding on an
  // inline element does not make a touch target, so the height is asserted.
  assert.ok(/\.mm-hero-rec-link \{[\s\S]*?min-height: 44px/.test(HOME),
    'the Home recommendation link must declare a 44px min-height');
  assert.ok(/a\.btn-tpl-start \{[\s\S]*?min-height: 44px/.test(TRAIN),
    'the Train suggestion link must declare a 44px min-height');
});

test('the recommendation is not communicated by colour alone', () => {
  // The label carries the meaning in words; the accent is decoration.
  assert.ok(/'Recommended for your goal:'/.test(HOME_CODE));
  assert.ok(/'Recommended:'/.test(HOME_CODE));
});

/* ═══════════════════════════════════════════════════════════════════════════
 * Phase 4.3.9-L — the no-fit state reaches every consumer
 *
 * SCOPE, STATED HONESTLY: these are narrow WIRING GUARDS over page source, not
 * behavioural UI coverage. The repository has no DOM test harness, and adding
 * one for this checkpoint would be a larger change than the checkpoint itself.
 *
 * The executable behaviour they depend on is tested directly elsewhere:
 *   - the withheld-recommendation verdict → personalization-core.test.js
 *   - Programs-pane route selection       → app-nav.test.js (resolveTrainPane)
 *
 * What remains unproven by any automated test is that the rendered markup
 * actually appears and is usable on a real device. That is recorded as a
 * production-validation requirement for this checkpoint, not claimed here.
 * ═════════════════════════════════════════════════════════════════════════ */

const NOFIT_SURFACES = [
  ['onboarding.html', ONBOARD_CODE],
  ['app.html', HOME_CODE],
  ['workout.html', TRAIN_CODE],
];

test('4.3.9-L: every recommendation surface handles the withheld state', () => {
  NOFIT_SURFACES.forEach(([name, code]) => {
    assert.ok(/noFitReason/.test(code),
      name + ' must read training.noFitReason rather than treating a withheld ' +
      'recommendation as a load failure');
    assert.ok(/'equipment'/.test(code),
      name + ' must branch on the equipment no-fit reason specifically');
  });
});

test('4.3.9-L: no surface derives its own equipment compatibility', () => {
  NOFIT_SURFACES.forEach(([name, code]) => {
    assert.ok(!/EQUIPMENT_ACCESS|equipmentFit|isEligible\s*\(/.test(code),
      name + ' must consume the engine verdict, never re-implement eligibility');
  });
});

test('4.3.9-L: the no-fit state offers browsing, and browsing names no Program', () => {
  // Home builds its link through AppNav so it cannot drift from what Train
  // parses; app-nav.test.js proves that link actually selects Programs.
  const homeAll = HOME_CODE.slice(HOME_CODE.indexOf('noFitReason'));
  const home = homeAll.slice(0, homeAll.indexOf('return;'));
  assert.ok(/Browse Programs/.test(home), 'Home must offer a browse action');
  assert.ok(/AppNav\.trainPaneHref\('programs'\)/.test(home),
    'Home must build the browse link through AppNav, not hard-code workout.html');
  // BOTH destinations must select Programs. A fallback that quietly opens
  // Today would recreate the very defect this state exists to fix.
  const hrefs = home.match(/'workout\.html[^']*'/g) || [];
  assert.ok(hrefs.length > 0, 'the fallback destination must be present');
  hrefs.forEach((h) => {
    assert.ok(/\?pane=programs'$/.test(h),
      'every Home browse destination must select Programs, but found ' + h);
    assert.strictEqual(AppNav.resolveTrainPane(h.slice(h.indexOf('?'), -1)), 'programs',
      'the literal fallback must resolve to the Programs pane');
  });
  assert.ok(!/rec\.pagePath/.test(home),
    'Home must not deep link to a Program it just declined to recommend');

  // Bound the window to the no-fit branch itself — it ends at its own
  // `return;` — so the assertions cannot accidentally read the normal
  // recommendation path that legitimately follows it.
  const trainAll = TRAIN_CODE.slice(TRAIN_CODE.indexOf('noFitReason'));
  const train = trainAll.slice(0, trainAll.indexOf('return;'));
  // The handler is emitted inside a single-quoted JS string, so the inner
  // quotes are backslash-escaped in source.
  assert.ok(/showTrainPane\(\\?'programs\\?'\)/.test(train),
    'Train browse must open the Programs pane');
  assert.ok(/Browse Programs/.test(train), 'the Train action must say Browse Programs');
  assert.ok(!/rec\.pagePath/.test(train),
    'the no-fit branch must not reference a recommended Program page');
});

test('4.3.9-L: Train applies the requested pane on load, through AppNav', () => {
  assert.ok(/AppNav\.resolveTrainPane\(window\.location\.search\)/.test(TRAIN_CODE),
    'Train must resolve its opening pane from the address via AppNav');
  assert.ok(/showTrainPane\(AppNav\.resolveTrainPane/.test(TRAIN_CODE),
    'the resolved pane must be applied through the existing pane switcher, ' +
    'so the tab, the visible panel and aria-selected stay in step');
});

test('4.3.9-L: the no-fit copy is consistent across all three surfaces', () => {
  NOFIT_SURFACES.forEach(([name, code]) => {
    assert.ok(/No equipment match yet/.test(code),
      name + ' must use the shared no-fit title');
  });
  // The removed promise must not come back: it could become false.
  [ONBOARD, HOME, TRAIN].forEach((src) => {
    assert.ok(!/on the way/.test(src),
      'no surface may promise Programs that do not exist yet');
  });
});

test('4.3.9-L: onboarding still completes when no Program fits', () => {
  // The training block is shown, not hidden, and nothing in the no-fit branch
  // touches the save path.
  const branch = ONBOARD_CODE.slice(ONBOARD_CODE.indexOf('noFitReason'));
  assert.ok(/ob-rNoFit|noFit\.style\.display/.test(branch),
    'onboarding must render a no-fit card rather than an empty section');
  assert.ok(!/saveAndContinue|upsertProfile|return false/.test(branch.slice(0, 500)),
    'the no-fit branch must not interfere with saving or advancing');
});

test('4.3.9-L: no surface enrols, owns or mutates anything on the no-fit path', () => {
  NOFIT_SURFACES.forEach(([name, code]) => {
    const i = code.indexOf('noFitReason');
    const branch = code.slice(i, i + 1200);
    assert.ok(!/user_programs|\.insert\(|\.upsert\(|active_program/.test(branch),
      name + ' must not write enrolment or ownership state in the no-fit branch');
  });
});
