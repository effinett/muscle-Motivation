/* Phase 4.3.9B — CP3d-1. Program-session access hardening.
 * ──────────────────────────────────────────────────────────────────────────
 * A program workout is launched entirely from the address bar
 * (?program=&session=&mode=), so all three parameters are untrusted. Before
 * this change `startProgramSession` inserted a `workouts` row before proving
 * anything, and `advanceProgramSession` would then bootstrap a `user_programs`
 * ENROLMENT — reachable for a draft Program that no catalog or RLS policy
 * exposes.
 *
 * These tests execute the REAL functions out of workout.html in a vm sandbox
 * (the dashboard-zero-state.test.js pattern) against a write-recording stub
 * client, and assert EXACT ZERO writes on every denied path. The entitlement
 * contract itself is the real `resolveProgramAccess`, and slug lookup is the
 * real `pcBySlug` — neither is re-implemented here. */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { resolveProgramAccess } = require('./entitlement-core.js');
const { pcBySlug, pcNormalizeCatalog } = require('./program-catalog.js');
const { rtNormalizeExercises } = require('./routine-core.js');

const WORKOUT = fs.readFileSync(path.join(__dirname, 'workout.html'), 'utf8');

function extractFn(src, name) {
  let start = src.indexOf('function ' + name + '(');
  assert.ok(start > -1, 'workout.html defines ' + name + '()');
  // Keep an `async` prefix — dropping it would make `await` a syntax error.
  if (src.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced braces in ' + name);
}

/* ── Catalog fixtures: what the published-only loader would return ──────── */

const RAW = {
  muscle_gain: {
    slug: 'muscle_gain', name: 'Muscle Gain', goal: 'muscle',
    duration_weeks: 8, recommended_days_per_week: 3, equipment_summary: 'Full Gym',
    included_with_membership: true, standalone_purchasable: true,
    status: 'published', sort_order: 2, page_path: 'program-muscle-gain.html',
  },
  fat_loss_blueprint: {
    slug: 'fat_loss_blueprint', name: '90 Day Fat Loss Blueprint', goal: 'fatloss',
    duration_weeks: 12, recommended_days_per_week: 4, equipment_summary: 'Full Gym',
    included_with_membership: true, standalone_purchasable: true,
    status: 'published', sort_order: 1, page_path: 'program-fat-loss.html',
  },
};
// A draft or retired Program is ABSENT from the published-only catalog — that
// is what pcLoadCatalog()'s .eq('status','published') produces.
const PUBLISHED_CATALOG = pcNormalizeCatalog([RAW.fat_loss_blueprint, RAW.muscle_gain]);

const MEMBERSHIP = [{ product: 'ai_membership', status: 'active' }];
const STANDALONE = [{ product: 'muscle_gain', status: 'active' }];
const NO_PURCHASES = [];

const ROUTINE_ROW = {
  session_key: 'full_a',
  sort_order: 1,
  programs: { slug: 'muscle_gain' },
  workout_templates: {
    id: 'routine-uuid',
    name: 'Full Body A',
    exercises: [{
      name: 'Goblet Squat', sets: 3, reps_low: 6, reps_high: 10,
      notes: '', rest_sec: 90, exercise_id: '72f1d568-5da2-4351-8bac-9656c99f3557',
    }],
  },
};

/* ── Write-recording Supabase stub ──────────────────────────────────────── */

function makeClient(opts) {
  const o = opts || {};
  const writes = [];

  function readFor(state) {
    if (state.table === 'purchases') {
      if (o.purchasesError) return { data: null, error: { message: 'boom' } };
      return { data: o.purchases || NO_PURCHASES, error: null };
    }
    if (state.table === 'program_routines') {
      return { data: o.routine === undefined ? ROUTINE_ROW : o.routine, error: null };
    }
    if (state.table === 'user_programs') {
      return { data: o.userProgram || null, error: null };
    }
    if (state.table === 'profiles') {
      return { data: { training_days: 3 }, error: null };
    }
    return { data: null, error: null };
  }

  function builder(table) {
    const state = { table };
    const api = {
      select: () => api,
      eq: () => api,
      order: () => api,
      maybeSingle: async () => readFor(state),
      single: async () => readFor(state),
      then: (res) => res(readFor(state)),
      insert(payload) {
        writes.push({ table, op: 'insert', payload });
        const row = Object.assign({ id: table + '-' + (writes.length) }, payload);
        return {
          select: () => ({ single: async () => ({ data: row, error: null }) }),
          then: (res) => res({ data: null, error: null }),
        };
      },
      update(payload) {
        writes.push({ table, op: 'update', payload });
        return { eq: () => ({ then: (res) => res({ error: null }) }) };
      },
      delete() {
        writes.push({ table, op: 'delete' });
        return { eq: () => ({ then: (res) => res({ error: null }) }) };
      },
    };
    return api;
  }

  return { from: builder, __writes: writes };
}

/* ── Sandbox running the real workout.html functions ────────────────────── */

const FN_NAMES = [
  'programAccessDenied', 'loadPurchaseRowsOnce', 'authorizeProgramSession',
  'loadProgramSession', 'startProgramSession', 'canAdvanceProgram',
  'advanceProgramSession',
];

function makeSandbox(opts) {
  const o = opts || {};
  const client = makeClient(o);
  const toasts = [];

  const sandbox = {
    console: { error() {}, warn() {} },
    supabaseClient: client,
    currentUser: o.noUser ? null : { id: 'user-1' },
    currentWorkout: o.activeWorkout || null,
    exercises: [],
    // State owned by the real loadPurchaseRowsOnce(), fresh per sandbox.
    trainPurchaseRows: null,
    trainPurchasesInflight: null,
    SESSION_LABELS: { full_a: 'Full Body A', full_b: 'Full Body B', full_c: 'Full Body C' },
    // Real contracts — never re-implemented for the test.
    resolveProgramAccess,
    rtNormalizeExercises,
    pcBySlug,
    pcLoadCatalog: async () => {
      if (o.catalogThrows) throw new Error('network');
      return o.catalog === undefined ? PUBLISHED_CATALOG : o.catalog;
    },
    getScheduleForDays: () => ['full_a', 'full_b', 'full_c'],
    // Collaborators the launcher calls once it is past the gate.
    showToast: (m) => toasts.push(m),
    showStartView: () => {},
    showActiveView: () => {},
    whLocalDate: () => '2026-09-22',
    exerciseIdentityColumns: () => ({ exercise_id: null, user_exercise_id: null }),
    loadLastPerf: async () => {},
    loadExerciseHistory: async () => {},
    recForExercise: () => null,
    checkActiveWorkout: async () => {},
    localStorage: { setItem() {}, getItem: () => null, removeItem() {} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  const src = (o.source || WORKOUT);
  const code = FN_NAMES.map((n) => extractFn(src, n)).join('\n') +
    '\n' + (src.match(/var PROGRAM_ACCESS_MESSAGE = \{[\s\S]*?\};/) || [''])[0];
  vm.runInContext(code, sandbox);

  return { sandbox, client, toasts, writes: client.__writes };
}

const noWrites = (t, label) =>
  assert.deepEqual(t.writes, [], label + ' must write nothing, got ' +
    JSON.stringify(t.writes.map((w) => w.table + ':' + w.op)));

/* ── Denied paths: exact zero writes ────────────────────────────────────── */

test('1 · draft Program by direct URL creates no workout', async () => {
  // A draft Program is absent from the published-only catalog.
  const t = makeSandbox({ purchases: MEMBERSHIP });
  await t.sandbox.startProgramSession('bodyweight_foundations', 'full_a', 'optional');
  noWrites(t, 'draft launch');
  assert.match(t.toasts.join(' '), /isn’t available/);
});

test('2 · draft Program with mode=progression creates no workout and no enrolment', async () => {
  const t = makeSandbox({ purchases: MEMBERSHIP });
  await t.sandbox.startProgramSession('bodyweight_foundations', 'full_a', 'progression');
  noWrites(t, 'draft progression launch');
  // And the enrolment path independently refuses, even if reached directly.
  await t.sandbox.advanceProgramSession('bodyweight_foundations', 'full_a');
  noWrites(t, 'draft progression advance');
});

test('3 · draft Program in optional mode also creates nothing', async () => {
  const t = makeSandbox({ purchases: MEMBERSHIP });
  await t.sandbox.startProgramSession('bodyweight_foundations', 'full_b', 'optional');
  noWrites(t, 'draft optional launch');
});

test('4 · an unknown slug creates nothing', async () => {
  const t = makeSandbox({ purchases: MEMBERSHIP });
  await t.sandbox.startProgramSession('not_a_program', 'full_a', 'optional');
  noWrites(t, 'unknown slug');
});

test('5 · a retired Program creates nothing', async () => {
  // Retired behaves exactly like draft: the published-only catalog omits it.
  const t = makeSandbox({ purchases: MEMBERSHIP });
  await t.sandbox.startProgramSession('retired_program', 'full_a', 'progression');
  noWrites(t, 'retired program');
});

test('6 · a published Program without qualifying access creates nothing', async () => {
  const t = makeSandbox({ purchases: NO_PURCHASES });
  await t.sandbox.startProgramSession('muscle_gain', 'full_a', 'progression');
  noWrites(t, 'unentitled published program');
  assert.match(t.toasts.join(' '), /don’t have access/);
});

test('7 · an invalid session key creates nothing', async () => {
  // The Program-scoped Routine read returns no row for a key that is not
  // linked to this Program.
  const t = makeSandbox({ purchases: MEMBERSHIP, routine: null });
  await t.sandbox.startProgramSession('muscle_gain', 'not_a_session', 'optional');
  noWrites(t, 'invalid session key');
});

test('8 · an unreadable or missing Routine creates nothing', async () => {
  const t = makeSandbox({ purchases: MEMBERSHIP, routine: null });
  await t.sandbox.startProgramSession('muscle_gain', 'full_a', 'progression');
  noWrites(t, 'unreadable routine');
  assert.match(t.toasts.join(' '), /isn’t available yet/);
});

test('9 · catalog-load failure fails closed', async () => {
  const thrown = makeSandbox({ purchases: MEMBERSHIP, catalogThrows: true });
  await thrown.sandbox.startProgramSession('muscle_gain', 'full_a', 'progression');
  noWrites(thrown, 'catalog throw');

  // pcLoadCatalog() degrades to [] rather than throwing; that is
  // indistinguishable from an empty catalog and must also deny.
  const empty = makeSandbox({ purchases: MEMBERSHIP, catalog: [] });
  await empty.sandbox.startProgramSession('muscle_gain', 'full_a', 'progression');
  noWrites(empty, 'empty catalog');
  assert.match(empty.toasts.join(' '), /try again/);
});

test('10 · entitlement-resolution failure fails closed', async () => {
  const t = makeSandbox({ purchasesError: true });
  await t.sandbox.startProgramSession('muscle_gain', 'full_a', 'progression');
  noWrites(t, 'purchases error');

  // A signed-out/unresolved user must never be treated as entitled.
  const anon = makeSandbox({ purchases: MEMBERSHIP, noUser: true });
  await anon.sandbox.startProgramSession('muscle_gain', 'full_a', 'optional');
  noWrites(anon, 'missing current user');
});

test('11 · no mode value can bypass the gate', async () => {
  for (const mode of ['progression', 'optional', 'PROGRESSION', 'admin', '', null,
                      undefined, 0, {}, ['progression']]) {
    const t = makeSandbox({ purchases: MEMBERSHIP });
    await t.sandbox.startProgramSession('bodyweight_foundations', 'full_a', mode);
    noWrites(t, 'draft launch with mode=' + JSON.stringify(mode));
  }
});

test('11b · malformed program/session parameters create nothing', async () => {
  const bad = [[null, 'full_a'], ['muscle_gain', null], ['', 'full_a'], ['muscle_gain', ''],
               [{}, 'full_a'], ['muscle_gain', ['full_a']], [undefined, undefined]];
  for (const [p, s] of bad) {
    const t = makeSandbox({ purchases: MEMBERSHIP });
    await t.sandbox.startProgramSession(p, s, 'progression');
    noWrites(t, 'malformed params ' + JSON.stringify([p, s]));
  }
});

/* ── Legitimate paths must still work ───────────────────────────────────── */

function tables(writes) { return writes.map((w) => w.table + ':' + w.op); }

test('12 · a membership-included published Program starts for a member', async () => {
  const t = makeSandbox({ purchases: MEMBERSHIP });
  await t.sandbox.startProgramSession('muscle_gain', 'full_a', 'optional');
  const w = tables(t.writes);
  assert.ok(w.includes('workouts:insert'), 'the workout must be created: ' + w.join(', '));
  assert.ok(w.includes('workout_exercises:insert'), 'prescription must load');
  const workout = t.writes.find((x) => x.table === 'workouts').payload;
  assert.equal(workout.program_slug, 'muscle_gain');
  assert.equal(workout.session_key, 'full_a');
  assert.equal(workout.name, 'Full Body A — ' + new Date().toLocaleDateString('en-US', { weekday: 'short' }));
});

test('13 · a qualifying standalone purchase still starts', async () => {
  const t = makeSandbox({ purchases: STANDALONE });
  await t.sandbox.startProgramSession('muscle_gain', 'full_a', 'optional');
  assert.ok(tables(t.writes).includes('workouts:insert'), 'standalone owner must start');
});

test('14 · optional mode stays optional', async () => {
  const t = makeSandbox({ purchases: MEMBERSHIP });
  await t.sandbox.startProgramSession('muscle_gain', 'full_a', 'optional');
  assert.equal(t.writes.find((x) => x.table === 'workouts').payload.mode, 'optional');
  // An unrecognised mode still degrades to optional, never to progression.
  const odd = makeSandbox({ purchases: MEMBERSHIP });
  await odd.sandbox.startProgramSession('muscle_gain', 'full_a', 'admin');
  assert.equal(odd.writes.find((x) => x.table === 'workouts').payload.mode, 'optional');
});

test('15 · progression mode advances an existing enrolment', async () => {
  const t = makeSandbox({
    purchases: MEMBERSHIP,
    userProgram: { id: 'up-1', schedule_keys: ['full_a', 'full_b', 'full_c'], current_index: 0 },
  });
  await t.sandbox.advanceProgramSession('muscle_gain', 'full_a');
  const upd = t.writes.find((x) => x.table === 'user_programs' && x.op === 'update');
  assert.ok(upd, 'an entitled progression finish must advance: ' + tables(t.writes).join(', '));
  assert.equal(upd.payload.current_index, 1);
  assert.ok(!t.writes.some((x) => x.table === 'user_programs' && x.op === 'insert'));
});

test('16 · enrolment bootstraps only through the legitimate progression path', async () => {
  const ok = makeSandbox({ purchases: MEMBERSHIP, userProgram: null });
  await ok.sandbox.advanceProgramSession('muscle_gain', 'full_a');
  const ins = ok.writes.find((x) => x.table === 'user_programs' && x.op === 'insert');
  assert.ok(ins, 'an entitled first finish may create the enrolment');
  assert.equal(ins.payload.program_slug, 'muscle_gain');
  assert.equal(ins.payload.current_index, 1);
});

test('17 · advanceProgramSession refuses an unpublished slug when called directly', async () => {
  const t = makeSandbox({ purchases: MEMBERSHIP, userProgram: null });
  await t.sandbox.advanceProgramSession('bodyweight_foundations', 'full_a');
  noWrites(t, 'direct advance for a draft Program');
  assert.equal(await t.sandbox.canAdvanceProgram('bodyweight_foundations'), false);
});

test('18 · advanceProgramSession refuses an inaccessible published Program', async () => {
  const t = makeSandbox({ purchases: NO_PURCHASES, userProgram: null });
  await t.sandbox.advanceProgramSession('muscle_gain', 'full_a');
  noWrites(t, 'direct advance without entitlement');
  assert.equal(await t.sandbox.canAdvanceProgram('muscle_gain'), false);

  // …and it fails closed when access cannot be evaluated at all.
  const broken = makeSandbox({ purchasesError: true, userProgram: null });
  assert.equal(await broken.sandbox.canAdvanceProgram('muscle_gain'), false);
  await broken.sandbox.advanceProgramSession('muscle_gain', 'full_a');
  noWrites(broken, 'advance with unreadable purchases');
});

test('19 · rotation and current-index behaviour are unchanged', async () => {
  // Wrap-around and the unknown-key fallback must behave exactly as before.
  const wrap = makeSandbox({
    purchases: MEMBERSHIP,
    userProgram: { id: 'up-1', schedule_keys: ['full_a', 'full_b', 'full_c'], current_index: 1 },
  });
  await wrap.sandbox.advanceProgramSession('muscle_gain', 'full_c');
  assert.equal(wrap.writes.find((x) => x.op === 'update').payload.current_index, 0);

  const unknownKey = makeSandbox({
    purchases: MEMBERSHIP,
    userProgram: { id: 'up-1', schedule_keys: ['full_a', 'full_b', 'full_c'], current_index: 1 },
  });
  await unknownKey.sandbox.advanceProgramSession('muscle_gain', 'legacy_key');
  assert.equal(unknownKey.writes.find((x) => x.op === 'update').payload.current_index, 2);
});

test('20 · non-Program workout logging is untouched by the gate', () => {
  // The gate lives inside startProgramSession only. The manual and template
  // launchers are separate functions and were not modified.
  const manual = extractFn(WORKOUT, 'startWorkout');
  assert.ok(!/authorizeProgramSession/.test(manual), 'manual start must not be gated');
  const tpl = extractFn(WORKOUT, 'startTemplateSession');
  assert.ok(!/authorizeProgramSession/.test(tpl), 'template start must not be gated');
  // …and the template launcher still refuses platform Routines by itself.
  assert.match(tpl, /\.eq\('is_platform',\s*false\)/);
});

/* ── The gate must be load-bearing ──────────────────────────────────────── */

test('mutation sensitivity: removing the gate makes these tests fail', async () => {
  // Neutralise the call inside startProgramSession, then re-run the two
  // representative denials. If either still passes, the suite is not proving
  // the gate does the work.
  const bypassed = WORKOUT.replace(
    'var auth = await authorizeProgramSession(programSlug, sessionKey);',
    'var auth = { allowed: true, reason: "ok", session: null };');
  assert.notEqual(bypassed, WORKOUT, 'the gate call was not found to mutate');

  const t = makeSandbox({ purchases: MEMBERSHIP, source: bypassed });
  await t.sandbox.startProgramSession('bodyweight_foundations', 'full_a', 'progression');
  assert.ok(t.writes.length > 0,
    'with the gate bypassed a draft launch must write — otherwise test 2 proves nothing');

  // Same for the independent enrolment guard.
  const noGuard = WORKOUT.replace(
    'if (!(await canAdvanceProgram(programSlug))) return;', '');
  assert.notEqual(noGuard, WORKOUT, 'the enrolment guard was not found to mutate');
  const g = makeSandbox({ purchases: MEMBERSHIP, userProgram: null, source: noGuard });
  await g.sandbox.advanceProgramSession('bodyweight_foundations', 'full_a');
  assert.ok(g.writes.some((x) => x.table === 'user_programs' && x.op === 'insert'),
    'without the guard a draft enrolment must appear — otherwise test 17 proves nothing');
});

test('supplemental: the write path is ordered after the gate in source', () => {
  const fn = extractFn(WORKOUT, 'startProgramSession');
  const gate = fn.indexOf('authorizeProgramSession');
  const write = fn.indexOf(".from('workouts')");
  assert.ok(gate > -1 && write > -1);
  assert.ok(gate < write, 'authorization must precede the first write');
});
