/* Phase 4.3.9B CP4e-2 — Bodyweight Foundations frequency activation.
 * ──────────────────────────────────────────────────────────────────────────
 * 2 and 3 days keep Full Body A/B/C; 4–6 days run the six CP4d frequency
 * Routines that CP4e-1 published. These tests run the REAL code of every
 * surface that resolves a Program session — Home (program-state.js), Train
 * "Next up" and the launch gate (workout.html), the Completion "Next" card
 * (workout-complete.html), History (workout-history.js) and progression
 * (workout.html) — in vm sandboxes over one Supabase stub that serves
 * production's nine Bodyweight Foundations links and records every write.
 *
 * Owner decisions pinned here (2026-10-05):
 *   A. A Program session's label is its Routine's OWN name wherever it can be
 *      read; SESSION_LABELS is only the fallback.
 *   B. An entitled member may directly launch any readable Routine of a Program
 *      they own, in or out of their schedule — parity with the other Programs.
 *      The schedule drives what is offered and progression, not entitlement.
 *   C. Fallback schedule resolution uses the user's actual training_days, never
 *      an assumed 3 days, for every Program. */

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { pcNormalizeCatalog } = require('./program-catalog.js');
const { resolveProgramAccess } = require('./entitlement-core.js');
const { pgSessionIndex } = require('./program-state.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));

function extractFn(src, name) {
  let start = src.indexOf('function ' + name + '(');
  assert.ok(start > -1, 'source defines ' + name + '()');
  if (src.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced braces in ' + name);
}

const SLUG = 'bodyweight_foundations';
const SCHEDULE = {
  2: ['full_a', 'full_b', 'full_c'],
  3: ['full_a', 'full_b', 'full_c'],
  4: ['push_core_a', 'lower_a', 'push_core_b', 'lower_b'],
  5: ['push_core_a', 'lower_a', 'conditioning_core', 'push_core_b', 'lower_b'],
  6: ['push_core_a', 'lower_a', 'conditioning_core', 'push_core_b', 'lower_b', 'mobility_recovery'],
};
const NAMES = {
  full_a: 'Full Body A', full_b: 'Full Body B', full_c: 'Full Body C',
  push_core_a: 'Push & Core A', lower_a: 'Lower Body A', conditioning_core: 'Conditioning & Core',
  push_core_b: 'Push & Core B', lower_b: 'Lower Body B', mobility_recovery: 'Mobility & Recovery',
};
const CP4E_KEYS = SCHEDULE[6];
const FAT_LOSS_ROUTINES = { upper_a: 'Upper A', lower_a: 'Lower A', upper_b: 'Upper B', lower_b: 'Lower B',
  full_a: 'Full Body A', full_b: 'Full Body B', full_c: 'Full Body C' };

// program_routines rows for production's nine Bodyweight links plus a few of
// another Program's (lower_a exists in both, under different Routine names).
const LINK_ROWS = Object.keys(NAMES).map((k, i) => ({
  session_key: k, sort_order: i + 1, programs: { slug: SLUG },
  workout_templates: { id: 'r-' + k, name: NAMES[k], exercises: [{ name: NAMES[k] + ' move 1' }, { name: 'move 2' }] },
})).concat(Object.keys(FAT_LOSS_ROUTINES).map((k, i) => ({
  session_key: k, sort_order: i + 1, programs: { slug: 'fat_loss_blueprint' },
  workout_templates: { id: 'fl-' + k, name: FAT_LOSS_ROUTINES[k], exercises: [{ name: 'Bench Press' }] },
})));

const BWF_ROW = {
  slug: SLUG, name: 'Bodyweight Foundations', description: 'Equipment-free full-body strength program',
  goal: 'muscle', difficulty: 'Beginner – Intermediate', duration_weeks: 8, recommended_days_per_week: 3,
  equipment_summary: 'Bodyweight', included_with_membership: true, standalone_purchasable: false,
  status: 'published', sort_order: 4, page_path: 'program-bodyweight.html',
};
const FAT_LOSS_ROW = {
  slug: 'fat_loss_blueprint', name: '90 Day Fat Loss Blueprint', description: '12-week fat loss system',
  goal: 'fatloss', difficulty: 'Beginner – Intermediate', duration_weeks: 12, recommended_days_per_week: 4,
  equipment_summary: 'Full Gym', included_with_membership: true, standalone_purchasable: true,
  status: 'published', sort_order: 1, page_path: 'program-fat-loss.html',
};
const CATALOG = pcNormalizeCatalog([FAT_LOSS_ROW, BWF_ROW]);
const MEMBERSHIP = [{ product: 'ai_membership', status: 'active' }];

/* A Supabase stub: serves program_routines from LINK_ROWS honouring eq/in on
 * session_key and programs.slug, a configurable user_programs row and profile,
 * and records every query. */
function makeDb(o) {
  o = o || {};
  const log = [];
  const match = (row, q) => q.filters.every(([op, col, v]) => {
    const val = col === 'programs.slug' ? row.programs.slug : row[col];
    return op === 'eq' ? val === v : v.includes(val);
  });
  function resolve(q) {
    log.push(q);
    if (q.table === 'program_routines') {
      if (o.namesFail) return { data: null, error: { message: 'boom' } };
      const rows = LINK_ROWS.filter((r) => match(r, q));
      return q.single ? { data: rows[0] || null, error: null } : { data: rows, error: null };
    }
    if (q.table === 'user_programs') {
      if (q.op !== 'select') return { data: null, error: null };
      return { data: o.up === undefined ? null : o.up, error: null };
    }
    if (q.table === 'profiles') return { data: o.profile === undefined ? null : o.profile, error: null };
    if (q.table === 'workouts') return { data: o.workouts || [], error: null };
    return { data: null, error: null };
  }
  const client = {
    from(table) {
      const q = { table, filters: [], op: 'select', payload: null, single: false };
      const run = () => Promise.resolve(resolve(q));
      const api = {
        select() { return api; },
        eq(c, v) { q.filters.push(['eq', c, v]); return api; },
        in(c, v) { q.filters.push(['in', c, v]); return api; },
        order() { return api; },
        limit() { return api; },
        update(p) { q.op = 'update'; q.payload = p; return api; },
        insert(p) { q.op = 'insert'; q.payload = p; return api; },
        maybeSingle() { q.single = true; return { then: (a, b) => run().then(a, b) }; },
        single() { q.single = true; return { then: (a, b) => run().then(a, b) }; },
        then(a, b) { return run().then(a, b); },
      };
      return api;
    },
  };
  return {
    client, log,
    writes: () => log.filter((q) => q.op !== 'select').map((q) => ({ table: q.table, op: q.op, payload: q.payload })),
    reads: (t) => log.filter((q) => q.table === t && q.op === 'select').length,
  };
}

const elements = () => {
  const els = {};
  return { els, document: { getElementById: (id) => (els[id] = els[id] || { innerHTML: '', textContent: '', style: {} }) } };
};
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/* ── Mapping ───────────────────────────────────────────────────────────── */

function loadSchedules() {
  const s = {};
  vm.createContext(s);
  vm.runInContext(read('schedules.js'), s);
  return s;
}

test('mapping: exact ordered sessions at 2, 3, 4, 5 and 6 days', () => {
  const S = loadSchedules();
  for (const d of [2, 3, 4, 5, 6]) {
    assert.deepStrictEqual(plain(S.getScheduleForDays(SLUG, d)), SCHEDULE[d], 'days=' + d);
  }
  // Out-of-range values keep the engine's long-standing normalization.
  assert.deepStrictEqual(plain(S.getScheduleForDays(SLUG, 9)), SCHEDULE[6]);
  assert.deepStrictEqual(plain(S.getScheduleForDays(SLUG, null)), SCHEDULE[3]);
});

test('mapping: a 2-day user still reaches Full Body C', () => {
  const keys = loadSchedules().getScheduleForDays(SLUG, 2);
  const walked = [0, 1, 2, 3, 4, 5].map((i) => keys[pgSessionIndex(keys, i)]);
  assert.deepStrictEqual(walked, ['full_a', 'full_b', 'full_c', 'full_a', 'full_b', 'full_c']);
});

test('mapping: other Programs keep their exact schedules', () => {
  const S = loadSchedules();
  const FROZEN = {
    fat_loss_blueprint: {
      2: ['full_a', 'full_b'], 3: ['full_a', 'full_b', 'full_c'],
      4: ['upper_a', 'lower_a', 'upper_b', 'lower_b'],
      5: ['push_a', 'pull_a', 'legs_a', 'upper_b', 'lower_b'],
      6: ['push_a', 'pull_a', 'legs_a', 'push_b', 'pull_b', 'legs_b'],
    },
    muscle_gain: {
      2: ['full_a', 'full_b'], 3: ['full_a', 'full_b', 'full_c'],
      4: ['upper_a', 'lower_a', 'upper_b', 'lower_b'],
      5: ['push_a', 'pull_a', 'legs_a', 'upper_b', 'lower_b'],
      6: ['push_a', 'pull_a', 'legs_a', 'push_b', 'pull_b', 'legs_b'],
    },
    glute_builder: {
      2: ['glute_a', 'glute_b'], 3: ['glute_a', 'glute_b', 'glute_c'],
      4: ['glute_lower_a', 'upper_a', 'glute_lower_b', 'upper_b'],
      5: ['glute_lower_a', 'upper_push_a', 'glute_lower_b', 'upper_pull_a', 'glute_pump'],
      6: ['glute_lower_a', 'upper_push_a', 'glute_lower_b', 'upper_pull_a', 'glute_pump', 'full_body_glute'],
    },
  };
  for (const slug of Object.keys(FROZEN)) {
    for (let d = 2; d <= 6; d++) assert.deepStrictEqual(plain(S.getScheduleForDays(slug, d)), FROZEN[slug][d], slug + ' ' + d);
  }
  assert.equal(Object.keys(S.PROGRAM_SCHEDULES).length, 4);
});

/* ── Home / Today's Plan (program-state.js) ────────────────────────────── */

function homeHarness(o) {
  const db = makeDb(o);
  const sb = { supabaseClient: db.client, console: { error() {}, warn() {} } };
  vm.createContext(sb);
  vm.runInContext(read('schedules.js') + '\n' + read('program-catalog.js') + '\n' + read('program-state.js'), sb);
  sb.__CATALOG = CATALOG;
  vm.runInContext('pcCached = function () { return __CATALOG; };', sb);
  if (o && o.noNameHelper) vm.runInContext('pcRoutineNames = undefined;', sb);
  return { sb, db };
}

for (const d of [2, 3, 4, 5, 6]) {
  test('Home: a ' + d + '-day user is offered the first scheduled session, by its Routine name', async () => {
    const { sb, db } = homeHarness({ up: null });
    const r = await sb.pgResolveSession('u1', SLUG, d);
    assert.deepStrictEqual(plain(r.keys), SCHEDULE[d]);
    assert.equal(r.sessionKey, SCHEDULE[d][0]);
    assert.equal(r.sessionLabel, NAMES[SCHEDULE[d][0]], 'the Routine name, never a raw key');
    assert.equal(r.href, 'workout.html?program=' + SLUG + '&session=' + SCHEDULE[d][0] + '&mode=progression');
    assert.equal(db.reads('program_routines'), 1, 'one name read');
    assert.deepStrictEqual(db.writes(), [], 'viewing Home creates no enrolment and writes nothing');
  });
}

test('Home: progression index walks the stored schedule; Lower Body A is never "Lower A"', async () => {
  const { sb } = homeHarness({ up: { id: 'up1', schedule_keys: SCHEDULE[4], current_index: 1 } });
  const r = await sb.pgResolveSession('u1', SLUG, 4);
  assert.equal(r.sessionKey, 'lower_a');
  assert.equal(r.sessionLabel, 'Lower Body A');
});

test('Home: a stale stored schedule is remapped to the user\'s frequency, keeping their place', async () => {
  // A row stored when the user trained 3 days; they now train 5.
  const { sb, db } = homeHarness({ up: { id: 'up1', schedule_keys: SCHEDULE[3], current_index: 1 } });
  const r = await sb.pgResolveSession('u1', SLUG, 5);
  assert.deepStrictEqual(plain(r.keys), SCHEDULE[5]);
  const w = db.writes();
  assert.equal(w.length, 1);
  assert.deepStrictEqual(plain(w[0]), { table: 'user_programs', op: 'update', payload: { schedule_keys: SCHEDULE[5], current_index: 1 } });
});

test('Home: if the Routine name cannot be read, the existing label map is the fallback', async () => {
  for (const o of [{ namesFail: true }, { noNameHelper: true }]) {
    const { sb } = homeHarness(Object.assign({ up: null }, o));
    const r = await sb.pgResolveSession('u1', SLUG, 6);
    assert.equal(r.sessionLabel, 'Push & Core A', 'fallback label, still not a raw key');
    const lower = await (homeHarness(Object.assign({ up: { id: 'x', schedule_keys: SCHEDULE[6], current_index: 1 } }, o))
      .sb.pgResolveSession('u1', SLUG, 6));
    assert.equal(lower.sessionLabel, 'Lower A', 'lower_a keeps its shared fallback when unreadable');
  }
});

test('Home: another Program is labelled by its own Routine, not by Bodyweight\'s', async () => {
  const { sb } = homeHarness({ up: { id: 'u', schedule_keys: ['upper_a', 'lower_a', 'upper_b', 'lower_b'], current_index: 1 } });
  const r = await sb.pgResolveSession('u1', 'fat_loss_blueprint', 4);
  assert.equal(r.sessionKey, 'lower_a');
  assert.equal(r.sessionLabel, 'Lower A', 'the fat-loss Routine named Lower A');
});

/* ── Train "Next up" (workout.html) ────────────────────────────────────── */

const WORKOUT = read('workout.html');

function trainHarness(o) {
  const db = makeDb(o);
  const dom = elements();
  const sb = {
    console: { error() {}, warn() {} }, supabaseClient: db.client, document: dom.document,
    currentUser: { id: 'u1' }, esc, rtNormalizeExercises: (x) => x,
    pcLoadCatalog: async () => CATALOG, loadPurchaseRowsOnce: async () => MEMBERSHIP, resolveProgramAccess,
    programName: (s) => (s === SLUG ? 'Bodyweight Foundations' : s),
  };
  vm.createContext(sb);
  vm.runInContext(read('schedules.js') + '\n' + read('program-catalog.js'), sb);
  sb.pcLoadCatalog = async () => CATALOG;   // the real loader was just defined; stub it again
  vm.runInContext(['loadProgramSession', 'renderActiveProgramSession', 'renderRecommended']
    .map((n) => extractFn(WORKOUT, n)).join('\n'), sb);
  return { sb, db, dom };
}

for (const d of [2, 3, 4, 5, 6]) {
  test('Train: a ' + d + '-day user\'s "Next up" is the scheduled session, by its Routine name', async () => {
    const { sb, db, dom } = trainHarness({ up: null });
    assert.equal(await sb.renderActiveProgramSession({ active_program: SLUG, training_days: d }), true);
    const html = dom.els.recommendedWrap.innerHTML;
    assert.ok(html.includes(esc(NAMES[SCHEDULE[d][0]])), html);
    assert.ok(html.includes("startRecommended('" + SLUG + "','" + SCHEDULE[d][0] + "')"));
    assert.ok(!/>\s*(push_core|lower_a|conditioning|mobility)/.test(html), 'no raw key rendered');
    assert.deepStrictEqual(db.writes(), [], 'no enrolment, no write');
  });
}

test('Train: Lower Body A is labelled by its Routine, never the shared "Lower A"', async () => {
  // lower_a is the one key whose shared fallback label differs from the Routine.
  const { sb, dom } = trainHarness({ up: { schedule_keys: SCHEDULE[4], current_index: 1 } });
  assert.equal(await sb.renderActiveProgramSession({ active_program: SLUG, training_days: 4 }), true);
  const html = dom.els.recommendedWrap.innerHTML;
  assert.ok(html.includes('>Lower Body A<'), html);
  assert.ok(!html.includes('>Lower A<'));
});

/* ── Launch (workout.html authorizeProgramSession) ─────────────────────── */

function launchHarness(purchases) {
  const db = makeDb({});
  const sb = {
    console: { error() {}, warn() {} }, supabaseClient: db.client, currentUser: { id: 'u1' },
    rtNormalizeExercises: (x) => x, pcLoadCatalog: async () => CATALOG,
    loadPurchaseRowsOnce: async () => purchases, resolveProgramAccess,
  };
  vm.createContext(sb);
  vm.runInContext(read('program-catalog.js'), sb);
  sb.pcLoadCatalog = async () => CATALOG;   // the real loader was just defined; stub it again
  vm.runInContext(['programAccessDenied', 'loadProgramSession', 'authorizeProgramSession']
    .map((n) => extractFn(WORKOUT, n)).join('\n'), sb);
  return { sb, db };
}

test('launch: every scheduled Bodyweight session can launch, carrying its Routine name', async () => {
  const { sb, db } = launchHarness(MEMBERSHIP);
  for (const k of Object.keys(NAMES)) {
    const a = await sb.authorizeProgramSession(SLUG, k);
    assert.equal(a.allowed, true, k);
    assert.equal(a.session.session_name, NAMES[k], k);
  }
  assert.deepStrictEqual(db.writes(), [], 'authorization itself writes nothing');
});

test('launch (owner decision B): an out-of-schedule Routine of an owned Program may be launched directly', async () => {
  // A 3-day user's schedule is A/B/C, yet they may open Mobility & Recovery by URL,
  // and a 4-day user may open Full Body A — exactly as the other Programs allow.
  const { sb, db } = launchHarness(MEMBERSHIP);
  for (const k of ['mobility_recovery', 'push_core_a', 'full_a', 'full_c']) {
    const a = await sb.authorizeProgramSession(SLUG, k);
    assert.equal(a.allowed, true, k);
  }
  // The gate reads no profile and no schedule: the schedule is not an entitlement boundary.
  assert.equal(db.reads('profiles'), 0);
  assert.equal(db.reads('user_programs'), 0);
  assert.deepStrictEqual(db.writes(), [], 'launch never redefines the configured schedule');
  // No Bodyweight-specific schedule check was added to the gate.
  const gate = extractFn(WORKOUT, 'authorizeProgramSession');
  assert.ok(!/getScheduleForDays|training_days|bodyweight/i.test(gate));
});

test('launch: entitlement still protects every session', async () => {
  const none = launchHarness([]);
  for (const k of ['full_a', 'push_core_a', 'mobility_recovery']) {
    const a = await none.sb.authorizeProgramSession(SLUG, k);
    assert.deepStrictEqual(plain(a), { allowed: false, reason: 'no_access', session: null }, k);
  }
  const ok = launchHarness(MEMBERSHIP);
  const missing = await ok.sb.authorizeProgramSession(SLUG, 'pull_a');
  assert.equal(missing.allowed, false, 'a key the Program does not link is unavailable');
  assert.equal(missing.reason, 'unavailable');
});

/* ── Progression (workout.html advanceProgramSession) ──────────────────── */

function advanceHarness(o) {
  const db = makeDb(o);
  const sb = {
    console: { error() {}, warn() {} }, supabaseClient: db.client, currentUser: { id: 'u1' },
    canAdvanceProgram: async () => true,
  };
  vm.createContext(sb);
  vm.runInContext(read('schedules.js'), sb);
  vm.runInContext(extractFn(WORKOUT, 'advanceProgramSession'), sb);
  return { sb, db };
}
const advanceUpdate = (db) => db.writes().filter((w) => w.table === 'user_programs' && w.op === 'update').map((w) => plain(w.payload));

for (const d of [4, 5, 6]) {
  test('progression: a ' + d + '-day user advances through their own schedule', async () => {
    const keys = SCHEDULE[d];
    for (let i = 0; i < keys.length; i++) {
      const { sb, db } = advanceHarness({ up: { id: 'up1', schedule_keys: keys, current_index: i } });
      await sb.advanceProgramSession(SLUG, keys[i]);
      const u = advanceUpdate(db);
      assert.equal(u.length, 1);
      assert.equal(u[0].current_index, (i + 1) % keys.length, keys[i] + ' → ' + keys[(i + 1) % keys.length]);
      assert.ok(!('schedule_keys' in u[0]), 'completing a session never rewrites the schedule');
    }
  });
}

test('progression fallback (decision C): a row without keys uses the actual training_days, not 3', async () => {
  // 5-day user, row with no stored keys, just finished Push & Core B (index 3).
  // Under the old 3-day assumption push_core_b was not in A/B/C, so the index
  // merely ticked on from 0 to 1 — the wrong next session.
  const { sb, db } = advanceHarness({ up: { id: 'up1', schedule_keys: [], current_index: 0 }, profile: { training_days: 5 } });
  await sb.advanceProgramSession(SLUG, 'push_core_b');
  assert.deepStrictEqual(advanceUpdate(db).map((u) => u.current_index), [4], 'push_core_b → lower_b');
  assert.equal(db.reads('profiles'), 1);
});

test('progression fallback: another Program uses its own schedule at the actual frequency', async () => {
  const { sb, db } = advanceHarness({ up: { id: 'up1', schedule_keys: null, current_index: 0 }, profile: { training_days: 4 } });
  await sb.advanceProgramSession('fat_loss_blueprint', 'lower_b');
  // 4-day split: lower_b is index 3, so the next is index 0 (the old rule gave 1).
  assert.deepStrictEqual(advanceUpdate(db).map((u) => u.current_index), [0], 'lower_b wraps to upper_a');
});

test('progression fallback: missing or invalid training_days keeps the engine\'s normalization', async () => {
  for (const profile of [null, { training_days: null }, { training_days: 0 }]) {
    const { sb, db } = advanceHarness({ up: { id: 'up1', schedule_keys: [], current_index: 0 }, profile });
    await sb.advanceProgramSession(SLUG, 'full_b');
    assert.deepStrictEqual(advanceUpdate(db).map((u) => u.current_index), [2], JSON.stringify(profile) + ' → 3-day A/B/C');
  }
});

test('progression: an out-of-schedule completion advances the index but never rewrites the schedule', async () => {
  const { sb, db } = advanceHarness({ up: { id: 'up1', schedule_keys: SCHEDULE[3], current_index: 0 } });
  await sb.advanceProgramSession(SLUG, 'mobility_recovery');
  const u = advanceUpdate(db);
  assert.equal(u.length, 1);
  assert.deepStrictEqual(Object.keys(u[0]).sort(), ['current_index', 'updated_at']);
});

test('progression: the first progression finish still creates the row at the actual frequency', async () => {
  // Pre-existing behaviour (CP3d-1): only a progression finish enrols; CP4e-2 adds none.
  const { sb, db } = advanceHarness({ up: null, profile: { training_days: 6 } });
  await sb.advanceProgramSession(SLUG, 'push_core_a');
  const ins = db.writes().filter((w) => w.op === 'insert');
  assert.equal(ins.length, 1);
  assert.deepStrictEqual(plain(ins[0].payload.schedule_keys), SCHEDULE[6]);
  assert.equal(ins[0].payload.current_index, 1);
});

/* ── Completion "Next" card (workout-complete.html) ────────────────────── */

const COMPLETE = read('workout-complete.html');

function completeHarness(o) {
  const db = makeDb(o);
  const dom = elements();
  const sb = {
    console: { error() {}, warn() {} }, supabaseClient: db.client, document: dom.document,
    user: { id: 'u1' }, esc, programName: (s) => (s === SLUG ? 'Bodyweight Foundations' : 'Fat Loss'),
  };
  vm.createContext(sb);
  vm.runInContext(read('schedules.js'), sb);
  vm.runInContext(['programSession', 'programSessionExercises', 'renderNext'].map((n) => extractFn(COMPLETE, n)).join('\n'), sb);
  return { sb, db, dom };
}

test('Completion: the session helpers are top-level, so renderNext can actually reach them', () => {
  // They used to be declared inside loadAll(); renderNext's call then threw a
  // swallowed ReferenceError and its "Focus" line never rendered.
  const loadAll = extractFn(COMPLETE, 'loadAll');
  assert.ok(!/function programSession/.test(loadAll), 'not nested in loadAll');
  assert.ok(/\n {2}async function programSession\(slug, key\)\{/.test(COMPLETE));
});

for (const d of [4, 5, 6]) {
  test('Completion (decision C): a ' + d + '-day user with no stored schedule sees their own next session', async () => {
    const { sb, db, dom } = completeHarness({ up: null, profile: { training_days: d } });
    await sb.renderNext({ program_slug: SLUG });
    const html = dom.els.nextCard.innerHTML;
    assert.ok(html.includes('<div class="next-name">' + esc(NAMES[SCHEDULE[d][0]]) + '</div>'), html);
    assert.ok(!html.includes('Full Body'), 'never the hard-coded 3-day schedule');
    assert.ok(html.includes('Focus: '), 'the focus line now renders');
    assert.deepStrictEqual(db.writes(), []);
  });
}

test('Completion: a stored schedule is followed, named by its Routine', async () => {
  const { sb, db, dom } = completeHarness({ up: { schedule_keys: SCHEDULE[5], current_index: 2 } });
  await sb.renderNext({ program_slug: SLUG });
  assert.ok(dom.els.nextCard.innerHTML.includes('>Conditioning &amp; Core<'));
  assert.equal(db.reads('profiles'), 0, 'no frequency read when the schedule is stored');
  assert.equal(db.reads('program_routines'), 1, 'one Routine read gives both name and focus');
});

test('Completion: another Program without a stored schedule now follows its real frequency', async () => {
  const { sb, dom } = completeHarness({ up: null, profile: { training_days: 4 } });
  await sb.renderNext({ program_slug: 'fat_loss_blueprint' });
  assert.ok(dom.els.nextCard.innerHTML.includes('>Upper A<'), 'its 4-day split, not Full Body A');
});

test('Completion: 2 and 3 days still show Full Body A first', async () => {
  for (const d of [2, 3]) {
    const { sb, dom } = completeHarness({ up: null, profile: { training_days: d } });
    await sb.renderNext({ program_slug: SLUG });
    assert.ok(dom.els.nextCard.innerHTML.includes('>Full Body A<'), 'days=' + d);
  }
});

test('Completion: Lower Body A is labelled by its Routine, never the shared "Lower A"', async () => {
  const { sb, dom } = completeHarness({ up: { schedule_keys: SCHEDULE[6], current_index: 1 } });
  await sb.renderNext({ program_slug: SLUG });
  assert.ok(dom.els.nextCard.innerHTML.includes('<div class="next-name">Lower Body A</div>'));
});

test('Completion: an unreadable Routine falls back to the label map, never a raw key', async () => {
  const { sb, dom } = completeHarness({ up: { schedule_keys: SCHEDULE[6], current_index: 5 }, namesFail: true });
  await sb.renderNext({ program_slug: SLUG });
  assert.ok(dom.els.nextCard.innerHTML.includes('>Mobility &amp; Recovery<'));
});

/* ── History (workout-history.js) ──────────────────────────────────────── */

function historyHarness(o) {
  const db = makeDb(o);
  const dom = elements();
  const sb = {
    console: { error() {}, warn() {} }, supabaseClient: db.client, document: dom.document,
    currentUser: { id: 'u1' }, showToast() {},
    programName: (s) => (s === SLUG ? 'Bodyweight Foundations' : 'Fat Loss'),
  };
  vm.createContext(sb);
  vm.runInContext(read('schedules.js') + '\n' + read('program-catalog.js') + '\n' + read('workout-history.js'), sb);
  // program-catalog.js defines the real programName (cache-backed); stub it again.
  sb.programName = (s) => (s === SLUG ? 'Bodyweight Foundations' : 'Fat Loss');
  if (o && o.noNameHelper) vm.runInContext('pcRoutineNames = undefined;', sb);
  return { sb, db, dom };
}

const W = (id, slug, key) => ({ id, name: 'w' + id, created_at: '2026-10-0' + (1 + (id % 9)) + 'T10:00:00Z',
  completed: true, user_id: 'u1', program_slug: slug, session_key: key, mode: 'optional', workout_exercises: [] });
const HISTORY = CP4E_KEYS.map((k, i) => W(i + 1, SLUG, k))
  .concat([W(7, SLUG, 'full_c'), W(8, 'fat_loss_blueprint', 'lower_a'), W(9, null, null)]);

test('History: every listed Program session is named by its Routine, in ONE batched read', async () => {
  const { sb, db, dom } = historyHarness({ workouts: HISTORY });
  await sb.loadHistory({});
  const html = dom.els.historyList.innerHTML;
  for (const k of CP4E_KEYS) {
    assert.ok(html.includes(esc('Bodyweight Foundations · ' + NAMES[k])), NAMES[k] + ' in the sub-line');
    assert.ok(!new RegExp('· ' + k + '\\b').test(html), 'raw key ' + k + ' never shown');
  }
  assert.ok(html.includes(esc('Bodyweight Foundations · Full Body C')));
  assert.ok(!html.includes('Bodyweight Foundations · Lower A'), 'never "Lower A" for Lower Body A');
  assert.ok(html.includes('Fat Loss · Lower A'), 'the other Program keeps its own Routine name');
  assert.equal(db.reads('program_routines'), 1, 'one batched lookup for the whole list');
  assert.deepStrictEqual(db.writes(), []);
});

test('History: when names cannot be read, the label map is the fallback — still no raw keys', async () => {
  for (const o of [{ namesFail: true }, { noNameHelper: true }]) {
    const { sb, dom } = historyHarness(Object.assign({ workouts: HISTORY }, o));
    await sb.loadHistory({});
    const html = dom.els.historyList.innerHTML;
    ['push_core_a', 'conditioning_core', 'push_core_b', 'mobility_recovery']
      .forEach((k) => assert.ok(html.includes(esc('Bodyweight Foundations · ' + NAMES[k])), k));
    assert.ok(html.includes('Bodyweight Foundations · Lower A'), 'documented fallback for lower_a');
  }
});

test('History: an empty or Program-less list issues no name lookup', async () => {
  const empty = historyHarness({ workouts: [] });
  await empty.sb.loadHistory({});
  assert.equal(empty.db.reads('program_routines'), 0);
  const manual = historyHarness({ workouts: [W(1, null, null)] });
  await manual.sb.loadHistory({});
  assert.equal(manual.db.reads('program_routines'), 0);
});

/* ── Shared helper contract (program-catalog.js) ───────────────────────── */

test('pcRoutineNames: one query, Program-scoped, failure-safe', async () => {
  const { sb, db } = homeHarness({});
  const names = plain(await sb.pcRoutineNames([
    { slug: SLUG, key: 'lower_a' }, { slug: 'fat_loss_blueprint', key: 'lower_a' }, { slug: SLUG, key: 'push_core_b' },
    null, { slug: '', key: 'x' }, { slug: SLUG },
  ]));
  assert.equal(names[SLUG + '|lower_a'], 'Lower Body A');
  assert.equal(names['fat_loss_blueprint|lower_a'], 'Lower A');
  assert.equal(names[SLUG + '|push_core_b'], 'Push & Core B');
  assert.equal(db.reads('program_routines'), 1);
  assert.deepStrictEqual(plain(await sb.pcRoutineNames([])), {});
  assert.deepStrictEqual(plain(await homeHarness({ namesFail: true }).sb.pcRoutineNames([{ slug: SLUG, key: 'lower_a' }])), {});
  // schedules.js stays a pure data module.
  assert.ok(!/supabaseClient|from\(|await/.test(read('schedules.js')));
});

/* ── Program metadata ──────────────────────────────────────────────────── */

test('Program metadata: the 3-day recommendation is unchanged', () => {
  const page = read('program-bodyweight.html');
  assert.ok(!/recommended_days_per_week\s*[:=]\s*[^3]/.test(page));
  assert.equal(BWF_ROW.recommended_days_per_week, 3);
});
