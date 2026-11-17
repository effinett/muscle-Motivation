/* Phase 4.3.9-L — program.html, the shared page for the six catalog Programs.
 *
 * Runs the REAL page script in a vm sandbox, with the REAL schedules.js,
 * program-page.js, entitlement resolver and catalog normaliser, against
 * read/write-recording stubs. Every denied path asserts zero writes and no
 * Routine read, so the page can never expose a Program that has not been
 * migrated and published. */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { resolveProgramAccess } = require('./entitlement-core.js');
const { pcBySlug, pcNormalizeCatalog } = require('./program-catalog.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const PAGE = read('program.html');

const row = (slug, name, over) => Object.assign({
  slug, name, description: name + ' description', goal: 'muscle',
  difficulty: 'Beginner – Intermediate', duration_weeks: 8, recommended_days_per_week: 3,
  equipment_summary: 'Home Setup', included_with_membership: true, standalone_purchasable: false,
  status: 'published', sort_order: 5, page_path: 'program.html?slug=' + slug,
}, over || {});
const HS = row('home_strength', 'Home Strength');
const AFL = row('advanced_fat_loss', 'Advanced Fat Loss',
  { goal: 'fatloss', difficulty: 'Intermediate – Advanced', recommended_days_per_week: 4, equipment_summary: 'Full Gym' });
const MG = row('muscle_gain', 'Muscle Gain', { page_path: 'program-muscle-gain.html', standalone_purchasable: true });

const links = (slug, pairs) => pairs.map(([k, n], i) => ({
  session_key: k, sort_order: i + 1, programs: { slug }, workout_templates: { id: slug + '-' + k, name: n },
}));
const HS_LINKS = links('home_strength', [['full_a', 'Full Body A'], ['full_b', 'Full Body B'],
  ['full_c', 'Full Body C'], ['conditioning_core', 'Conditioning & Core']]);
const AFL_LINKS = links('advanced_fat_loss', [['lower', 'Lower'], ['upper', 'Upper'],
  ['full_body', 'Full Body'], ['conditioning_core', 'Conditioning + Core']]);

const MEMBERSHIP = [{ product: 'ai_membership', status: 'active' }];

function el(id) {
  return {
    id, innerHTML: '', textContent: '', href: '',
    style: { _d: '', set display(v) { this._d = v; }, get display() { return this._d; } },
    disabled: false, listeners: {},
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
  };
}

function harness(o) {
  const writes = [], reads = [], els = {};
  const getEl = (id) => (els[id] || (els[id] = el(id)));
  function builder(table) {
    const st = { table, eqs: [] };
    const api = {
      select: () => { reads.push(table); return api; },
      eq: (c, v) => { st.eqs.push([c, v]); return api; },
      order: () => api,
      maybeSingle: async () => resolve(st),
      then: (res) => res(resolve(st)),
      insert(p) { writes.push(table + ':insert'); return api; },
      update(p) { writes.push(table + ':update'); return api; },
      upsert(p) { writes.push(table + ':upsert'); return api; },
      delete() { writes.push(table + ':delete'); return api; },
    };
    return api;
  }
  function resolve(st) {
    if (st.table === 'purchases') return { data: o.purchases || [], error: null };
    if (st.table === 'program_routines') {
      const slug = (st.eqs.filter((e) => e[0] === 'programs.slug')[0] || [])[1];
      const rows = (o.links || []).filter((r) => r.programs.slug === slug);
      return { data: rows, error: null };
    }
    if (st.table === 'user_programs') return { data: o.userProgram || null, error: null };
    return { data: null, error: null };
  }
  const sb = {
    console: { error() {}, warn() {} }, resolveProgramAccess, pcBySlug, URLSearchParams,
    GOAL_LABELS: { fatloss: 'Fat Loss', muscle: 'Muscle Gain' },
    supabaseClient: { from: builder },
    requireAuth: async () => ({ user: { id: 'user-1' } }),
    getProfile: async () => ({ training_days: o.days == null ? 3 : o.days }),
    lucide: { createIcons() {} },
    location: { search: o.search == null ? '?slug=home_strength' : o.search },
    document: { getElementById: getEl, title: '' },
    encodeURIComponent,
  };
  sb.window = sb;
  let handler = null;
  sb.addEventListener = (evt, fn) => { if (evt === 'load') handler = fn; };
  vm.createContext(sb);
  vm.runInContext(read('schedules.js'), sb);
  vm.runInContext(read('program-page.js'), sb);
  const src = o.source || PAGE;
  vm.runInContext(src.slice(src.lastIndexOf('<script>') + 8, src.lastIndexOf('</script>')), sb);
  sb.pcLoadCatalog = async () => pcNormalizeCatalog((o.catalog || [MG, HS, AFL])
    .filter((r) => o.leakDrafts || r.status === 'published'));   // leakDrafts: a loader bug
  return {
    sb, writes, reads, el: getEl,
    async run() {
      handler();
      for (let i = 0; i < 20; i++) await Promise.resolve();
      await new Promise((r) => setTimeout(r, 0));
      for (let i = 0; i < 20; i++) await Promise.resolve();
    },
    shown: () => ['unavailableState', 'lockedState', 'programContent']
      .filter((id) => els[id] && els[id].style.display && els[id].style.display !== 'none'),
  };
}

const sessRows = (h) => (h.el('sessList').innerHTML.match(/class="sched-row[^"]*"/g) || []).length;

/* ── renders a published catalog Program ─────────────────────────────────── */

test('Home Strength at 5 days: the full week with its repeated session, a week plan and equipment', async () => {
  const h = harness({ purchases: MEMBERSHIP, links: HS_LINKS, days: 5 });
  await h.run();
  assert.deepEqual(h.shown(), ['programContent']);
  assert.equal(h.el('progName').textContent, 'Home Strength');
  assert.equal(sessRows(h), 5);
  const list = h.el('sessList').innerHTML;
  assert.equal((list.match(/Conditioning &amp; Core/g) || []).length, 2, 'both copies listed');
  assert.ok(list.indexOf('Full Body C') > list.lastIndexOf('Conditioning &amp; Core'), 'in schedule order');
  assert.equal(h.el('weekSection').style.display, 'block');
  const week = h.el('weekList').innerHTML;
  ['Mon', 'Tue', 'Wed', 'Fri', 'Sat'].forEach((d) => assert.ok(week.includes('>' + d + '<'), d));
  assert.ok(!week.includes('>Thu<'), 'Thursday is the rest day at 5 days');
  assert.equal(h.el('equipSection').style.display, 'block');
  assert.match(h.el('equipCopy').textContent, /long resistance band/);
  assert.match(h.el('progFacts').innerHTML, /Included with membership/);
  assert.match(h.el('startBtn').href, /program=home_strength&session=full_a&mode=optional/);
  assert.equal(h.el('stickyCta').style.display, 'block');
  assert.deepEqual(h.writes, [], 'the page never writes or enrols');
});

test('the pointer preselects the right copy of a repeated session', async () => {
  // 5 days: full_a, C&C, full_b, C&C, full_c. Index 3 is the SECOND C&C.
  const h = harness({ purchases: MEMBERSHIP, links: HS_LINKS, days: 5, userProgram: { current_index: 3 } });
  await h.run();
  const rows = h.el('sessList').innerHTML.split('</button>');
  assert.match(rows[3], /sched-row selected/, 'position 4 is selected');
  assert.doesNotMatch(rows[1], /selected/, 'the first copy is not');
  assert.equal(h.el('ctaSessionName').textContent, 'Conditioning & Core');
  assert.match(h.el('startBtn').href, /session=conditioning_core/);
  // Choosing a row selects that position only.
  h.sb.selectSession(5);
  assert.equal(h.el('ctaSessionName').textContent, 'Full Body C');
  assert.equal((h.el('sessList').innerHTML.match(/sched-row selected/g) || []).length, 1);
});

test('a list longer than the week rotates: Home Strength at 2 days', async () => {
  const h = harness({ purchases: MEMBERSHIP, links: HS_LINKS, days: 2 });
  await h.run();
  assert.equal(sessRows(h), 3);
  assert.match(h.el('weekList').innerHTML, /Mon · Thu/);
  assert.match(h.el('weekNote').textContent, /rotate in order across these days: Full Body A, Full Body B, Full Body C/);
});

test('Advanced Fat Loss: only Full Body carries the approved rest note', async () => {
  const h = harness({ purchases: MEMBERSHIP, links: AFL_LINKS, days: 4, search: '?slug=advanced_fat_loss' });
  await h.run();
  assert.deepEqual(h.shown(), ['programContent']);
  const rows = h.el('sessList').innerHTML.split('</button>');
  assert.match(rows[2], /Full Body/);
  assert.match(rows[2], /rest-note">Don&#39;t do this session the day after Lower|rest-note">Don’t do this session the day after Lower/);
  assert.equal((h.el('sessList').innerHTML.match(/rest-note/g) || []).length, 1, 'no other session has a note');
  const week = h.el('weekList').innerHTML;
  assert.match(week, /Mon<\/span><span class="sess">Lower[\s\S]*Tue<\/span><span class="sess">Upper[\s\S]*Thu<\/span><span class="sess">Full Body[\s\S]*Sat<\/span><span class="sess">Conditioning \+ Core/);
});

/* ── never exposes an unavailable Program ────────────────────────────────── */

test('a Program that has not been migrated is unavailable, with no Routine read', async () => {
  const h = harness({ purchases: MEMBERSHIP, links: HS_LINKS, catalog: [MG] });
  await h.run();
  assert.deepEqual(h.shown(), ['unavailableState']);
  assert.ok(!h.reads.includes('program_routines'), 'no Routine is read for it');
  assert.deepEqual(h.writes, []);
  assert.equal(h.el('progName').textContent, '');
});

test('a draft catalog Program is unavailable even with a membership', async () => {
  const h = harness({ purchases: MEMBERSHIP, links: HS_LINKS, catalog: [MG, Object.assign({}, HS, { status: 'draft' })] });
  await h.run();
  assert.deepEqual(h.shown(), ['unavailableState']);
  assert.ok(!h.reads.includes('program_routines'));
});

test('even if the loader leaked a draft row, the page refuses it', async () => {
  const h = harness({ purchases: MEMBERSHIP, links: HS_LINKS, leakDrafts: true,
    catalog: [MG, Object.assign({}, HS, { status: 'draft' })] });
  await h.run();
  assert.deepEqual(h.shown(), ['unavailableState']);
  assert.ok(!h.reads.includes('program_routines'));
});

test('a slug that is not one of the six is unavailable, including Programs with their own page', async () => {
  for (const search of ['', '?slug=', '?slug=muscle_gain', '?slug=bodyweight_foundations',
    '?slug=HOME_STRENGTH', '?slug=home_strength%20', '?other=home_strength']) {
    const h = harness({ purchases: MEMBERSHIP, links: HS_LINKS, search });
    await h.run();
    assert.deepEqual(h.shown(), ['unavailableState'], search);
    assert.ok(!h.reads.includes('program_routines'), search);
    assert.deepEqual(h.writes, [], search);
  }
});

test('a catalog Program whose page_path is not this page is unavailable here', async () => {
  const h = harness({ purchases: MEMBERSHIP, links: HS_LINKS,
    catalog: [MG, Object.assign({}, HS, { page_path: 'program-home-strength.html' })] });
  await h.run();
  assert.deepEqual(h.shown(), ['unavailableState']);
  assert.ok(!h.reads.includes('program_routines'));
});

test('no access shows the locked state from the catalog flags, with no Routine read', async () => {
  const h = harness({ purchases: [], links: HS_LINKS,
    catalog: [Object.assign({}, HS, { standalone_purchasable: true })] });
  await h.run();
  assert.deepEqual(h.shown(), ['lockedState']);
  assert.match(h.el('lockedCopy').textContent, /membership, or available as a one-time purchase/);
  assert.ok(!h.reads.includes('program_routines'));
});

test('a missing Routine fails the whole week closed and hides the week plan', async () => {
  const h = harness({ purchases: MEMBERSHIP, links: HS_LINKS.filter((l) => l.session_key !== 'full_c'), days: 5 });
  await h.run();
  assert.equal(sessRows(h), 0, 'never a partial week');
  assert.equal(h.el('weekSection').style.display, 'none');
  assert.notEqual(h.el('stickyCta').style.display, 'block');
  assert.match(h.el('sessSummary').innerHTML, /temporarily unavailable/);
});

test('an unsupported frequency hides the week plan and the Start button', async () => {
  const h = harness({ purchases: MEMBERSHIP, links: HS_LINKS, days: 1 });
  await h.run();
  assert.equal(h.el('weekSection').style.display, 'none');
  assert.notEqual(h.el('stickyCta').style.display, 'block');
});

test('static markup names no Program, session or exercise', () => {
  const markup = PAGE.slice(0, PAGE.indexOf('<script src="https://cdn.jsdelivr'));
  assert.doesNotMatch(markup, /Home Strength|Home Fat Loss|Bodyweight Fat Loss|Advanced (Muscle|Fat Loss|Home Strength)|Full Body [ABC]|Conditioning/);
  assert.doesNotMatch(PAGE, /\p{Extended_Pictographic}/u, 'no emojis');
});

/* ── locked: membership route (owner-approved 2026-11-17) ──────────────────
 * A locked, membership-included Program offers the EXISTING membership card on
 * the Store as its primary action; Browse programs steps down to secondary. An
 * individually-only Program never shows it, and members never see the locked
 * state at all. No price, checkout or entitlement logic is involved. */

test('locked + membership-included: Join membership is primary, Browse programs secondary', async () => {
  const h = harness({ purchases: [], links: HS_LINKS });   // HS: included_with_membership true
  await h.run();
  assert.deepEqual(h.shown(), ['lockedState']);
  assert.equal(h.el('lockedJoin').style.display, 'inline-flex');
  assert.equal(h.el('lockedBrowse').className, 'btn-secondary');
  assert.deepEqual(h.writes, []);
});

test('locked + individually-only: no Join membership, Browse programs stays primary', async () => {
  const h = harness({ purchases: [], links: HS_LINKS,
    catalog: [Object.assign({}, HS, { included_with_membership: false, standalone_purchasable: true })] });
  await h.run();
  assert.deepEqual(h.shown(), ['lockedState']);
  assert.equal(h.el('lockedJoin').style.display, 'none');
  assert.equal(h.el('lockedBrowse').className, 'btn-primary');
  assert.match(h.el('lockedCopy').textContent, /one-time purchase/);
});

test('a member never reaches the locked state, so the join route never runs', async () => {
  const h = harness({ purchases: MEMBERSHIP, links: HS_LINKS });
  await h.run();
  assert.deepEqual(h.shown(), ['programContent']);
  assert.equal(h.el('lockedJoin').style.display, '', 'showLocked never touched it');
});

test('the join link targets the existing Store membership card, hidden by default', () => {
  const locked = PAGE.slice(PAGE.indexOf('<div id="lockedState">'), PAGE.indexOf('<!-- Program content'));
  assert.equal((locked.match(/id="lockedJoin"/g) || []).length, 1);
  assert.match(locked, /<a class="btn-primary" id="lockedJoin" href="store\.html#membership" style="display:none;">Join membership<\/a>/);
  assert.match(locked, /id="lockedBrowse" href="workout\.html\?pane=programs">Browse programs<\/a>/);
  const store = read('store.html');
  assert.equal((store.match(/id="membership"/g) || []).length, 1, 'exactly one target');
  const card = store.slice(store.indexOf('id="membership"'));
  const next = card.indexOf('class="product-card', 10);
  assert.match(card.slice(0, next), /buyProduct\('ai_membership', this\)/, 'the target is the existing membership card');
});
