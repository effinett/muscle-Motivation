/* ──────────────────────────────────────────────────────────────────────────
 * Phase 4.3.6 CP5 — Train Programs experience
 *
 * Covers the Train local navigation (Today · Workouts · Programs), the
 * My Programs / Browse split, and the boundary that matters: Browse shows
 * catalog metadata and never protected session prescriptions.
 * ──────────────────────────────────────────────────────────────────────── */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { resolveProgramAccess } = require('./entitlement-core.js');
const { pcNormalizeCatalog } = require('./program-catalog.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const readCode = (f) => read(f)
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const TRAIN = read('workout.html');
const TRAIN_CODE = readCode('workout.html');

/* The three live published Programs, all membership-included AND standalone
 * purchasable per owner decision R2. */
const CATALOG = pcNormalizeCatalog([
  { slug: 'fat_loss_blueprint', name: '90 Day Fat Loss Blueprint',
    description: '12-week fat loss system', goal: 'fatloss',
    difficulty: 'Beginner – Intermediate', duration_weeks: 12,
    recommended_days_per_week: 4, equipment_summary: 'Any Setup',
    included_with_membership: true, standalone_purchasable: true,
    status: 'published', sort_order: 1, page_path: 'program-fat-loss.html' },
  { slug: 'muscle_gain', name: 'Muscle Gain', description: '8-week hypertrophy program',
    goal: 'muscle', difficulty: 'Beginner', duration_weeks: 8,
    recommended_days_per_week: 3, equipment_summary: 'Any Setup',
    included_with_membership: true, standalone_purchasable: true,
    status: 'published', sort_order: 2, page_path: 'program-muscle-gain.html' },
  { slug: 'glute_builder', name: 'Glute Builder', description: "Women's lower-body program",
    goal: 'muscle', difficulty: 'All Levels', duration_weeks: 8,
    recommended_days_per_week: 3, equipment_summary: 'Any Setup',
    included_with_membership: true, standalone_purchasable: true,
    status: 'published', sort_order: 3, page_path: 'program-glute-builder.html' },
]);
const buy = (product, status) => ({ product, status });

// Mirrors renderPrograms(): the published catalog is PARTITIONED — a Program
// appears under My Programs or under Browse, never both.
function split(rows) {
  const mine = [], browse = [];
  for (const p of CATALOG) {
    const v = resolveProgramAccess(p, rows);
    if (v.allowed) mine.push({ slug: p.slug, source: v.source });
    else browse.push(p.slug);
  }
  return { mine, browse };
}

/* ── 1 · Train information architecture ─────────────────────────────────── */

test('IA: Train exposes Today · Workouts · Programs', () => {
  for (const label of ['>Today<', '>Workouts<', '>Programs<']) {
    assert.ok(TRAIN.includes(label), `missing segment ${label}`);
  }
  for (const pane of ['paneToday', 'paneWorkouts', 'panePrograms']) {
    assert.ok(TRAIN.includes('id="' + pane + '"'), `missing ${pane}`);
  }
});

test('IA: the segmented control is a real tablist, not decorative divs', () => {
  assert.match(TRAIN, /role="tablist"/);
  assert.strictEqual((TRAIN.match(/role="tab"/g) || []).length, 3);
  assert.strictEqual((TRAIN.match(/role="tabpanel"/g) || []).length, 3);
  assert.match(TRAIN, /aria-selected="true"/, 'Today starts selected');
});

test('IA: Today is the default pane and the others start hidden', () => {
  const today = TRAIN.indexOf('id="paneToday"');
  const workouts = TRAIN.indexOf('id="paneWorkouts"');
  const programs = TRAIN.indexOf('id="panePrograms"');
  assert.ok(today < workouts && workouts < programs, 'declared in IA order');
  assert.match(TRAIN.slice(workouts, workouts + 120), /hidden/);
  assert.match(TRAIN.slice(programs, programs + 120), /hidden/);
});

test('IA: NO fifth bottom-navigation destination was added', () => {
  // O5. The bottom nav registry lives in app-nav.js and must be untouched.
  const nav = read('app-nav.js');
  const dests = (nav.match(/href:\s*'[a-z-]+\.html'/g) || []).length;
  assert.ok(dests <= 5, 'app-nav destination count unchanged (4 live + reserved Coach)');
  assert.ok(!/programs\.html/.test(nav), 'Programs is not a bottom-nav destination');
  assert.ok(!TRAIN_CODE.includes('AppNav.register'), 'Train registers no new destination');
});

test('IA: pane switching is view-local — no router, no history entry', () => {
  assert.match(TRAIN_CODE, /function showTrainPane/);
  assert.ok(!/pushState|replaceState|location\.hash\s*=/.test(TRAIN_CODE),
    'CP5 must not introduce routing');
});

/* ── 2 · existing Train sections all survive ────────────────────────────── */

test('regroup: every pre-CP5 section still exists, just grouped', () => {
  for (const section of ['Recommended', 'My Workouts', 'One-Off Workout',
    'History', 'My Exercises']) {
    assert.ok(TRAIN.includes('>' + section + '<'), `${section} must survive`);
  }
  for (const id of ['recommendedWrap', 'templateList', 'workoutNameInput',
    'historyList', 'customExerciseList']) {
    assert.ok(TRAIN.includes('id="' + id + '"'), `${id} must survive`);
  }
});

test('regroup: Today keeps the start-a-workout jobs', () => {
  const pane = TRAIN.slice(TRAIN.indexOf('id="paneToday"'), TRAIN.indexOf('/paneToday'));
  assert.ok(pane.includes('recommendedWrap'), 'Recommended stays prominent');
  assert.ok(pane.includes('workoutNameInput'), 'Quick Session stays on Today');
});

test('regroup: Workouts holds the library jobs', () => {
  const pane = TRAIN.slice(TRAIN.indexOf('id="paneWorkouts"'), TRAIN.indexOf('/paneWorkouts'));
  for (const id of ['templateList', 'historyList', 'customExerciseList']) {
    assert.ok(pane.includes(id), `${id} belongs to Workouts`);
  }
});

/* ── 3 · My Programs uses the shared resolver ───────────────────────────── */

test('access: Programs rendering delegates to resolveProgramAccess', () => {
  assert.match(TRAIN_CODE, /resolveProgramAccess\(p,\s*purchaseRows\)/,
    'every card is classified by the shared resolver');
});

test('access: membership-only grants all three Programs', () => {
  const { mine, browse } = split([buy('ai_membership', 'active')]);
  assert.strictEqual(mine.length, 3);
  assert.ok(mine.every((m) => m.source === 'membership'));
  assert.strictEqual(browse.length, 0, 'nothing left to browse');
});

test('access: standalone-only grants exactly that Program', () => {
  const { mine, browse } = split([buy('glute_builder', 'active')]);
  assert.deepStrictEqual(mine.map((m) => m.slug), ['glute_builder']);
  assert.strictEqual(mine[0].source, 'standalone');
  assert.deepStrictEqual(browse, ['fat_loss_blueprint', 'muscle_gain'],
    'Browse excludes the accessible one');
});

test('access: both → accessible, reported as the stronger standalone claim', () => {
  const { mine } = split([buy('ai_membership', 'active'), buy('muscle_gain', 'active')]);
  assert.strictEqual(mine.length, 3);
  assert.strictEqual(mine.find((m) => m.slug === 'muscle_gain').source, 'standalone');
  assert.strictEqual(mine.find((m) => m.slug === 'glute_builder').source, 'membership');
});

/* ── partition — a Program is never listed twice ────────────────────────── */

test('partition: 0 accessible → Browse shows the full catalog', () => {
  const { mine, browse } = split([]);
  assert.strictEqual(mine.length, 0);
  assert.deepStrictEqual(browse,
    ['fat_loss_blueprint', 'muscle_gain', 'glute_builder']);
});

test('partition: 1 accessible → Browse excludes exactly that one', () => {
  const { mine, browse } = split([buy('muscle_gain', 'active')]);
  assert.deepStrictEqual(mine.map((m) => m.slug), ['muscle_gain']);
  assert.deepStrictEqual(browse, ['fat_loss_blueprint', 'glute_builder']);
});

test('partition: 2 accessible → Browse shows the remaining one', () => {
  const { mine, browse } = split([buy('muscle_gain', 'active'),
    buy('fat_loss_blueprint', 'active')]);
  assert.strictEqual(mine.length, 2);
  assert.deepStrictEqual(browse, ['glute_builder']);
});

test('partition: all 3 accessible → Browse is empty, no duplicate cards', () => {
  const { mine, browse } = split([buy('ai_membership', 'active'),
    buy('fat_loss_blueprint', 'active'), buy('muscle_gain', 'active'),
    buy('glute_builder', 'active')]);
  assert.strictEqual(mine.length, 3);
  assert.strictEqual(browse.length, 0, 'no Program appears in both lists');
});

test('partition: no slug can ever appear in both lists', () => {
  const scenarios = [[], [buy('ai_membership', 'active')],
    [buy('glute_builder', 'active')],
    [buy('muscle_gain', 'active'), buy('glute_builder', 'active')],
    [buy('ai_membership', 'past_due'), buy('muscle_gain', 'active')],
    [buy('ai_membership', 'canceled'), buy('muscle_gain', 'refunded')]];
  for (const rows of scenarios) {
    const { mine, browse } = split(rows);
    const overlap = mine.map((m) => m.slug).filter((s) => browse.includes(s));
    assert.deepStrictEqual(overlap, [], 'overlap for ' + JSON.stringify(rows));
    assert.strictEqual(mine.length + browse.length, CATALOG.length,
      'every published Program is listed exactly once');
  }
});

test('access: past_due keeps access, matching CP2b and the RLS', () => {
  assert.strictEqual(split([buy('ai_membership', 'past_due')]).mine.length, 3);
  assert.strictEqual(split([buy('muscle_gain', 'past_due')]).mine.length, 1);
});

test('access: refunded and canceled grant nothing', () => {
  for (const bad of ['refunded', 'canceled']) {
    assert.strictEqual(split([buy('ai_membership', bad)]).mine.length, 0);
    assert.strictEqual(split([buy('muscle_gain', bad)]).mine.length, 0);
  }
});

/* ── 4 · empty / full states ────────────────────────────────────────────── */

test('states: no access → empty My Programs but Browse still full', () => {
  const { mine, browse } = split([]);
  assert.strictEqual(mine.length, 0);
  assert.strictEqual(browse.length, 3, 'Browse must not be hidden when nothing is owned');
  assert.match(TRAIN_CODE, /No Programs yet/, 'honest empty state exists');
});

test('states: all accessible → a completion state, not duplicate cards', () => {
  const { mine, browse } = split([buy('ai_membership', 'active'),
    buy('fat_loss_blueprint', 'active'), buy('muscle_gain', 'active'),
    buy('glute_builder', 'active')]);
  assert.strictEqual(mine.length, 3);
  assert.strictEqual(browse.length, 0);
  assert.match(TRAIN_CODE, /You have access to all available Programs\./);
});

test('states: an empty Browse distinguishes "you have everything" from "nothing exists"', () => {
  // mine.length decides which message renders, so a user with nothing is never
  // told they have access to everything.
  assert.match(TRAIN_CODE,
    /mine\.length[\s\S]{0,120}You have access to all available Programs[\s\S]{0,120}No Programs are available right now/);
});

test('states: badge wording never calls membership access "ownership"', () => {
  assert.match(TRAIN_CODE, /source === 'standalone'[\s\S]{0,80}Owned/);
  assert.match(TRAIN_CODE, /With membership/);
  assert.ok(!/membership[\s\S]{0,40}text:\s*'Owned'/.test(TRAIN_CODE));
});

/* ── 5 · Browse security boundary — HARD ────────────────────────────────── */

test('security: the Programs pane never reads program_workouts', () => {
  // Browse must not query protected session rows to enrich cards. Session
  // count is deliberately omitted rather than obtained by weakening RLS.
  const start = TRAIN_CODE.indexOf('async function loadPrograms');
  const end = TRAIN_CODE.indexOf('async function loadRecommended');
  const programsCode = TRAIN_CODE.slice(start, end);
  assert.ok(start > -1 && end > start, 'located the Programs block');
  assert.ok(!/program_workouts/.test(programsCode),
    'Browse must never read protected prescriptions');
});

test('security: no prescription fields are rendered on a Program card', () => {
  const start = TRAIN_CODE.indexOf('function programCard');
  const end = TRAIN_CODE.indexOf('function renderPrograms');
  const card = TRAIN_CODE.slice(start, end);
  for (const field of ['exercises', 'reps_low', 'reps_high', 'rest_sec',
    'sets', 'session_key']) {
    assert.ok(!card.includes(field), `card must not expose ${field}`);
  }
});

test('security: cards render only approved catalog metadata', () => {
  const start = TRAIN_CODE.indexOf('function programCard');
  const end = TRAIN_CODE.indexOf('function renderPrograms');
  const card = TRAIN_CODE.slice(start, end);
  // O2's permitted list, in the normalized catalog's field names.
  for (const ok of ['name', 'description', 'durationWeeks',
    'recommendedDaysPerWeek', 'difficulty', 'equipmentSummary', 'pagePath']) {
    assert.ok(card.includes(ok) || TRAIN_CODE.includes(ok), `${ok} is permitted`);
  }
});

test('security: card content is escaped', () => {
  const start = TRAIN_CODE.indexOf('function programCard');
  const end = TRAIN_CODE.indexOf('function renderPrograms');
  const card = TRAIN_CODE.slice(start, end);
  assert.ok(!/\+\s*p\.(name|description)\s*\+/.test(card),
    'catalog strings must go through esc()');
  assert.match(card, /esc\(p\.name\)/);
});

/* ── 6 · CTAs and page_path ─────────────────────────────────────────────── */

test('cta: links use the canonical catalog page_path', () => {
  assert.match(TRAIN_CODE, /p\.pagePath/);
  for (const hard of ['program-fat-loss.html', 'program-muscle-gain.html',
    'program-glute-builder.html']) {
    assert.ok(!TRAIN_CODE.includes(hard),
      `${hard} must come from the catalog, not be hard-coded`);
  }
});

test('cta: accessible vs inaccessible wording differs and invents no checkout', () => {
  assert.match(TRAIN_CODE, /View Program/);
  assert.match(TRAIN_CODE, /Learn More|Included with membership/);
  assert.ok(!/checkout|stripe|buyProduct/i.test(TRAIN_CODE.slice(
    TRAIN_CODE.indexOf('function programCard'),
    TRAIN_CODE.indexOf('function renderPrograms'))),
    'CP5 introduces no checkout surface');
});

/* ── 7 · progression honesty ────────────────────────────────────────────── */

test('progression: no fabricated progress on Program cards', () => {
  const start = TRAIN_CODE.indexOf('function programCard');
  const end = TRAIN_CODE.indexOf('function renderPrograms');
  const card = TRAIN_CODE.slice(start, end);
  for (const invented of ['% complete', 'progress', 'current_index',
    'week 1', 'completed']) {
    assert.ok(!card.toLowerCase().includes(invented.toLowerCase()),
      `card must not invent ${invented}`);
  }
});

/* ── 8 · performance ────────────────────────────────────────────────────── */

test('perf: Train issues at most ONE purchases request per page load', () => {
  const hits = (TRAIN_CODE.match(/from\('purchases'\)/g) || []).length;
  assert.strictEqual(hits, 1, 'the recommended card and Programs share one fetch');
  assert.match(TRAIN_CODE, /function loadPurchaseRowsOnce/);
  assert.match(TRAIN_CODE, /trainPurchasesInflight/, 'concurrent callers deduped');
});

test('perf: Programs data loads only when the pane is opened', () => {
  assert.match(TRAIN_CODE, /if \(pane === 'programs'\) loadPrograms\(\)/,
    'Train startup must not pay for the Programs pane');
  assert.match(TRAIN_CODE, /var programsLoaded = false/);
});

test('perf: the catalog fetch stays parallel and cache-backed', () => {
  assert.match(TRAIN_CODE, /Promise\.all\(\[pcLoadCatalog\(\), loadPurchaseRowsOnce\(\)\]\)/);
});

test('perf: no new bottom-nav, prefetch or app-shell change', () => {
  assert.ok(!/mm-nav-base-height|data-mm-sw-bottom-control/.test(TRAIN_CODE),
    'Train must not redefine shell contracts');
});

/* ── 9 · scope guards ───────────────────────────────────────────────────── */

test('scope: CP5 did not surface CP4 Routine metadata', () => {
  for (const col of ['is_platform', 'visibility', 'tags']) {
    assert.ok(!TRAIN_CODE.includes(col), `${col} belongs to CP6, not CP5`);
  }
});

test('scope: CP6/CP7/CP8 have not started', () => {
  assert.ok(!fs.existsSync(path.join(__dirname, 'routine-lifecycle.js')));
  assert.ok(!fs.existsSync(path.join(__dirname, 'routine-history.js')));
  assert.ok(!/publishRoutine|program_routines/.test(TRAIN_CODE));
  // CP7 provenance would attach source_workout_id to a ROUTINE. The existing
  // personal_records.source_workout_id (Phase 4.2.1K PR detection) is a
  // different column entirely and must not trip this guard.
  const routineWrites = TRAIN_CODE.match(
    /from\('workout_templates'\)[\s\S]{0,400}?\)/g) || [];
  for (const w of routineWrites) {
    assert.ok(!w.includes('source_workout_id'),
      'Routine provenance is CP7: ' + w.slice(0, 80));
  }
});

test('scope: program_workouts execution reads are unchanged', () => {
  // CP8 owns convergence; the launch paths must still read it exactly as before.
  assert.strictEqual((TRAIN_CODE.match(/from\('program_workouts'\)/g) || []).length, 2,
    'applyTemplateRanges + startProgramSession, as before CP5');
});

test('scope: only the three live Programs can appear — no invented content', () => {
  assert.ok(!/Home Strength|Full Gym Strength/.test(TRAIN),
    'planned Programs must not be rendered as live cards');
  assert.strictEqual(CATALOG.length, 3);
});
