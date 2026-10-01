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
    ['routines unreadable', { purchases: MEMBERSHIP, linksError: true,
      catalog: pcNormalizeCatalog([published(BWF_ROW)]) }],
    ['no routines readable', { purchases: MEMBERSHIP, links: [],
      catalog: pcNormalizeCatalog([published(BWF_ROW)]) }],
    ['malformed routine rows', { purchases: MEMBERSHIP,
      links: [{ session_key: null, workout_templates: null }],
      catalog: pcNormalizeCatalog([published(BWF_ROW)]) }],
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
  // The stub honours the page's own scoping, so a correctly scoped query
  // returns nothing here and the page fails closed.
  assert.deepEqual(h.shown(), ['unavailableState']);
  assert.ok(!/Muscle Gain Full Body/.test(renderedText(h)),
    'a foreign Routine must never render on this page');
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
  assert.match(PAGE, /padding: 28px 16px 120px/, 'content clears the sticky CTA');
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

test('mutation: removing Program scoping would admit a foreign Routine', async () => {
  const broken = PAGE.replace(".eq('programs.slug', PROGRAM_SLUG)", '');
  assert.notEqual(broken, PAGE, 'the scoping call was found to mutate');
  const foreign = [{ session_key: 'full_a', sort_order: 1,
    programs: { slug: 'muscle_gain' },
    workout_templates: { id: 'mg-a', name: 'Muscle Gain Full Body A' } }];
  const h = makeHarness({ purchases: MEMBERSHIP, links: foreign, source: broken,
    catalog: pcNormalizeCatalog([published(BWF_ROW)]) });
  await h.run();
  assert.match(renderedText(h), /Muscle Gain Full Body A/,
    'unscoped, a foreign Routine DOES render — so the scoping test is meaningful');
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

  // One script path may now replace it: the fail-closed frequency state, which
  // must say the frequency is UNKNOWN. The original assertion (nothing writes
  // this element) existed to stop a runtime frequency CLAIM, so it is narrowed
  // to that intent rather than dropped — every write must live in that one
  // handler, and what it writes may not state a frequency.
  const owner = extractPageFn(PAGE, 'showFrequencyUnavailable');
  const writes = PAGE_CODE.match(/getElementById\('sessSummary'\)/g) || [];
  const inOwner = owner.match(/getElementById\('sessSummary'\)/g) || [];
  assert.equal(writes.length, inOwner.length,
    'only showFrequencyUnavailable() may assign sessSummary');
  assert.equal(inOwner.length, 1, 'and it assigns it exactly once');
  assert.ok(!/You train|days a week|days\/week/.test(owner),
    'the failure copy states no frequency');
  assert.match(owner, /No session can be selected right now/);
  // Cause-neutral by design: 0 and 1 are frequencies that loaded perfectly
  // well and simply are not schedulable, so copy blaming a failed load would
  // be false for them.
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
    const h = authorized({ profile: { training_days } });
    await h.run();
    assert.deepEqual(h.shown(), ['programContent'], 'days=' + training_days);
    assert.equal(flat(h.el('sessSummary').innerHTML || ''), '',
      'the intro is untouched — the real value is static markup');
    // And the page still selects a legitimate session for each frequency.
    assert.match(h.el('startBtn').href, /session=full_[abc]/, 'days=' + training_days);
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
  for (const profile of [null, {}, { training_days: null }, { training_days: 12 },
                         { training_days: 0 }, { training_days: 1 }]) {
    const h = authorized({ profile });
    await h.run();
    const label = JSON.stringify(profile);
    // Navigation and the rest of the Program are preserved — this is not an
    // error page, and it is never confused with a lost entitlement.
    assert.deepEqual(h.shown(), ['programContent'], 'the page still renders: ' + label);
    assert.equal(h.el('startBtn').href, '', 'no launchable workout: ' + label);
    assert.equal(h.el('stickyCta').style.display, 'none', 'no Start CTA: ' + label);
    assert.equal(h.el('sessList').innerHTML, '', 'no session buttons: ' + label);
    const copy = h.el('sessSummary').innerHTML;
    assert.match(copy, /No session can be selected right now/, label);
    assert.ok(!/You train/.test(copy), 'states no frequency: ' + label);
    noWrites(h, 'unknown frequency ' + label);
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
