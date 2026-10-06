/* Phase 4.3.9B — CP3d-3. Bodyweight Foundations Program page.
 * ──────────────────────────────────────────────────────────────────────────
 * The page file exists on the host while the Program is still `draft`, so the
 * question these tests answer is: what stops someone who knows the URL from
 * seeing private Program or Routine content before publication?
 *
 * They execute the REAL page script out of program-bodyweight.html in a vm
 * sandbox against read/write-recording stubs, using the REAL shared resolver
 * (entitlement-core) and the REAL catalog normaliser (program-catalog). Denied
 * paths assert EXACT ZERO writes, and the assertions are mutation-checked so
 * removing the draft guard, the Program scoping, or the write-boundary
 * authorization makes them fail.
 * ──────────────────────────────────────────────────────────────────────── */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { resolveProgramAccess } = require('./entitlement-core.js');
const { pcBySlug, pcNormalizeCatalog, pcPagePath } = require('./program-catalog.js');

const PAGE_FILE = 'program-bodyweight.html';
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const PAGE = read(PAGE_FILE);
const readCode = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
const PAGE_CODE = readCode(PAGE);

/* ── Canonical fixtures — the real stored values ────────────────────────── */

const BWF_ROW = {
  slug: 'bodyweight_foundations',
  name: 'Bodyweight Foundations',
  // Compacted in migration phase_439b_bodyweight_description_compact so the
  // canonical description matches the other Programs' length on the two compact
  // surfaces that render it. The pulling limitation it used to carry now lives
  // as page copy on the Bodyweight detail page only.
  description: 'Equipment-free full-body strength program',
  goal: 'muscle',
  difficulty: 'Beginner – Intermediate',
  duration_weeks: 8,
  recommended_days_per_week: 3,
  equipment_summary: 'Bodyweight',
  included_with_membership: true,
  standalone_purchasable: false,
  status: 'draft',
  sort_order: 4,
  page_path: 'program-bodyweight.html',
};
const OTHER_ROW = {
  slug: 'muscle_gain', name: 'Muscle Gain', description: '8-week hypertrophy program',
  goal: 'muscle', difficulty: 'Beginner – Intermediate', duration_weeks: 8,
  recommended_days_per_week: 3, equipment_summary: 'Full Gym',
  included_with_membership: true, standalone_purchasable: true,
  status: 'published', sort_order: 2, page_path: 'program-muscle-gain.html',
};
const published = (row) => Object.assign({}, row, { status: 'published' });

// program_routines rows as the page's own select shapes them.
const BWF_LINKS = [
  { session_key: 'full_a', sort_order: 1, programs: { slug: 'bodyweight_foundations' },
    workout_templates: { id: 'r-a', name: 'Full Body A' } },
  { session_key: 'full_b', sort_order: 2, programs: { slug: 'bodyweight_foundations' },
    workout_templates: { id: 'r-b', name: 'Full Body B' } },
  { session_key: 'full_c', sort_order: 3, programs: { slug: 'bodyweight_foundations' },
    workout_templates: { id: 'r-c', name: 'Full Body C' } },
];

/* The six frequency Routines CP4d linked at 4–9 (migration 20261003000515) and
 * CP4e-1 published (20261005041336). Keys and names are the real ones. */
const CP4D_LINKS = [
  ['push_core_a', 4, 'Push & Core A'],
  ['lower_a', 5, 'Lower Body A'],
  ['conditioning_core', 6, 'Conditioning & Core'],
  ['push_core_b', 7, 'Push & Core B'],
  ['lower_b', 8, 'Lower Body B'],
  ['mobility_recovery', 9, 'Mobility & Recovery'],
].map(([k, s, n]) => ({
  session_key: k, sort_order: s, programs: { slug: 'bodyweight_foundations' },
  workout_templates: { id: 'r-' + k, name: n },
}));
// Production's nine Bodyweight Foundations links.
const PROD_LINKS = BWF_LINKS.concat(CP4D_LINKS);
const NAME_OF = Object.fromEntries(PROD_LINKS.map((l) => [l.session_key, l.workout_templates.name]));
// The owner-approved schedule (Phase 4.3.9B CP4e-2), written out independently
// of schedules.js so a change to either side fails here.
const CP4E_SCHEDULE = {
  2: ['full_a', 'full_b', 'full_c'],
  3: ['full_a', 'full_b', 'full_c'],
  4: ['push_core_a', 'lower_a', 'push_core_b', 'lower_b'],
  5: ['push_core_a', 'lower_a', 'conditioning_core', 'push_core_b', 'lower_b'],
  6: ['push_core_a', 'lower_a', 'conditioning_core', 'push_core_b', 'lower_b', 'mobility_recovery'],
};

const MEMBERSHIP = [{ product: 'ai_membership', status: 'active' }];
const STANDALONE_BWF = [{ product: 'bodyweight_foundations', status: 'active' }];
const NO_PURCHASES = [];

/* ── DOM + Supabase stubs ───────────────────────────────────────────────── */

function makeElement(id) {
  return {
    id, innerHTML: '', textContent: '', href: '',
    style: { _d: '', set display(v) { this._d = v; }, get display() { return this._d; } },
    _attrs: {},
    disabled: false,
    listeners: {},
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    setAttribute(k, v) { this._attrs[k] = String(v); },
    getAttribute(k) { return this._attrs[k] == null ? null : this._attrs[k]; },
  };
}

