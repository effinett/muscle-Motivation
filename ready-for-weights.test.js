/* Phase 4.3.9-L "Ready for weights?" card. These tests prove the card shows
 * only in the two bodyweight Programs, once per workout, always leads with
 * Update my equipment, and NEVER links to a Program that has not been migrated
 * and published — and links only when the normal ranking would pick it. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require('./ready-for-weights.js');
const P = require('./personalization-core.js');
const PC = require('./program-catalog.js');
const PP = require('./program-page.js');

// The production catalog as of 2026-11-17: none of the six is migrated.
const TODAY_ROWS = [
  { slug: 'fat_loss_blueprint', name: '90 Day Fat Loss Blueprint', goal: 'fatloss', difficulty: 'Beginner – Intermediate', recommended_days_per_week: 4, equipment_summary: 'Full Gym', status: 'published', sort_order: 1, page_path: 'program-fat-loss.html' },
  { slug: 'muscle_gain', name: 'Muscle Gain', goal: 'muscle', difficulty: 'Beginner – Intermediate', recommended_days_per_week: 3, equipment_summary: 'Full Gym', status: 'published', sort_order: 2, page_path: 'program-muscle-gain.html' },
  { slug: 'glute_builder', name: 'Glute Builder', goal: 'muscle', difficulty: 'Beginner – Intermediate', recommended_days_per_week: 3, equipment_summary: 'Full Gym', status: 'published', sort_order: 3, page_path: 'program-glute-builder.html' },
  { slug: 'bodyweight_foundations', name: 'Bodyweight Foundations', goal: 'muscle', difficulty: 'Beginner – Intermediate', recommended_days_per_week: 3, equipment_summary: 'Bodyweight', status: 'published', sort_order: 4, page_path: 'program-bodyweight.html' },
];
// Illustrative post-migration rows (NOT the migrations' values, which are
// approved separately). `order` lets a test choose where each one sorts.
function home(slug, name, goal, difficulty, order) {
  return { slug, name, goal, difficulty, recommended_days_per_week: 3, equipment_summary: 'Home Setup',
    status: 'published', sort_order: order, page_path: 'program.html?slug=' + slug };
}
const catalogOf = (rows) => PC.pcNormalizeCatalog(rows);
const TODAY = catalogOf(TODAY_ROWS);

const TERMINAL = { name: 'Push-Up', status: 'terminal' };
function card(programSlug, exercises, catalog, profile) {
  const input = { programSlug, exercises };
  if (catalog) {
    const plan = P.derivePersonalizedStart(R.rankingProfile(profile), { catalog });
    input.recommended = plan.training.recommendedProgram;
    input.catalog = catalog;
    input.pagePathFor = PP.pagePathFor;
  }
  return R.buildCard(input);
}
const BEGINNER_MUSCLE = { goal: 'muscle', training_days: 3, training_experience: 'beginner', gym_access: 'bodyweight' };
const BEGINNER_FATLOSS = { goal: 'fatloss', training_days: 3, training_experience: 'beginner', gym_access: 'bodyweight' };

test('only Bodyweight Foundations and Bodyweight Fat Loss get the card', () => {
  const slugs = ['fat_loss_blueprint', 'muscle_gain', 'glute_builder', 'bodyweight_foundations',
    'home_strength', 'home_fat_loss', 'bodyweight_fat_loss', 'advanced_muscle', 'advanced_fat_loss',
    'advanced_home_strength'];
  slugs.forEach((slug) => {
    const expected = slug === 'bodyweight_foundations' || slug === 'bodyweight_fat_loss';
    assert.equal(!!R.buildCard({ programSlug: slug, exercises: [TERMINAL] }), expected, slug);
  });
  assert.equal(R.buildCard({ programSlug: null, exercises: [TERMINAL] }), null);
  assert.equal(R.buildCard({ programSlug: 'constructor', exercises: [TERMINAL] }), null);
});

test('no card unless an exercise reached the end of its path', () => {
  ['building', 'one_more', 'step_up', 'not_eligible', undefined].forEach((status) => {
    assert.equal(R.buildCard({ programSlug: 'bodyweight_foundations', exercises: [{ name: 'Plank', status }] }), null, String(status));
  });
  assert.equal(R.buildCard({ programSlug: 'bodyweight_foundations', exercises: [] }), null);
  assert.equal(R.buildCard({ programSlug: 'bodyweight_foundations' }), null);
});

test('one card per workout, naming each end-of-path exercise once', () => {
  const c = R.buildCard({ programSlug: 'bodyweight_foundations', exercises: [
    { name: 'Push-Up', status: 'terminal' }, { name: 'Squat', status: 'building' },
    { name: 'Plank', status: 'terminal' }, { name: 'Push-Up', status: 'terminal' },
    { name: 'Wall Sit', status: 'terminal' } ] });
  assert.equal(c.title, 'Ready for weights?');
  assert.equal(c.body, 'You’ve hit the top of the bodyweight version on Push-Up, Plank and Wall Sit. ' +
    'Adding load is the next step. Tell us what equipment you have and we’ll match you to the right Program.');
  assert.match(R.buildCard({ programSlug: 'bodyweight_fat_loss', exercises: [TERMINAL] }).body, /version on Push-Up\. /);
});

test('the main action is always Update my equipment, to the equipment-only editor', () => {
  [null, TODAY].forEach((catalog) => {
    const c = card('bodyweight_foundations', [TERMINAL], catalog, BEGINNER_MUSCLE);
    assert.deepEqual(c.primary, { label: 'Update my equipment', href: 'profile.html?edit=equipment' });
  });
});

test('today’s catalog (nothing migrated): no direct link for any client', () => {
  ['bodyweight_foundations', 'bodyweight_fat_loss'].forEach((src) => {
    [BEGINNER_MUSCLE, BEGINNER_FATLOSS,
     { goal: 'muscle', training_days: 4, training_experience: 'advanced', gym_access: 'full_gym' },
     {}].forEach((prof) => {
      assert.equal(card(src, [TERMINAL], TODAY, prof).secondary, null, src + ' ' + JSON.stringify(prof));
    });
  });
});

test('never links to a Program missing from the published catalog, even if the ranking named it', () => {
  const forged = { slug: 'home_strength', name: 'Home Strength', pagePath: 'program.html?slug=home_strength' };
  assert.equal(R.directLink('bodyweight_foundations', forged, TODAY, PP.pagePathFor), null);
  assert.equal(R.directLink('bodyweight_foundations', forged, [], PP.pagePathFor), null);
  assert.equal(R.directLink('bodyweight_foundations', forged, null, PP.pagePathFor), null);
});

test('fails closed on a draft row, a wrong page path, or a missing path rule', () => {
  const ok = home('home_strength', 'Home Strength', 'muscle', 'Beginner – Intermediate', 1);
  const rec = { slug: 'home_strength', name: 'Home Strength', pagePath: 'program.html?slug=home_strength' };
  const linkWith = (row, r, fn) => R.directLink('bodyweight_foundations', r, catalogOf([row]), fn);
  assert.ok(linkWith(ok, rec, PP.pagePathFor));
  assert.equal(linkWith(Object.assign({}, ok, { status: 'draft' }), rec, PP.pagePathFor), null);
  assert.equal(linkWith(Object.assign({}, ok, { page_path: 'program-home.html' }), rec, PP.pagePathFor), null);
  assert.equal(linkWith(Object.assign({}, ok, { page_path: null }), rec, PP.pagePathFor), null);
  assert.equal(linkWith(ok, Object.assign({}, rec, { pagePath: 'elsewhere.html' }), PP.pagePathFor), null);
  assert.equal(linkWith(ok, rec, undefined), null);
});

test('each source Program can only ever link to its own target', () => {
  const rows = [home('home_strength', 'Home Strength', 'muscle', 'Beginner – Intermediate', 1),
                home('home_fat_loss', 'Home Fat Loss', 'fatloss', 'Beginner – Intermediate', 2),
                home('advanced_home_strength', 'Advanced Home Strength', 'muscle', 'Advanced', 3)];
  const cat = catalogOf(rows);
  const rec = (slug) => ({ slug, name: slug, pagePath: PP.pagePathFor(slug) });
  assert.equal(R.directLink('bodyweight_foundations', rec('home_fat_loss'), cat, PP.pagePathFor), null);
  assert.equal(R.directLink('bodyweight_foundations', rec('advanced_home_strength'), cat, PP.pagePathFor), null);
  assert.equal(R.directLink('bodyweight_fat_loss', rec('home_strength'), cat, PP.pagePathFor), null);
  assert.equal(R.directLink('bodyweight_fat_loss', rec('advanced_home_strength'), cat, PP.pagePathFor), null);
  assert.equal(R.directLink('muscle_gain', rec('home_strength'), cat, PP.pagePathFor), null);
  // A pick for another Program never borrows the target's page path.
  assert.equal(R.directLink('bodyweight_foundations',
    { slug: 'home_fat_loss', name: 'x', pagePath: PP.pagePathFor('home_strength') }, cat, PP.pagePathFor), null);
});

test('the link appears only when the normal ranking picks the target (published and ranked first)', () => {
  const cat = catalogOf(TODAY_ROWS.concat([
    home('home_strength', 'Home Strength', 'muscle', 'Beginner – Intermediate', 5),
    home('home_fat_loss', 'Home Fat Loss', 'fatloss', 'Beginner – Intermediate', 6)]));
  const a = card('bodyweight_foundations', [TERMINAL], cat, BEGINNER_MUSCLE);
  assert.deepEqual(a.secondary, { slug: 'home_strength', label: 'See Home Strength',
    href: 'program.html?slug=home_strength', note: 'Home Strength uses dumbbells and a long resistance band.' });
  const b = card('bodyweight_fat_loss', [TERMINAL], cat, BEGINNER_FATLOSS);
  assert.deepEqual(b.secondary, { slug: 'home_fat_loss', label: 'See Home Fat Loss',
    href: 'program.html?slug=home_fat_loss', note: 'Home Fat Loss uses dumbbells, a long resistance band and a mini band.' });
  // Goal points elsewhere: the ranking picks Home Fat Loss, so Foundations shows no link.
  assert.equal(card('bodyweight_foundations', [TERMINAL], cat, BEGINNER_FATLOSS).secondary, null);
});

test('an advanced client is not sent to Home Strength; the ranking decides, nothing is hard-coded', () => {
  const cat = catalogOf(TODAY_ROWS.concat([
    home('home_strength', 'Home Strength', 'muscle', 'Beginner – Intermediate', 5),
    home('advanced_home_strength', 'Advanced Home Strength', 'muscle', 'Advanced', 10)]));
  const c = card('bodyweight_foundations', [TERMINAL], cat,
    { goal: 'muscle', training_days: 4, training_experience: 'advanced', gym_access: 'bodyweight' });
  assert.equal(c.secondary, null);
  assert.equal(c.primary.label, 'Update my equipment');
});

test('the exact equipment match wins even though the bodyweight Program sorts first', () => {
  // Since #117 (owner decision 2026-11-17) a Home Setup Program beats a
  // Bodyweight one for a home-setup client after goal and experience, whatever
  // the catalog order. Home Strength sorts AFTER Bodyweight Foundations here.
  const cat = catalogOf(TODAY_ROWS.concat([home('home_strength', 'Home Strength', 'muscle', 'Beginner – Intermediate', 5)]));
  const plan = P.derivePersonalizedStart(R.rankingProfile(BEGINNER_MUSCLE), { catalog: cat });
  assert.equal(plan.training.recommendedProgram.slug, 'home_strength');
  assert.equal(card('bodyweight_foundations', [TERMINAL], cat, BEGINNER_MUSCLE).secondary.slug, 'home_strength');
});

test('rankingProfile asks with a home-setup answer and never changes the stored profile', () => {
  const prof = Object.freeze({ goal: 'muscle', gym_access: 'bodyweight', training_days: 3 });
  const copy = R.rankingProfile(prof);
  assert.equal(copy.gym_access, 'home_basic');
  assert.equal(prof.gym_access, 'bodyweight');
  assert.equal(copy.goal, 'muscle');
  assert.equal(R.rankingProfile(null).gym_access, 'home_basic');
});

test('equipmentMatch reports the ranking’s pick only when it has a page', () => {
  const cat = catalogOf(TODAY_ROWS);
  const m = R.equipmentMatch(P.derivePersonalizedStart({ goal: 'muscle', training_days: 3, gym_access: 'full_gym' }, { catalog: cat }), P.describeReasons);
  assert.equal(m.kind, 'match');
  assert.equal(m.name, 'Muscle Gain');
  assert.equal(m.href, 'program-muscle-gain.html');
  assert.ok(Array.isArray(m.reasons));
  const noFit = catalogOf([TODAY_ROWS[0]]);
  assert.deepEqual(R.equipmentMatch(P.derivePersonalizedStart({ goal: 'fatloss', gym_access: 'bodyweight' }, { catalog: noFit })), { kind: 'no_fit' });
  assert.deepEqual(R.equipmentMatch(P.derivePersonalizedStart({ goal: 'muscle' }, { catalog: [] })), { kind: 'unknown' });
  const noPage = catalogOf([Object.assign({}, TODAY_ROWS[1], { page_path: null })]);
  assert.deepEqual(R.equipmentMatch(P.derivePersonalizedStart({ goal: 'muscle', gym_access: 'full_gym' }, { catalog: noPage })), { kind: 'unknown' });
  assert.deepEqual(R.equipmentMatch(null), { kind: 'unknown' });
});

/* ── page wiring (static checks on the real files) ─────────────────────── */
const COMPLETE = fs.readFileSync(path.join(__dirname, 'workout-complete.html'), 'utf8');
const PROFILE = fs.readFileSync(path.join(__dirname, 'profile.html'), 'utf8');
function fnBody(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' exists');
  let i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  return src.slice(start, i + 1);
}

test('Completion page loads the rules, the path rule and the ranking, and renders one card', () => {
  ['personalization-core.js', 'program-page.js', 'ready-for-weights.js'].forEach((f) => {
    assert.equal(COMPLETE.split('src="' + f + '"').length - 1, 1, f);
  });
  assert.equal(COMPLETE.split('id="weightsCard"').length - 1, 1);
  assert.equal(COMPLETE.split('renderWeightsCard(w, bwStatuses)').length - 1, 1);
  const body = fnBody(COMPLETE, 'renderWeightsCard');
  assert.match(body, /R\.rankingProfile\(prof\)/);
  assert.match(body, /ProgramPage\.pagePathFor/);
  assert.match(body, /pcLoadCatalog/);
});

test('the card reads only: no writes, no enrolment, no purchase', () => {
  const body = fnBody(COMPLETE, 'renderWeightsCard');
  assert.doesNotMatch(body, /\.(insert|update|upsert|delete|rpc)\(/);
  assert.doesNotMatch(body, /user_programs|purchases|checkout|bwChoose/);
});

test('Profile’s equipment sheet writes gym_access and nothing else', () => {
  const body = fnBody(PROFILE, 'saveEquip');
  assert.match(body, /\.update\(\{ gym_access: value \}\)/);
  assert.equal((body.match(/\.update\(/g) || []).length, 1);
  assert.doesNotMatch(body, /insert|upsert|user_programs|target_calories|pgRemap/);
  assert.doesNotMatch(fnBody(PROFILE, 'showEquipMatch'), /\.(insert|update|upsert|delete)\(/);
  assert.match(PROFILE, /get\('edit'\) === 'equipment'\) openEquip\(\)/);
  ['personalization-core.js', 'ready-for-weights.js'].forEach((f) => {
    assert.equal(PROFILE.split('src="' + f + '"').length - 1, 1, f);
  });
});

/* ── the real renderWeightsCard, run in a sandbox ─────────────────────── */
const vm = require('node:vm');
function runCard({ programSlug = 'bodyweight_foundations', statuses = [TERMINAL], catalog = TODAY,
                   profile = BEGINNER_MUSCLE, profileError = false, withRules = true } = {}) {
  const el = { innerHTML: '' };
  const writes = [];
  const query = {
    select() { return query; }, eq() { return query; },
    maybeSingle: async () => { if (profileError) throw new Error('offline'); return { data: profile }; },
    insert() { writes.push('insert'); return query; }, update() { writes.push('update'); return query; },
    upsert() { writes.push('upsert'); return query; }
  };
  const ctx = {
    document: { getElementById: (id) => (id === 'weightsCard' ? el : null) },
    supabaseClient: { from: () => query },
    user: { id: 'u1' },
    pcCached: () => catalog, pcLoadCatalog: async () => catalog,
    Personalization: P, ProgramPage: PP,
    ReadyForWeights: withRules ? R : undefined
  };
  vm.createContext(ctx);
  vm.runInContext(fnBody(COMPLETE, 'esc') + '\n' + 'async ' + fnBody(COMPLETE, 'renderWeightsCard'), ctx);
  return ctx.renderWeightsCard({ program_slug: programSlug }, statuses).then(() => ({ html: el.innerHTML, writes }));
}

test('rendered: today, only Update my equipment, and nothing is written', async () => {
  const r = await runCard();
  assert.match(r.html, /Ready for weights\?/);
  assert.match(r.html, /<a class="prog-btn primary" href="profile\.html\?edit=equipment">Update my equipment<\/a>/);
  assert.doesNotMatch(r.html, /See |program\.html/);
  assert.deepEqual(r.writes, []);
});

test('rendered: the direct link appears once the target is published and ranked first', async () => {
  const cat = catalogOf(TODAY_ROWS.concat([home('home_strength', 'Home Strength', 'muscle', 'Beginner – Intermediate', 5)]));
  const r = await runCard({ catalog: cat });
  assert.match(r.html, /href="program\.html\?slug=home_strength">See Home Strength<\/a>/);
  assert.match(r.html, /Home Strength uses dumbbells and a long resistance band\./);
});

test('rendered: nothing for other Programs, nothing without an end-of-path exercise', async () => {
  assert.equal((await runCard({ programSlug: 'muscle_gain' })).html, '');
  assert.equal((await runCard({ statuses: [{ name: 'Plank', status: 'one_more' }] })).html, '');
  assert.equal((await runCard({ withRules: false })).html, '');
});

test('rendered: a failed profile read drops only the direct link', async () => {
  const cat = catalogOf(TODAY_ROWS.concat([home('home_strength', 'Home Strength', 'muscle', 'Beginner – Intermediate', 5)]));
  const r = await runCard({ catalog: cat, profileError: true });
  assert.match(r.html, /Update my equipment/);
  assert.doesNotMatch(r.html, /See Home Strength/);
});