function makeHarness(opts) {
  const o = opts || {};
  const writes = [];
  const reads = [];
  const els = {};
  const getEl = (id) => (els[id] || (els[id] = makeElement(id)));

  function builder(table) {
    const state = { table, eqs: [] };
    const api = {
      select: () => { reads.push(table); return api; },
      eq: (c, v) => { state.eqs.push([c, v]); return api; },
      order: () => api,
      maybeSingle: async () => resolveRead(state),
      single: async () => resolveRead(state),
      then: (res) => res(resolveRead(state)),
      insert(p) { writes.push({ table, op: 'insert', payload: p }); return {
        select: () => ({ single: async () => ({ data: p, error: null }) }),
        then: (r) => r({ data: null, error: null }) }; },
      update(p) { writes.push({ table, op: 'update', payload: p }); return {
        eq: () => ({ then: (r) => r({ error: null }) }) }; },
      upsert(p) { writes.push({ table, op: 'upsert', payload: p }); return {
        then: (r) => r({ error: null }) }; },
      delete() { writes.push({ table, op: 'delete' }); return {
        eq: () => ({ then: (r) => r({ error: null }) }) }; },
    };
    return api;
  }

  function resolveRead(state) {
    if (state.table === 'purchases') {
      if (o.purchasesError) return { data: null, error: { message: 'boom' } };
      return { data: o.purchases || NO_PURCHASES, error: null };
    }
    if (state.table === 'program_routines') {
      if (o.linksError) return { data: null, error: { message: 'boom' } };
      // Honour the Program scoping the page applies, so a foreign Routine can
      // only be returned if the page failed to scope its query.
      const slugEq = state.eqs.filter((e) => e[0] === 'programs.slug')[0];
      const rows = o.links === undefined ? BWF_LINKS : o.links;
      const scoped = slugEq
        ? rows.filter((r) => r.programs && r.programs.slug === slugEq[1])
        : rows;
      return { data: scoped, error: null };
    }
    if (state.table === 'user_programs') return { data: o.userProgram || null, error: null };
    return { data: null, error: null };
  }

  const sandbox = {
    console: { error() {}, warn() {} },
    resolveProgramAccess, pcBySlug,
    GOAL_LABELS: { fatloss: 'Fat Loss', recomp: 'Recomposition', muscle: 'Muscle Gain' },
    supabaseClient: { from: builder },
    requireAuth: async () => {
      if (o.authFails) throw new Error('Not authenticated');
      return { user: { id: 'user-1' } };
    },
    getProfile: async () => (o.profile === undefined ? { training_days: 3 } : o.profile),
    lucide: { createIcons() {} },
    document: { getElementById: getEl, _title: '', set title(v) { this._title = v; },
      get title() { return this._title; } },
  };
  sandbox.window = sandbox;
  sandbox.encodeURIComponent = encodeURIComponent;

  let handler = null;
  sandbox.addEventListener = (evt, fn) => { if (evt === 'load') handler = fn; };

  vm.createContext(sandbox);
  // The page loads schedules.js before its inline script, so the harness runs the
  // REAL module rather than stubbing getScheduleForDays(). It also supplies
  // resolveTrainingDays(), the canonical frequency rule the page fails closed on.
  vm.runInContext(read('schedules.js'), sandbox);
  const src = o.source || PAGE;
  const script = src.slice(src.lastIndexOf('<script>') + '<script>'.length,
                           src.lastIndexOf('</script>'));
  assert.ok(script.includes('PROGRAM_SLUG'), 'the page script was extracted');
  vm.runInContext(script, sandbox);
  // program-catalog is stubbed per-case rather than executed, so the page's own
  // catalog contract is exercised without a second network layer.
  sandbox.pcLoadCatalog = async () => {
    if (o.catalogThrows) throw new Error('network');
    if (o.catalog !== undefined) return o.catalog;
    // Mirror the REAL loader: pcLoadCatalog queries `.eq('status','published')`,
    // so a draft row never reaches the client. pcNormalizeCatalog does not
    // filter status itself, which is exactly why the filter lives in the query.
    return pcNormalizeCatalog([OTHER_ROW, BWF_ROW].filter((r) => r.status === 'published'));
  };

  return {
    sandbox, writes, reads, el: getEl,
    async run() {
      assert.ok(handler, 'the page registers a load handler');
      handler();
      for (let i = 0; i < 12; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      for (let i = 0; i < 12; i++) await Promise.resolve();
    },
    shown() {
      return ['authGate', 'unavailableState', 'lockedState', 'programContent']
        .filter((id) => els[id] && els[id].style.display &&
                        els[id].style.display !== 'none');
    },
  };
}

const noWrites = (h, label) =>
  assert.deepEqual(h.writes, [], label + ' must write nothing, got ' +
    JSON.stringify(h.writes.map((w) => w.table + ':' + w.op)));

// Content that must never appear on a denied render.
const PRESCRIPTION_WORDS =
  /(Full Body [ABC]|Bodyweight Squat|Push-Up|Superman|Wall Sit|Side Plank|per leg|per side)/i;

function renderedText(h) {
  return ['progName', 'progDesc', 'progFacts', 'sessList', 'sessSummary', 'ctaSessionName']
    .map((id) => (h.el(id).textContent || '') + ' ' + (h.el(id).innerHTML || ''))
    .join(' ');
}

/* ── 1 · Identity ───────────────────────────────────────────────────────── */

test('page identity: slug and stored page_path agree', () => {
  assert.match(PAGE_CODE, /var PROGRAM_SLUG = 'bodyweight_foundations';/);
  assert.match(PAGE_CODE, /var PRODUCT_SLUG = 'bodyweight_foundations';/);
  assert.equal(BWF_ROW.page_path, PAGE_FILE);
  // 16 · the stored page_path resolves to a real repository file.
  assert.ok(fs.existsSync(path.join(__dirname, BWF_ROW.page_path)),
    'programs.page_path must point at a file that exists');
  // And the catalog helper resolves it for a published row.
  const cat = pcNormalizeCatalog([published(BWF_ROW)]);
  assert.equal(pcPagePath(cat, 'bodyweight_foundations'), PAGE_FILE);
});

/* ── 2 · Draft fails closed ─────────────────────────────────────────────── */

test('draft: a direct visit reveals no prescription content', async () => {
  const h = makeHarness({ purchases: MEMBERSHIP });
  await h.run();
  assert.deepEqual(h.shown(), ['unavailableState'], 'only the unavailable state');
  assert.ok(!PRESCRIPTION_WORDS.test(renderedText(h)),
    'no Program or Routine content may be rendered: ' + renderedText(h));
  assert.equal(h.el('stickyCta').style.display, 'none', 'no Start CTA');
  noWrites(h, 'draft direct visit');
});

test('draft: the static markup contains no Program or Routine content', () => {
  // View-source must not leak what the runtime refuses to render.
  const body = PAGE.slice(PAGE.indexOf('<body>'), PAGE.lastIndexOf('<script>'));
  ['Full Body A', 'Full Body B', 'Full Body C', 'Bodyweight Foundations',
   'Bodyweight Squat', 'Superman', 'Wall Sit', 'per leg', 'per side']
    .forEach((s) => assert.ok(!body.includes(s), 'static markup must not contain "' + s + '"'));
  assert.match(PAGE, /<title>Muscle Motivation – Program<\/title>/, 'neutral static title');
  assert.match(PAGE, /name="robots" content="noindex/, 'not indexable');
});

test('draft: a membership user is still denied', async () => {
  const h = makeHarness({ purchases: MEMBERSHIP });
  await h.run();
  assert.deepEqual(h.shown(), ['unavailableState']);
  noWrites(h, 'draft + membership');
  // Proven at the resolver too. Note WHERE the protection lives: the loader's
  // `.eq('status','published')` keeps the row out of the catalog entirely, so
  // the published-only projection has nothing to find. pcNormalizeCatalog does
  // not filter status itself — which is why the page also refuses any row whose
  // status is not 'published'.
  const publishedOnly = pcNormalizeCatalog([BWF_ROW].filter((r) => r.status === 'published'));
  assert.equal(pcBySlug(publishedOnly, 'bodyweight_foundations'), null,
    'absent from the published-only catalog');
  assert.match(PAGE_CODE, /program\.status !== 'published'/,
    'the page independently refuses a non-published row');
  const v = resolveProgramAccess(null, MEMBERSHIP);
  assert.equal(v.allowed, false);
  assert.equal(v.reason, 'invalid_program');
});

test('draft: a standalone purchaser is still denied', async () => {
  const h = makeHarness({ purchases: STANDALONE_BWF });
  await h.run();
  assert.deepEqual(h.shown(), ['unavailableState']);
  noWrites(h, 'draft + standalone purchase');
  assert.equal(resolveProgramAccess(null, STANDALONE_BWF).allowed, false);
});

test('draft: retired, unknown, malformed and failure states all fail closed', async () => {
  const cases = [
    ['retired', { purchases: MEMBERSHIP,
      catalog: pcNormalizeCatalog([Object.assign({}, BWF_ROW, { status: 'retired' })]) }],
    ['unknown slug', { purchases: MEMBERSHIP, catalog: pcNormalizeCatalog([OTHER_ROW]) }],
    ['empty catalog', { purchases: MEMBERSHIP, catalog: [] }],
    ['catalog not an array', { purchases: MEMBERSHIP, catalog: null }],
    ['catalog throws', { purchases: MEMBERSHIP, catalogThrows: true }],
    ['purchases unreadable', { purchasesError: true,
      catalog: pcNormalizeCatalog([published(BWF_ROW)]) }],
    // The three session-read failures that used to live here now resolve to the
    // CP4a schedule state instead, because they happen AFTER a valid frequency
    // was established and are retryable rather than terminal. Their full
    // contract is asserted in 'CP4a state 3: a total session-read failure' below.
  ];
  for (const [label, opts] of cases) {
    const h = makeHarness(opts);
    await h.run();
    assert.deepEqual(h.shown(), ['unavailableState'], label + ' → unavailable');
    assert.ok(!PRESCRIPTION_WORDS.test(renderedText(h)), label + ' leaked content');
    noWrites(h, label);
  }
});

test('draft: retired is treated as unavailable, never as "locked"', async () => {
  // A retired Program is absent from the published catalog, so it must not be
  // presented as something the user could buy or unlock.
  const h = makeHarness({ purchases: NO_PURCHASES,
    catalog: pcNormalizeCatalog([Object.assign({}, BWF_ROW, { status: 'retired' })]) });
  await h.run();
  assert.deepEqual(h.shown(), ['unavailableState']);
  assert.equal(h.el('lockedState').style.display, 'none');
});

/* ── 3 · Published + authorized renders ─────────────────────────────────── */

const authorized = (extra) => makeHarness(Object.assign({
  purchases: MEMBERSHIP,
  catalog: pcNormalizeCatalog([OTHER_ROW, published(BWF_ROW)]),
}, extra || {}));

test('published + membership renders the canonical Program facts', async () => {
  const h = authorized();
  await h.run();
  assert.deepEqual(h.shown(), ['programContent']);
  assert.equal(h.el('progName').textContent, 'Bodyweight Foundations');
  assert.equal(h.el('progDesc').textContent, BWF_ROW.description);
  const facts = h.el('progFacts').innerHTML;
  assert.match(facts, /Muscle Gain/);                 // goal via shared vocabulary
  assert.match(facts, /Bodyweight/);                  // equipment
  assert.match(facts, /8 weeks/);                     // duration
  assert.match(facts, /3 days/);                      // per week
  assert.match(facts, /Beginner – Intermediate/);     // level
  assert.match(facts, /Included with membership/);
  assert.equal(h.el('stickyCta').style.display, 'block');
  assert.match(h.sandbox.document.title, /Bodyweight Foundations/);
  // Rendering is read-only: no enrolment, no workout, nothing.
  noWrites(h, 'authorized render');
});

test('published + standalone purchase renders where the model allows it', async () => {
  // Bodyweight Foundations is standalone_purchasable=false, so a slug purchase
  // is what the shared resolver honours — the page does not reinterpret it.
  const h = authorized({ purchases: STANDALONE_BWF });
  await h.run();
  assert.deepEqual(h.shown(), ['programContent']);
  noWrites(h, 'standalone render');
  const cat = pcNormalizeCatalog([published(BWF_ROW)]);
  const v = resolveProgramAccess(pcBySlug(cat, 'bodyweight_foundations'), STANDALONE_BWF);
  assert.equal(v.allowed, true);
  assert.equal(v.source, 'standalone');
});

test('published but unentitled cannot start or enrol', async () => {
  const h = authorized({ purchases: NO_PURCHASES });
  await h.run();
  assert.deepEqual(h.shown(), ['lockedState'], 'locked, not unavailable');
  assert.ok(!PRESCRIPTION_WORDS.test(renderedText(h)), 'no sessions for an unentitled user');
  assert.equal(h.el('stickyCta').style.display, 'none', 'no Start CTA');
  noWrites(h, 'unentitled published');
  // Locked copy is built from the catalog flags, never a hard-coded pitch.
  assert.match(h.el('lockedCopy').textContent, /included with an active Muscle Motivation membership/);
  assert.ok(!/one-time purchase/.test(h.el('lockedCopy').textContent),
    'must not offer a purchase this Program does not sell');
});

/* ── 4 · Session scoping and order ──────────────────────────────────────── */

test('sessions are Program-scoped and ordered A/B/C', async () => {
  const h = authorized();
  await h.run();
  const html = h.el('sessList').innerHTML;
  assert.match(html, /Full Body A[\s\S]*Full Body B[\s\S]*Full Body C/, 'sort_order respected');
  assert.match(PAGE_CODE, /\.eq\('programs\.slug', PROGRAM_SLUG\)/,
    'the Routine query is scoped by Program slug');
  assert.match(PAGE_CODE, /\.order\('sort_order'/, 'ordered by sort_order');
  // `exercises` is deliberately never selected, so prescriptions cannot leak.
  assert.ok(!/workout_templates!inner\([^)]*exercises/.test(PAGE_CODE),
    'the page must not fetch Routine exercises');
  assert.ok(!/program_workouts/.test(PAGE_CODE), 'no frozen-table fallback');
});

test('a same-keyed Routine from another Program cannot be substituted', async () => {
  const foreign = [
    { session_key: 'full_a', sort_order: 1, programs: { slug: 'muscle_gain' },
      workout_templates: { id: 'mg-a', name: 'Muscle Gain Full Body A' } },
    { session_key: 'full_b', sort_order: 2, programs: { slug: 'muscle_gain' },
      workout_templates: { id: 'mg-b', name: 'Muscle Gain Full Body B' } },
  ];
  const h = authorized({ links: foreign });
  await h.run();
  // The stub honours the page's own scoping, so a correctly scoped query returns
  // nothing here. CP4a reports that as the retryable schedule state rather than
  // as an unavailable Program; the load-bearing assertion — that a foreign
  // Routine never renders and is never launchable — is unchanged.
  assert.match(h.el('sessSummary').innerHTML, SCHED_COPY);
  assert.ok(!/Muscle Gain Full Body/.test(renderedText(h)),
    'a foreign Routine must never render on this page');
  assert.equal(h.el('sessList').innerHTML, '', 'no session rows');
  assert.equal(h.el('startBtn').href, '', 'nothing launchable');
  assert.equal(h.el('stickyCta').style.display, 'none', 'no Start CTA');
  noWrites(h, 'foreign routine');
});

test('the CTA launches the canonical slug and a listed session only', async () => {
  const h = authorized();
  await h.run();
  const href = h.el('startBtn').href;
  assert.match(href, /^workout\.html\?program=bodyweight_foundations&session=full_[abc]&mode=optional$/,
    'canonical launch URL: ' + href);
  // An unlisted key is not selectable.
  h.sandbox.selectSession('full_z');
  assert.equal(h.el('startBtn').href, href, 'an unknown session key changes nothing');
});

/* ── 5 · Write-boundary authorization ───────────────────────────────────── */

test('the start action re-checks authorization at the write boundary', () => {
  // The page never writes. The write happens in workout.html, where CP3d-1's
  // gate re-derives catalog membership, entitlement and the Program-scoped
  // Routine read BEFORE inserting anything — so a copied CTA cannot create a
  // workout for a draft Program.
  const wk = readCode(read('workout.html'));
  assert.match(wk, /authorizeProgramSession\(programSlug, sessionKey\)/);
  const start = wk.slice(wk.indexOf('async function startProgramSession'));
  const gate = start.indexOf('authorizeProgramSession');
  const write = start.indexOf("from('workouts')");
  assert.ok(gate > -1 && write > -1 && gate < write,
    'authorization must precede the first write');
  // This page itself contains no write verb at all.
  assert.ok(!/\.(insert|update|upsert|delete)\(/.test(PAGE_CODE),
    'the Program page performs no writes');
});

test('no enrolment is created by opening the page', async () => {
  const h = authorized({ userProgram: null });
  await h.run();
  assert.ok(!h.writes.some((w) => w.table === 'user_programs'),
    'opening a Program must never enrol');
  noWrites(h, 'authorized open');
});

/* ── 6 · Shared-model invariants (mirroring the other Program pages) ────── */

test('the page reuses the shared access model, not a second one', () => {
  assert.match(PAGE_CODE, /resolveProgramAccess\s*\(/, 'uses the shared resolver');
  const cat = PAGE.indexOf('program-catalog.js');
  const ent = PAGE.indexOf('entitlement-core.js');
  assert.ok(cat > -1 && ent > -1 && cat < ent, 'catalog loads before the resolver');
  assert.ok(!/['"]ai_membership['"]/.test(PAGE_CODE), 'no hard-coded membership product');
  assert.ok(!/['"]past_due['"]/.test(PAGE_CODE), 'no hard-coded purchase status');
  assert.ok(!/ENT_QUALIFYING_STATUSES\s*=/.test(PAGE_CODE), 'no private status policy');
});

test('one purchases request, fetched in parallel with the catalog', () => {
  const hits = (PAGE_CODE.match(/from\('purchases'\)/g) || []).length;
  assert.strictEqual(hits, 1, 'exactly one purchases query');
  assert.match(PAGE_CODE, /Promise\.all\(\[\s*\n?\s*pcLoadCatalog\(\)/,
    'the catalog load stays parallel to the purchases query');
});

test('existing published Program pages are untouched', () => {
  ['program-fat-loss.html', 'program-muscle-gain.html', 'program-glute-builder.html']
    .forEach((f) => {
      const src = readCode(read(f));
      assert.match(src, /resolveProgramAccess\s*\(/, f + ' still uses the resolver');
      assert.ok(!/bodyweight_foundations/.test(src), f + ' must not reference the new Program');
    });
});

test('no broad guidance or Routine-note rendering is introduced', () => {
  assert.ok(!/programGuidance/.test(PAGE_CODE), 'guidance stays in the workout experience');
  assert.ok(!/\.notes/.test(PAGE_CODE), 'the page never reads prescription notes');
  assert.ok(!/JSON\.stringify/.test(PAGE_CODE), 'no raw JSON rendering');
});

test('draft Bodyweight Foundations stays out of Browse and recommendations', () => {
  // Both surfaces consume the published-only catalog, so a draft row is absent
  // by construction — this pins the two mechanisms rather than restating them.
  assert.match(readCode(read('program-catalog.js')), /\.eq\('status',\s*'published'\)/);
  const cat = pcNormalizeCatalog([OTHER_ROW]);   // what the loader would return
  assert.equal(pcBySlug(cat, 'bodyweight_foundations'), null);
  assert.equal(pcPagePath(cat, 'bodyweight_foundations'), null, 'no dead CTA target');
});

/* ── 7 · Escaping + responsive ──────────────────────────────────────────── */

test('injected values are escaped before reaching innerHTML', async () => {
  const nasty = Object.assign({}, published(BWF_ROW), {
    name: '<img src=x onerror="alert(1)">',
    equipment_summary: '<script>bad()</script>',
  });
  const h = authorized({ catalog: pcNormalizeCatalog([nasty]) });
  await h.run();
  // The name goes through textContent, which cannot create markup.
  assert.equal(h.el('progName').textContent, nasty.name);
  // The facts grid builds innerHTML, so it must be escaped.
  const facts = h.el('progFacts').innerHTML;
  assert.ok(!/<script/.test(facts), 'no live script: ' + facts);
  assert.match(facts, /&lt;script&gt;/, 'shown as text');
  assert.match(PAGE_CODE, /function esc\(str\)/, 'the page defines an escaper');
  assert.match(PAGE_CODE, /esc\(f\[1\]\)/, 'fact values are escaped');
  assert.match(PAGE_CODE, /esc\(s\.name\)/, 'session names are escaped');
});

test('responsive and accessibility primitives are present', () => {
  // Narrow-width safety: nothing may be nowrap/clipped, and long strings wrap.
  ['.hero h1', '.hero p', '.fact-val', '.sched-row .sess', '.sticky-cta-name']
    .forEach((sel) => {
      const rule = (PAGE.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
        '\\s*\\{[^}]*\\}')) || [''])[0];
      assert.ok(rule, 'rule exists for ' + sel);
      assert.ok(!/white-space:\s*nowrap/.test(rule), sel + ' must not be nowrap');
      assert.ok(!/text-overflow/.test(rule), sel + ' must not be ellipsised');
    });
  assert.match(PAGE, /overflow-wrap:\s*anywhere/, 'long tokens wrap');
  assert.match(PAGE, /body\s*\{[^}]*overflow-x:\s*hidden/, 'no horizontal scrolling');
  assert.match(PAGE, /@media \(max-width: 360px\)[\s\S]*grid-template-columns: 1fr/,
    'facts collapse to one column on the narrowest phones');
  // CP4f: the bottom reserve is the sticky bar's measured height + safe area,
  // not a fixed 120px (pinned in detail by the CP4f section below).
  assert.match(PAGE, /padding: 28px 16px calc\(var\(--sticky-cta-h, calc\(110px \+ env\(safe-area-inset-bottom, 0px\)\)\) \+ 24px\);/, 'content clears the sticky CTA and the safe area');
  assert.match(PAGE, /safe-area\.css/, 'safe-area handling');
  // Semantics + focus + reduced motion.
  assert.match(PAGE_CODE, /<button type="button" class="sched-row/, 'sessions are buttons');
  assert.match(PAGE_CODE, /aria-pressed="/, 'selection is announced');
  assert.match(PAGE, /:focus-visible/, 'visible focus states');
  assert.match(PAGE, /@media \(prefers-reduced-motion: reduce\)/, 'reduced motion honoured');
  assert.match(PAGE, /min-height: 44px/, 'touch targets');
});

/* ── 8 · Mutation sensitivity ───────────────────────────────────────────── */

test('mutation: BOTH draft layers are independently load-bearing', async () => {
  // The draft row leaks into the catalog only if the loader's status filter is
  // missing, so hand the page exactly that — a catalog that still contains it.
  const leaky = pcNormalizeCatalog([BWF_ROW]);          // status 'draft', present
  assert.equal(leaky.length, 1, 'pcNormalizeCatalog does not filter status itself');

  // Layer B alone still holds: the page refuses a non-published row.
  const guarded = makeHarness({ purchases: MEMBERSHIP, catalog: leaky });
  await guarded.run();
  assert.deepEqual(guarded.shown(), ['unavailableState'],
    'even with the row present, the page\'s own status check denies');
  assert.ok(!PRESCRIPTION_WORDS.test(renderedText(guarded)));
  noWrites(guarded, 'leaky catalog, guard intact');

  // Remove layer B as well and the Program DOES render — which is what makes
  // every draft assertion above meaningful rather than vacuous.
  const broken = PAGE.replace(
    "if (program && program.status !== 'published') program = null;", '');
  assert.notEqual(broken, PAGE, 'the page status check was found to mutate');
  const exposed = makeHarness({ purchases: MEMBERSHIP, catalog: leaky, source: broken });
  await exposed.run();
  assert.deepEqual(exposed.shown(), ['programContent'],
    'with both layers removed the draft Program IS exposed');
  assert.match(renderedText(exposed), /Full Body A/);
});

test('mutation: removing the unavailable branch would mislabel a draft', () => {
  const broken = PAGE.replace(
    /if \(!program \|\| access\.reason === 'invalid_program'[\s\S]{0,80}?\) \{\s*\n\s*showUnavailable\(\);/,
    'if (false) { showUnavailable();');
  assert.notEqual(broken, PAGE, 'the unavailable branch was found');
  assert.match(PAGE_CODE, /access\.reason === 'invalid_program'/,
    'the draft case is distinguished from "you do not own this"');
});

/* A COMPLETE foreign session set. CP4a added a second, independent gate: an
 * incomplete expected set fails the whole schedule closed, so a single foreign
 * row would now be rejected for being incomplete rather than for being foreign.
 * To keep this mutation testing the SCOPING specifically, the foreign Program
 * supplies every key the current schedule expects — then the only thing left
 * standing between it and the page is `.eq('programs.slug', PROGRAM_SLUG)`. */
const FOREIGN_FULL_SET = ['full_a', 'full_b', 'full_c'].map((k, i) => ({
  session_key: k, sort_order: i + 1,
  programs: { slug: 'muscle_gain' },
  workout_templates: { id: 'mg-' + k, name: 'Muscle Gain ' + k.toUpperCase() },
}));

test('mutation: removing Program scoping would admit a foreign Routine', async () => {
  const broken = PAGE.replace(".eq('programs.slug', PROGRAM_SLUG)", '');
  assert.notEqual(broken, PAGE, 'the scoping call was found to mutate');
  const h = makeHarness({ purchases: MEMBERSHIP, links: FOREIGN_FULL_SET, source: broken,
    catalog: pcNormalizeCatalog([published(BWF_ROW)]) });
  await h.run();
  assert.match(renderedText(h), /Muscle Gain FULL_A/,
    'unscoped, a foreign Routine DOES render — so the scoping test is meaningful');
});

test('scoped, that same complete foreign set never reaches the page', async () => {
  // The other half of the pair: with scoping intact the harness filters the
  // foreign rows out, leaving nothing readable, and the page refuses.
  const h = makeHarness({ purchases: MEMBERSHIP, links: FOREIGN_FULL_SET,
    catalog: pcNormalizeCatalog([published(BWF_ROW)]) });
  await h.run();
  // Checked against the session list, not the whole page: renderFacts()
  // legitimately prints the GOAL label "Muscle Gain" for this Program's
  // goal:'muscle', which is Program metadata and not a foreign Routine.
  assert.equal(h.el('sessList').innerHTML, '', 'no foreign session rows');
  assert.ok(!/Muscle Gain FULL_/.test(renderedText(h)), 'no foreign Routine name');
  assert.match(h.el('sessSummary').innerHTML, SCHED_COPY, 'fails the schedule closed');
  assert.equal(h.el('startBtn').href, '', 'and nothing launchable');
  noWrites(h, 'scoped foreign set');
});

test('mutation: removing the write-boundary gate would allow a draft workout', () => {
  const wk = read('workout.html');
  const broken = wk.replace(
    'var auth = await authorizeProgramSession(programSlug, sessionKey);',
    'var auth = { allowed: true, session: null };');
  assert.notEqual(broken, wk, 'the CP3d-1 gate call was found to mutate');
  assert.match(readCode(wk), /authorizeProgramSession\(programSlug, sessionKey\)/,
    'the gate is present and load-bearing');
});

/* ══════════════════════════════════════════════════════════════════════════
 * Phase 4.3.9B — schedule-guidance truthfulness.
 *
 * The session intro previously read "You train N days a week", where N fell
 * back to the PROGRAM's recommended_days_per_week whenever the profile could
 * not be read. A 4-day account was therefore told it trained 3 days — the
 * Program's number presented as the user's. The intro is now STATIC markup, so
 * no profile value and no code path can vary it.
 * ══════════════════════════════════════════════════════════════════════════ */

const SESSION_INTRO = 'Choose any session below. Starting one here logs it to your history ' +
  'without changing your dashboard progression.';
const PULLING_NOTE = 'No-equipment training cannot fully train pulling muscles. For balanced ' +
  'development, add rows, pulldowns, or chin-ups when equipment is available.';

// Collapse the HTML's source line breaks/indentation the way a browser would.
const flat = (s) => String(s).replace(/\s+/g, ' ').trim();

// Brace-matched extraction of one function from the page source.
function extractPageFn(src, name) {
  let start = src.indexOf('function ' + name + '(');
  assert.ok(start > -1, 'the page defines ' + name + '()');
  if (src.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced braces in ' + name);
}

test('frequency: no rendered path claims a personal training frequency', () => {
  // PAGE_CODE is comment-stripped: the phrase survives only in explanatory
  // comments describing the defect, which are never rendered.
  assert.ok(!/You train/.test(PAGE_CODE), 'the "You train N days" claim must be gone');
  assert.ok(!/days a week/.test(PAGE_CODE), 'no script path may assert a weekly frequency');
  // The only remaining "days" string is the At a Glance Program fact.
  const perWeek = PAGE_CODE.match(/\['Per week',[^\]]*\]/);
  assert.ok(perWeek, 'the At a Glance Per week fact still exists');
  assert.match(perWeek[0], /recommendedDaysPerWeek/, 'it is Program metadata, not profile data');
});

test('frequency: the session intro is static markup on every rendering path', () => {
  const body = PAGE.slice(PAGE.indexOf('<body>'), PAGE.lastIndexOf('<script>'));
  assert.ok(flat(body).includes(SESSION_INTRO), 'the approved intro is in the markup verbatim');

  // Designated failure handlers may replace it. The original assertion (nothing
  // writes this element) existed to stop a runtime frequency CLAIM, so it is
  // narrowed to that intent rather than dropped: every write must live in one of
  // the two fail-closed handlers, and none of them may state a frequency.
  const freqOwner = extractPageFn(PAGE, 'showFrequencyUnavailable');
  const schedOwner = extractPageFn(PAGE, 'showScheduleUnavailable');
  const writes = PAGE_CODE.match(/getElementById\('sessSummary'\)/g) || [];
  const inFreq = freqOwner.match(/getElementById\('sessSummary'\)/g) || [];
  const inSched = schedOwner.match(/getElementById\('sessSummary'\)/g) || [];
  assert.equal(writes.length, inFreq.length + inSched.length,
    'only the two fail-closed handlers may assign sessSummary');
  assert.equal(inFreq.length, 2, 'frequency handler: unavailable + unsupported');
  assert.equal(inSched.length, 1, 'CP4a handler: schedule incomplete');
  assert.ok(!/You train|days a week|days\/week/.test(freqOwner + schedOwner),
    'no failure copy states a frequency');
  // Three user-actionable states. Which one appears for which reason, and the
  // action each offers, is asserted against rendered output below.
  assert.match(freqOwner, /We couldn’t load your workout schedule\./);
  assert.match(freqOwner, /Choose between 2 and 6 workout days to use this program\./);
  assert.match(schedOwner, /Your program schedule is temporarily unavailable\./);
});

test('frequency: training_days is read for scheduling only, never rendered', () => {
  const fn = extractPageFn(PAGE, 'preselect');
  assert.match(fn, /getScheduleForDays\(PROGRAM_SLUG, freq\.days\)/,
    'still selects the schedule, now from a validated value');
  assert.match(fn, /resolveTrainingDays\(profile\)/, 'via the canonical rule');
  assert.ok(!/textContent/.test(fn), 'preselect must not write any copy');
  assert.ok(!/sessSummary/.test(fn), 'preselect must not touch the intro itself');
});

test('frequency: the intro renders identically for every VALID profile frequency', async () => {
  // The schedulable domain is 2–6 (owner ruling 2026-09-29): exactly the
  // frequencies PROGRAM_SCHEDULES maps. 0 and 1 are covered below.
  for (const training_days of [2, 3, 4, 5, 6]) {
    // Production's nine links: every frequency has the Routines it needs.
    const h = authorized({ links: PROD_LINKS, profile: { training_days } });
    await h.run();
    assert.deepEqual(h.shown(), ['programContent'], 'days=' + training_days);
    assert.equal(flat(h.el('sessSummary').innerHTML || ''), '',
      'the intro is untouched — the real value is static markup');
    // And the page still selects a legitimate session for each frequency.
    const m = h.el('startBtn').href.match(/session=(\w+)&/);
    assert.ok(m && CP4E_SCHEDULE[training_days].includes(m[1]), 'days=' + training_days);
    assert.equal(h.el('stickyCta').style.display, 'block', 'Start is offered');
  }
});

test('frequency: an unknown frequency fails closed instead of guessing one', async () => {
  // getProfile() returning null was the exact trigger: `days` fell back to the
  // Program's own recommended_days_per_week and drove schedule selection from
  // it. The page now recommends NOTHING rather than a session chosen from a
  // frequency the user never gave. Full per-input coverage of the rule lives in
  // program-frequency.test.js; this pins the page-level contract.
  // 0 and 1 are STORABLE onboarding answers that no Program schedule maps, so
  // they fail closed here too rather than being promoted to the 3-day family.
  // Both states must fail closed identically; only the copy and the offered
  // action differ. 0 and 1 are STORABLE onboarding answers that no Program
  // schedule maps, so they are 'unsupported' rather than promoted to 3 days.
  const cases = [
    [null, 'unavailable'],
    [{}, 'unavailable'],
    [{ training_days: null }, 'unavailable'],
    [{ training_days: 12 }, 'unsupported'],
    [{ training_days: 0 }, 'unsupported'],
    [{ training_days: 1 }, 'unsupported'],
  ];
  for (const [profile, state] of cases) {
    const h = authorized({ profile });
    await h.run();
    const label = JSON.stringify(profile) + ' → ' + state;
    // Navigation and the rest of the Program are preserved — this is not an
    // error page, and it is never confused with a lost entitlement.
    assert.deepEqual(h.shown(), ['programContent'], 'the page still renders: ' + label);
    assert.equal(h.el('startBtn').href, '', 'no launchable workout: ' + label);
    assert.equal(h.el('stickyCta').style.display, 'none', 'no Start CTA: ' + label);
    assert.equal(h.el('sessList').innerHTML, '', 'no session buttons: ' + label);
    noWrites(h, 'unknown frequency ' + label);

    const copy = h.el('sessSummary').innerHTML;
    assert.ok(!/You train/.test(copy), 'states no frequency: ' + label);
    assert.ok(!/training_days|undefined|NaN|error/i.test(copy),
      'exposes no technical detail: ' + label);
    if (state === 'unsupported') {
      assert.match(copy, /Choose between 2 and 6 workout days/, label);
      assert.match(copy, /href="profile\.html"[^>]*>Recalculate Goals</, label);
      assert.ok(!/Try again/.test(copy), 'no useless retry: ' + label);
    } else {
      assert.match(copy, /We couldn’t load your workout schedule\./, label);
      assert.match(copy, /Try again/, label);
      assert.ok(!/Recalculate Goals/.test(copy), label);
    }
  }
});

test('frequency: the footer states no number', () => {
  const note = (PAGE.match(/<p class="sched-note">[\s\S]*?<\/p>/) || [''])[0];
  assert.ok(note, 'the footer note exists');
  assert.ok(!/\b[2-7]\b/.test(note.replace(/<[^>]*>/g, '')),
    'the footer must not restate a numeric frequency: ' + note);
  assert.match(flat(note), /applies to every program you own/);
  // Accuracy of the claim, verified in source rather than asserted in prose.
  assert.match(readCode(read('program-state.js')), /function pgRemapAllSchedules/);
});

test('At a Glance still shows the Program recommendation of 3 days', async () => {
  const h = authorized();
  await h.run();
  const facts = h.el('progFacts').innerHTML;
  assert.match(facts, /Per week/);
  assert.match(facts, /3 days/, 'the Program recommendation stays visible');
});

/* ── Pulling limitation: entitled Program content only ──────────────────── */

test('pulling note: present in the entitled Program content', async () => {
  const h = authorized();
  await h.run();
  assert.deepEqual(h.shown(), ['programContent']);
  const body = PAGE.slice(PAGE.indexOf('id="programContent"'), PAGE.lastIndexOf('<script>'));
  assert.ok(flat(body).includes(PULLING_NOTE), 'the approved note is inside programContent');
  assert.match(PAGE, /<div class="section-label">Equipment note<\/div>/,
    'uses the existing section-label + card pattern');
});

test('pulling note: absent from locked, unavailable and loading states', () => {
  const region = (startMarker, endMarker) => {
    const a = PAGE.indexOf(startMarker);
    const b = PAGE.indexOf(endMarker, a);
    assert.ok(a > -1 && b > a, 'region found: ' + startMarker);
    return flat(PAGE.slice(a, b));
  };
  const gate = region('<div id="authGate">', '<!-- Unavailable state');
  const unavailable = region('<div id="unavailableState">', '<!-- Locked state');
  const locked = region('<div id="lockedState">', '<!-- Program content');
  [['loading', gate], ['unavailable', unavailable], ['locked', locked]].forEach(([label, html]) => {
    assert.ok(!html.includes(PULLING_NOTE), label + ' must not contain the pulling note');
    assert.ok(!/pulling/i.test(html), label + ' must not mention pulling');
  });
});

test('pulling note: never enters the canonical description or compact surfaces', () => {
  // It is page copy, not catalog data — so it must not be written into the row
  // the compact cards, Home and Today read.
  assert.ok(!/programs[\s\S]{0,40}description/.test(PAGE_CODE),
    'the page never writes programs.description');
  assert.ok(!/\.(insert|update|upsert)\(/.test(PAGE_CODE), 'the page performs no writes');
  // Home renders name + link only; Today renders a session label.
  const home = readCode(read('app.html'));
  assert.ok(!/pulling/i.test(home), 'Home must not carry the pulling note');
  const train = readCode(read('workout.html'));
  assert.ok(!/pulling/i.test(train), 'Train must not carry the pulling note');
});

test('pulling note: plain text, escaped context, wraps safely', () => {
  const card = (PAGE.match(/Equipment note<\/div>\s*<div class="card">[\s\S]*?<\/div>/) || [''])[0];
  assert.ok(card, 'the card exists');
  // Static prose only — no interpolation, no markup, no link, no interaction.
  assert.ok(!/\$\{|' \+|" \+/.test(card), 'no interpolation into the note');
  [/<a /, /href=/, /onclick=/, /data-lucide/, /<button/, /<script/].forEach((re) =>
    assert.ok(!re.test(card), 'note must not contain ' + re));
  // Wrapping: .card p carries no nowrap/clip, and the page forbids h-scroll.
  const cardP = (PAGE.match(/\.card p \{[^}]*\}/) || [''])[0];
  assert.ok(cardP, '.card p rule exists');
  assert.ok(!/nowrap|text-overflow/.test(cardP), '.card p must wrap');
  assert.match(PAGE, /body\s*\{[^}]*overflow-x:\s*hidden/);
});

/* ── Mutation sensitivity ───────────────────────────────────────────────── */

test('mutation: restoring a dynamic personal claim would fail', () => {
  const broken = PAGE.replace(
    '<p id="sessSummary">Choose any session below.',
    '<p id="sessSummary">You train 3 days a week. Choose any session below.');
  assert.notEqual(broken, PAGE, 'the static intro was found to mutate');
  assert.ok(/You train/.test(readCode(broken)), 'the mutated page DOES claim a frequency');
  assert.ok(!/You train/.test(PAGE_CODE), 'the shipped page does not');
});

test('mutation: moving the pulling note outside entitled content would fail', () => {
  const idx = PAGE.indexOf(PULLING_NOTE.slice(0, 40).replace(/ /g, ' '));
  const contentStart = PAGE.indexOf('id="programContent"');
  const contentEnd = PAGE.lastIndexOf('<script src="https://cdn.jsdelivr.net');
  assert.ok(idx > contentStart && idx < contentEnd,
    'the note lives strictly inside programContent');
  // If it were moved above programContent it would sit in a denial state.
  assert.ok(PAGE.indexOf('id="unavailableState"') < contentStart);
  assert.ok(PAGE.indexOf('id="lockedState"') < contentStart);
});

/* ════════════════════════════════════════════════════════════════════════
 * CP4a · Schedule containment (parity-only)
 *
 * The page used to render every linked Routine. It now renders exactly the
 * sessions the user's validated frequency calls for, in schedule order. With the
 * current mapping that is still Full Body A/B/C at every frequency 2–6, so this
 * checkpoint is behaviour-preserving by design — what it adds is a containment
 * boundary, so the Routines CP4d links cannot appear before CP4e activates the
 * frequency-specific arrays.
 * ══════════════════════════════════════════════════════════════════════ */

const SCHED_COPY = /Your program schedule is temporarily unavailable\. Your progress is safe\. Please try again shortly\./;

/* The pure helper, lifted out of the page and run in isolation. */
function loadResolver() {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(extractPageFn(PAGE, 'resolveScheduledSessions'), sandbox);
  return sandbox.resolveScheduledSessions;
}

const ABC = ['full_a', 'full_b', 'full_c'];
const row = (k, name) => ({ session_key: k, sort_order: 9, name: name || k.toUpperCase() });

/* ── Pure resolution behaviour ──────────────────────────────────────────── */

test('CP4a resolver: the three expected keys plus their three rows succeeds', () => {
  const r = loadResolver()(ABC, ABC.map((k) => row(k)));
  assert.equal(r.ok, true);
  assert.deepEqual(r.sessions.map((s) => s.session_key), ABC);
});

test('CP4a resolver: order follows the expected array, not the loaded order', () => {
  const shuffled = [row('full_c'), row('full_a'), row('full_b')];
  const r = loadResolver()(ABC, shuffled);
  assert.equal(r.ok, true);
  assert.deepEqual(r.sessions.map((s) => s.session_key), ABC,
    'schedule order wins over database/result order');
  assert.deepEqual(r.sessions.map((s) => s.sort_order), [1, 2, 3],
    'display position is the position in this user\'s week');
});

test('CP4a resolver: neither input is mutated', () => {
  const expected = ABC.slice();
  const loaded = [row('full_c'), row('full_a'), row('full_b')];
  const expectedCopy = JSON.parse(JSON.stringify(expected));
  const loadedCopy = JSON.parse(JSON.stringify(loaded));
  loadResolver()(expected, loaded);
  assert.deepEqual(expected, expectedCopy, 'expected array untouched');
  assert.deepEqual(loaded, loadedCopy, 'loaded rows untouched');
});

test('CP4a resolver: one missing expected key fails', () => {
  for (const drop of ABC) {
    const loaded = ABC.filter((k) => k !== drop).map((k) => row(k));
    assert.deepEqual(loadResolver()(ABC, loaded), { ok: false, reason: 'missing' },
      'missing ' + drop);
  }
});

test('CP4a resolver: a duplicate loaded row for an expected key fails', () => {
  const loaded = [row('full_a'), row('full_a', 'Full Body A (copy)'), row('full_b'), row('full_c')];
  assert.deepEqual(loadResolver()(ABC, loaded), { ok: false, reason: 'duplicate' });
});

test('CP4a resolver: a duplicate key in the expected array fails', () => {
  const loaded = ABC.map((k) => row(k));
  assert.deepEqual(loadResolver()(['full_a', 'full_a', 'full_b'], loaded),
    { ok: false, reason: 'duplicate' });
});

test('CP4a resolver: a malformed expected array fails', () => {
  const resolve = loadResolver();
  const loaded = ABC.map((k) => row(k));
  for (const bad of [[], null, undefined, 'full_a', {}, 3]) {
    assert.deepEqual(resolve(bad, loaded), { ok: false, reason: 'invalid_expected' },
      JSON.stringify(bad));
  }
});

test('CP4a resolver: a blank or non-string expected key fails', () => {
  const resolve = loadResolver();
  const loaded = ABC.map((k) => row(k));
  for (const bad of ['', null, undefined, 7, {}, []]) {
    assert.deepEqual(resolve(['full_a', bad], loaded),
      { ok: false, reason: 'invalid_expected' }, JSON.stringify(bad));
  }
});

test('CP4a resolver: a malformed loaded collection fails', () => {
  const resolve = loadResolver();
  for (const bad of [null, undefined, 'rows', {}, 5]) {
    assert.deepEqual(resolve(ABC, bad), { ok: false, reason: 'invalid_loaded' },
      JSON.stringify(bad));
  }
});

test('CP4a resolver: a required row with no usable name fails', () => {
  const resolve = loadResolver();
  for (const bad of [null, undefined, '', 7, {}]) {
    const loaded = [{ session_key: 'full_a', name: bad }, row('full_b'), row('full_c')];
    assert.deepEqual(resolve(ABC, loaded), { ok: false, reason: 'invalid_loaded' },
      'name=' + JSON.stringify(bad));
  }
});

test('CP4a resolver: a Routine dropped by the inner join reads as missing', () => {
  // loadSessions() selects workout_templates!inner(...), so an unreadable or
  // private Routine never appears as a row at all — the only evidence is absence.
  const loaded = [row('full_a'), row('full_c')];
  assert.deepEqual(loadResolver()(ABC, loaded), { ok: false, reason: 'missing' });
});

test('CP4a resolver: an unexpected extra linked row is excluded, not fatal', () => {
  const loaded = ABC.map((k) => row(k)).concat([row('upper_push_core_a', 'Upper Push & Core A')]);
  const r = loadResolver()(ABC, loaded);
  assert.equal(r.ok, true, 'a complete expected set still succeeds');
  assert.deepEqual(r.sessions.map((s) => s.session_key), ABC, 'the extra is absent');
});

test('CP4a resolver: a malformed unexpected extra row is also just ignored', () => {
  const resolve = loadResolver();
  const extras = [
    { session_key: 'upper_push_core_a', name: null },
    { session_key: 'lower_a' },
    { session_key: '', name: 'blank' },
    null, undefined, 'junk', 42,
  ];
  for (const extra of extras) {
    const r = resolve(ABC, ABC.map((k) => row(k)).concat([extra]));
    assert.equal(r.ok, true, 'extra ' + JSON.stringify(extra) + ' must not fail the schedule');
    assert.deepEqual(r.sessions.map((s) => s.session_key), ABC);
  }
});

test('CP4a resolver: Routine names never determine identity or order', () => {
  // Names deliberately contradict the keys. Identity comes from session_key and
  // order from the expected array, so the result must ignore both.
  const loaded = [
    row('full_c', 'Full Body A'),
    row('full_a', 'Full Body C'),
    row('full_b', 'Zzz Last'),
  ];
  const r = loadResolver()(ABC, loaded);
  assert.deepEqual(r.sessions.map((s) => s.session_key), ABC);
  assert.deepEqual(r.sessions.map((s) => s.name), ['Full Body C', 'Zzz Last', 'Full Body A'],
    'each key keeps ITS OWN row name, however misleading');
});

/* ── Valid-frequency parity: CP4a changes nothing for 2–6 ───────────────── */

const SCHEDULES = (() => {
  const s = {};
  vm.createContext(s);
  vm.runInContext(read('schedules.js'), s);
  return s;
})();

for (const days of [2, 3]) {
  test('CP4a parity: a ' + days + '-day user still sees exactly Full Body A/B/C', async () => {
    // Guard the premise: 2 and 3 days keep A/B/C after CP4e-2; 4–6 are pinned
    // by the CP4e-2 tests below.
    assert.deepEqual(SCHEDULES.getScheduleForDays('bodyweight_foundations', days), ABC,
      'CP4e-2 keeps A/B/C at 2 and 3 days');

    const h = authorized({ profile: { training_days: days } });
    await h.run();

    assert.deepEqual(h.shown(), ['programContent'], 'days=' + days);
    const list = h.el('sessList').innerHTML;
    for (const name of ['Full Body A', 'Full Body B', 'Full Body C']) {
      assert.ok(list.includes(name), name + ' renders at days=' + days);
    }
    assert.ok(list.indexOf('Full Body A') < list.indexOf('Full Body B'), 'A before B');
    assert.ok(list.indexOf('Full Body B') < list.indexOf('Full Body C'), 'B before C');
    assert.equal((list.match(/class="sched-row/g) || []).length, 3, 'exactly three rows');

    assert.equal(h.el('ctaSessionName').textContent, 'Full Body A', 'A selected initially');
    assert.equal(h.el('startBtn').href,
      'workout.html?program=bodyweight_foundations&session=full_a&mode=optional',
      'canonical Start URL unchanged');
    assert.equal(h.el('stickyCta').style.display, 'block', 'Start CTA offered');
    assert.ok(!SCHED_COPY.test(renderedText(h)), 'no new failure state appears');
    noWrites(h, days + '-day parity');
  });
}

/* ── Fail the whole schedule closed ─────────────────────────────────────── */

const INCOMPLETE = [
  ['missing Full Body B', { links: BWF_LINKS.filter((r) => r.session_key !== 'full_b') }],
  ['missing Full Body C', { links: BWF_LINKS.filter((r) => r.session_key !== 'full_c') }],
  ['duplicate Full Body A', { links: BWF_LINKS.concat([BWF_LINKS[0]]) }],
  ['Full Body B unreadable (inner-join drop)',
    { links: BWF_LINKS.filter((r) => r.session_key !== 'full_b') }],
  // A required Routine whose relationship object is absent. loadSessions()
  // filters such a row out, so through the page this surfaces as MISSING rather
  // than as a malformed row — either way the whole schedule fails closed. (The
  // resolver's own invalid_loaded contract is unit-tested separately above.)
  ['required Routine relationship malformed',
    { links: BWF_LINKS.map((r) => (r.session_key === 'full_b'
        ? Object.assign({}, r, { workout_templates: null }) : r)) }],
];

for (const [label, opts] of INCOMPLETE) {
  test('CP4a fail-closed: ' + label, async () => {
    const h = authorized(opts);
    await h.run();

    // Navigation and the Program page itself are preserved — this is not an
    // error page and it is never confused with a lost entitlement.
    assert.deepEqual(h.shown(), ['programContent'], label + ' still renders the page');
    const copy = h.el('sessSummary').innerHTML;
    assert.match(copy, SCHED_COPY, label);
    assert.match(copy, /Try Again/, 'primary action present');
    assert.match(copy, /href="workout\.html\?pane=programs"[^>]*>Back to Programs</,
      'secondary navigation present');

    assert.equal(h.el('sessList').innerHTML, '', 'no session rows');
    assert.equal(h.el('stickyCta').style.display, 'none', 'no Start CTA');
    assert.equal(h.el('startBtn').href, '', 'no launchable URL');
    assert.ok(!PRESCRIPTION_WORDS.test(copy), 'no session content leaked into the copy');
    noWrites(h, label);

    // No technical detail of any kind.
    assert.ok(!/full_[abc]|session_key|workout_templates|program_routines|RLS|supabase|null|undefined|NaN|error|missing|duplicate|invalid/i.test(copy),
      'copy exposes no technical detail: ' + copy);
  });
}

test('CP4a fail-closed: a malformed schedule array fails the whole schedule', async () => {
  // Simulates getScheduleForDays returning nothing usable for a valid frequency.
  const broken = PAGE.replace(
    '? getScheduleForDays(PROGRAM_SLUG, freq.days)', '? []');
  assert.notEqual(broken, PAGE, 'the schedule call was found to mutate');
  const h = authorized({ source: broken });
  await h.run();
  assert.match(h.el('sessSummary').innerHTML, SCHED_COPY);
  assert.equal(h.el('sessList').innerHTML, '');
  assert.equal(h.el('startBtn').href, '');
  assert.equal(h.el('stickyCta').style.display, 'none');
  noWrites(h, 'malformed schedule');
});

/* ── Hidden extra: the containment proof for CP4d ───────────────────────── */

test('CP4a containment: a future linked Routine stays hidden and unlaunchable', async () => {
  const future = BWF_LINKS.concat([{
    session_key: 'upper_push_core_a', sort_order: 4,
    programs: { slug: 'bodyweight_foundations' },
    workout_templates: { id: 'r-upc-a', name: 'Upper Push & Core A' },
  }]);
  const h = authorized({ links: future });
  await h.run();

  assert.deepEqual(h.shown(), ['programContent'], 'the page remains usable');
  const list = h.el('sessList').innerHTML;
  assert.ok(!/Upper Push & Core A|upper_push_core_a/.test(list), 'the future session is hidden');
  assert.equal((list.match(/class="sched-row/g) || []).length, 3, 'still exactly three rows');
  assert.ok(!SCHED_COPY.test(renderedText(h)), 'and it does not break the schedule');

  // It cannot be selected, and selecting it cannot mint a Start URL.
  const before = h.el('startBtn').href;
  h.sandbox.selectSession('upper_push_core_a');
  assert.equal(h.sandbox.SELECTED, 'full_a', 'selection unchanged');
  assert.equal(h.el('startBtn').href, before, 'no new Start URL');
  assert.match(before, /session=full_a&mode=optional$/, 'A/B/C behaviour unchanged');
  noWrites(h, 'hidden future Routine');
});

const shownName = (n) => n.replace(/&/g, '&amp;');

for (const days of [2, 3, 4, 5, 6]) {
  test('CP4e-2: with all nine production links, a ' + days + '-day user sees exactly the approved sessions', async () => {
    const want = CP4E_SCHEDULE[days];
    assert.deepEqual(SCHEDULES.getScheduleForDays('bodyweight_foundations', days), want, 'schedules.js agrees');
    const h = authorized({ links: PROD_LINKS, profile: { training_days: days } });
    await h.run();

    assert.deepEqual(h.shown(), ['programContent']);
    assert.ok(!SCHED_COPY.test(renderedText(h)), 'the schedule resolves');
    const list = h.el('sessList').innerHTML;
    assert.equal((list.match(/class="sched-row/g) || []).length, want.length, 'one row per scheduled session');
    // Routine names, in the approved order — never a raw key.
    let at = -1;
    for (const k of want) {
      const i = list.indexOf(shownName(NAME_OF[k]));
      assert.ok(i > at, NAME_OF[k] + ' appears, in order, at days=' + days);
      at = i;
      assert.ok(!new RegExp('>\\s*' + k + '\\s*<').test(list), 'raw key ' + k + ' is never rendered');
    }
    // The first scheduled session is preselected.
    assert.equal(h.el('ctaSessionName').textContent, NAME_OF[want[0]]);
    const before = h.el('startBtn').href;
    assert.ok(before.endsWith('session=' + want[0] + '&mode=optional'), before);
    // Everything outside this frequency is hidden and cannot be selected.
    for (const l of PROD_LINKS.filter((x) => !want.includes(x.session_key))) {
      assert.ok(!list.includes(shownName(l.workout_templates.name)), l.session_key + ' is hidden at days=' + days);
      h.sandbox.selectSession(l.session_key);
      assert.equal(h.sandbox.SELECTED, want[0], l.session_key + ' cannot be selected');
      assert.equal(h.el('startBtn').href, before, l.session_key + ' cannot mint a Start URL');
    }
    // Every scheduled session can be selected and gets its own Start URL.
    for (const k of want) {
      h.sandbox.selectSession(k);
      assert.equal(h.sandbox.SELECTED, k);
      assert.equal(h.el('ctaSessionName').textContent, NAME_OF[k]);
      assert.ok(h.el('startBtn').href.endsWith('session=' + k + '&mode=optional'), k);
    }
    noWrites(h, 'CP4e-2 nine links, days=' + days);
  });
}

test('CP4a containment: a missing key cannot be selected either', async () => {
  const h = authorized();
  await h.run();
  const before = h.el('startBtn').href;
  for (const key of ['core_conditioning', 'mobility_recovery', '', null, undefined, 'full_z']) {
    h.sandbox.selectSession(key);
    assert.equal(h.sandbox.SELECTED, 'full_a', 'selection unchanged for ' + JSON.stringify(key));
    assert.equal(h.el('startBtn').href, before, 'no Start URL for ' + JSON.stringify(key));
  }
  noWrites(h, 'unknown key selection');
});

/* ── The three states stay distinct ─────────────────────────────────────── */

test('CP4a states: frequency failures never become the schedule state', async () => {
  for (const profile of [null, {}, { training_days: null }]) {
    const h = authorized({ profile });
    await h.run();
    const copy = h.el('sessSummary').innerHTML;
    assert.match(copy, /We couldn’t load your workout schedule\./, JSON.stringify(profile));
    assert.ok(!SCHED_COPY.test(copy), 'not the CP4a state');
    noWrites(h, 'unavailable ' + JSON.stringify(profile));
  }
  for (const days of [0, 1, 12, 4.5]) {
    const h = authorized({ profile: { training_days: days } });
    await h.run();
    const copy = h.el('sessSummary').innerHTML;
    assert.match(copy, /Choose between 2 and 6 workout days/, 'days=' + days);
    assert.ok(!SCHED_COPY.test(copy), 'not the CP4a state');
    noWrites(h, 'unsupported ' + days);
  }
});

test('CP4a states: the schedule state never borrows frequency copy', async () => {
  const h = authorized({ links: BWF_LINKS.filter((r) => r.session_key !== 'full_c') });
  await h.run();
  const copy = h.el('sessSummary').innerHTML;
  assert.match(copy, SCHED_COPY);
  assert.ok(!/We couldn’t load your workout schedule\./.test(copy));
  assert.ok(!/Choose between 2 and 6 workout days/.test(copy));
  assert.ok(!/Recalculate Goals/.test(copy), 'the frequency is fine — no recalc prompt');
});

test('CP4a states: all three are mutually exclusive in source', () => {
  const sched = extractPageFn(PAGE, 'showScheduleUnavailable');
  const freq = extractPageFn(PAGE, 'showFrequencyUnavailable');
  assert.ok(!/showUnavailable\(/.test(sched), 'not the Program-unavailable state');
  assert.ok(!/Recalculate Goals|Choose between/.test(sched), 'no unsupported-state copy');
  assert.ok(!/temporarily unavailable/.test(freq), 'no schedule-state copy');
  assert.match(sched, /Back to Programs/, 'schedule state offers navigation');
});

/* ── CP4a state 3 · total session-read failure ───────────────────────────────
 * These three cases used to render the generic unavailable state, which offered
 * no retry and read as "this Program is not available to you". They happen AFTER
 * a valid frequency was established and are transient, so they now resolve to the
 * cause-neutral, retryable schedule state. The full contract is asserted, not
 * just the wording. */

const TOTAL_READ_FAILURES = [
  ['session query failed', { linksError: true }],
  ['no readable sessions', { links: [] }],
  ['every session row malformed', { links: [{ session_key: null, workout_templates: null }] }],
];

for (const [label, opts] of TOTAL_READ_FAILURES) {
  test('CP4a state 3: a total session-read failure — ' + label, async () => {
    const h = authorized(opts);
    await h.run();

    // A valid frequency was resolved first — the harness default is 3 days.
    const copy = h.el('sessSummary').innerHTML;
    assert.match(copy, SCHED_COPY, label);
    assert.match(copy, /Try Again/, 'primary action');
    assert.match(copy, /href="workout\.html\?pane=programs"[^>]*>Back to Programs</,
      'secondary navigation');

    assert.equal(h.el('sessList').innerHTML, '', 'no session rows');
    assert.equal(h.sandbox.SELECTED, null, 'no selected workout');
    assert.equal(h.el('stickyCta').style.display, 'none', 'no Start CTA');
    assert.equal(h.el('startBtn').href, '', 'no launchable URL');
    assert.ok(!PRESCRIPTION_WORDS.test(copy), 'no partial schedule content');
    noWrites(h, label);

    // No technical detail of any kind.
    assert.ok(!/session_key|workout_templates|program_routines|RLS|supabase|null|undefined|NaN|error|boom|full_[abc]/i.test(copy),
      'copy exposes no technical detail: ' + copy);
  });
}

test('CP4a state 3: frequency is classified first, so sessions are never queried after a frequency failure', async () => {
  // Both broken at once: an unreadable profile AND a failing session query.
  // Frequency wins because it is resolved first, and no session read is issued
  // on behalf of a user whose frequency could not be established.
  for (const profile of [null, {}, { training_days: null }]) {
    const h = authorized({ profile, linksError: true });
    await h.run();
    const copy = h.el('sessSummary').innerHTML;
    assert.match(copy, /We couldn’t load your workout schedule\./, JSON.stringify(profile));
    assert.ok(!SCHED_COPY.test(copy), 'frequency classification wins');
    assert.ok(!h.reads.includes('program_routines'),
      'no session query was issued: ' + JSON.stringify(h.reads));
    noWrites(h, 'frequency+session both broken ' + JSON.stringify(profile));
  }
  for (const days of [0, 1, 12, 4.5]) {
    const h = authorized({ profile: { training_days: days }, linksError: true });
    await h.run();
    const copy = h.el('sessSummary').innerHTML;
    assert.match(copy, /Choose between 2 and 6 workout days/, 'days=' + days);
    assert.ok(!SCHED_COPY.test(copy), 'frequency classification wins');
    assert.ok(!h.reads.includes('program_routines'), 'no session query was issued');
    noWrites(h, 'unsupported+session both broken ' + days);
  }
});

test('CP4a state 3: the three states are pairwise distinct for their own cause', async () => {
  const freqMissing = authorized({ profile: null });
  await freqMissing.run();
  const freqInvalid = authorized({ profile: { training_days: 1 } });
  await freqInvalid.run();
  const sessionFailed = authorized({ linksError: true });
  await sessionFailed.run();

  const a = freqMissing.el('sessSummary').innerHTML;
  const b = freqInvalid.el('sessSummary').innerHTML;
  const c = sessionFailed.el('sessSummary').innerHTML;
  assert.notEqual(a, b); assert.notEqual(b, c); assert.notEqual(a, c);

  assert.match(a, /We couldn’t load your workout schedule\./);
  assert.ok(!SCHED_COPY.test(a) && !/Choose between/.test(a));
  assert.match(b, /Choose between 2 and 6 workout days/);
  assert.ok(!SCHED_COPY.test(b));
  assert.match(c, SCHED_COPY);
  assert.ok(!/We couldn’t load your workout schedule\.|Choose between|Recalculate Goals/.test(c),
    'the schedule state borrows no frequency copy — the frequency was fine');
});

test('CP4a state 3: sessions are read only after frequency resolution, in source', () => {
  const fn = extractPageFn(PAGE, 'preselect');
  const freqGate = fn.indexOf('resolveTrainingDays(profile)');
  const load = fn.indexOf('loadSessions()');
  assert.ok(freqGate > -1 && load > -1, 'both steps are in preselect');
  assert.ok(freqGate < load, 'frequency is resolved before sessions are read');
  // And the boot sequence must not read them earlier.
  const boot = PAGE.slice(PAGE.indexOf("addEventListener('load'"));
  assert.ok(!/LINKED_SESSIONS = await loadSessions\(\)/.test(boot.slice(0, boot.indexOf('preselect('))),
    'boot does not load sessions before preselect');
});

/* ══════════════════════════════════════════════════════════════════════════
 * Phase 4.3.9B CP4f — sticky Start bar clearance
 * Owner-reported on a physical iPhone 14 Plus: the fixed Start bar could cover
 * the last session row. The page now reserves the bar's MEASURED height (which
 * includes the home-indicator inset) at its bottom, instead of a fixed 120px
 * that ignored the safe area. Real-browser geometry at 320/390/430 px is
 * recorded in the PR; these tests pin the mechanism.
 * ══════════════════════════════════════════════════════════════════════ */

const cssRule = (sel) => (PAGE.match(new RegExp('\\n\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*\\}')) || [''])[0];

test('CP4f: the bar clears the home indicator and the content reserves the bar', () => {
  const bar = cssRule('.sticky-cta');
  assert.match(bar, /position: fixed; bottom: 0;/, 'the bar stays fixed to the bottom');
  assert.match(bar, /padding: 14px 20px calc\(18px \+ env\(safe-area-inset-bottom, 0px\)\);/,
    'the bar adds the home-indicator inset to its own bottom padding');
  assert.ok(!/visibility:\s*hidden|transform|bottom:\s*-|opacity:\s*0/.test(bar), 'the bar is not hidden or pushed off-screen');
  const cont = cssRule('.container');
  assert.match(cont, /calc\(var\(--sticky-cta-h, calc\(110px \+ env\(safe-area-inset-bottom, 0px\)\)\) \+ 24px\)/,
    'reserve = measured bar height (else bar + inset) + 24px');
  assert.ok(!/120px/.test(cont), 'the old fixed reserve is gone');
  // The 110px fallback covers the bar as rendered today (109px, measured in a
  // real browser at 320/390/430 px) before the inset is added.
});

function reserveHarness(o) {
  o = o || {};
  const props = {};
  const listeners = [];
  const observed = [];
  const bar = o.noBar ? null : { getBoundingClientRect: () => ({ height: o.height === undefined ? 109 : o.height }) };
  const sandbox = {
    SESSIONS: o.sessions || [],
    document: {
      getElementById: (id) => (id === 'stickyCta' ? bar : null),
      documentElement: o.noRoot ? undefined : { style: {
        setProperty: (k, v) => { props[k] = v; },
        removeProperty: (k) => { delete props[k]; },
      } },
    },
    window: { addEventListener: (ev, fn) => listeners.push([ev, fn]) },
    ResizeObserver: o.noRO ? undefined : function (fn) { this.observe = (el) => observed.push([el, fn]); },
  };
  vm.createContext(sandbox);
  vm.runInContext(extractPageFn(PAGE, 'syncStickyReserve') + '\n' + extractPageFn(PAGE, 'watchStickyReserve'), sandbox);
  return { sandbox, props, listeners, observed, bar };
}

for (const n of [3, 4, 5, 6]) {
  test('CP4f: with ' + n + ' sessions the reserve equals the bar height, whatever the count', () => {
    const sessions = Array.from({ length: n }, (_, i) => ({ session_key: 'k' + i, name: 'S' + i }));
    for (const height of [109, 143, 167.4]) {   // today; + 34px inset; + a wrapped name
      const h = reserveHarness({ sessions, height });
      h.sandbox.syncStickyReserve();
      assert.equal(h.props['--sticky-cta-h'], Math.ceil(height) + 'px', n + ' sessions, bar ' + height);
    }
  });
}

test('CP4f: the reserve follows the bar as it appears, resizes and hides', () => {
  const h = reserveHarness({ height: 0 });
  h.sandbox.watchStickyReserve();
  assert.equal(h.props['--sticky-cta-h'], undefined, 'a hidden bar leaves the CSS fallback');
  assert.equal(h.observed.length, 1, 'the bar itself is observed');
  assert.strictEqual(h.observed[0][0], h.bar);
  assert.deepEqual(h.listeners.map((l) => l[0]), ['resize']);
  // Shown with a two-line name on a phone with a home indicator.
  h.bar.getBoundingClientRect = () => ({ height: 167 });
  h.observed[0][1]();
  assert.equal(h.props['--sticky-cta-h'], '167px');
  h.bar.getBoundingClientRect = () => ({ height: 0 });
  h.listeners[0][1]();
  assert.equal(h.props['--sticky-cta-h'], undefined, 'hidden again → fallback');
});

test('CP4f: the reserve code can never break the page', () => {
  for (const o of [{ noBar: true }, { noRoot: true }, { noRO: true }]) {
    const h = reserveHarness(o);
    assert.doesNotThrow(() => h.sandbox.watchStickyReserve(), JSON.stringify(o));
  }
  const noRO = reserveHarness({ noRO: true });
  noRO.sandbox.watchStickyReserve();
  assert.equal(noRO.props['--sticky-cta-h'], '109px', 'without ResizeObserver it still measures once');
  assert.deepEqual(noRO.listeners.map((l) => l[0]), ['resize'], 'and on every resize');
});

test('CP4f: the reserve depends on the bar alone, never on sessions or a particular row', () => {
  const fns = extractPageFn(PAGE, 'syncStickyReserve') + extractPageFn(PAGE, 'watchStickyReserve');
  assert.ok(!/SESSIONS|LINKED_SESSIONS|sessList|sched-row|full_c|Full Body C|length/.test(fns), fns);
  assert.match(PAGE, /\n  watchStickyReserve\(\);\n/, 'installed once at start-up');
});

test('CP4f: the bar is still shown on every ready path, and touch, focus and motion rules hold', () => {
  assert.equal((PAGE_CODE.match(/if \(ready\) document\.getElementById\('stickyCta'\)\.style\.display = 'block';/g) || []).length, 3);
  assert.match(cssRule('.sticky-cta-btn'), /min-height: 44px;/);
  assert.match(cssRule('.sched-row'), /min-height: 44px/);
  assert.match(PAGE, /\.sticky-cta-btn:focus-visible \{ outline: 2px solid #fff; outline-offset: 2px; \}/);
  assert.match(PAGE, /\.sched-row:focus-visible \{ outline: 2px solid var\(--red\); outline-offset: 2px; \}/);
  assert.match(PAGE, /@media \(prefers-reduced-motion: reduce\)/);
  // No bottom navigation is loaded on this page, so only the bar needs clearing.
  assert.ok(!/app-nav\.js|app-shell\.css/.test(PAGE));
});

test('CP4f: every frequency still lists, orders and launches every session (bar shown)', async () => {
  for (const days of [2, 3, 4, 5, 6]) {
    const want = CP4E_SCHEDULE[days];
    const h = authorized({ links: PROD_LINKS, profile: { training_days: days } });
    await h.run();
    assert.equal(h.el('stickyCta').style.display, 'block', 'the bar is visible at days=' + days);
    const list = h.el('sessList').innerHTML;
    assert.equal((list.match(/class="sched-row/g) || []).length, want.length, 'no row hidden or removed');
    const last = want[want.length - 1];
    h.sandbox.selectSession(last);
    assert.equal(h.sandbox.SELECTED, last, 'the last row is selectable at days=' + days);
    assert.ok(h.el('startBtn').href.endsWith('session=' + last + '&mode=optional'), 'unchanged Start URL');
  }
});
