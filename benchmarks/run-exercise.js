// Exercise-resolution benchmark runner (Phase 4.2.1E) — scores the SHARED
// exercise-intelligence resolver (exercise-core.js createExerciseIndex) against
// benchmarks/exercise-cases.jsonl, over the fixture catalog snapshot
// (benchmarks/exercise-fixtures.js). Pure + offline: no DB, no network, no keys.
//
//   node benchmarks/run-exercise.js            # report, always exits 0
//   node benchmarks/run-exercise.js --strict   # exit 1 on any unexpected failure
//
// Division of labor vs the regression suite (exercise-core.test.js): the test
// file pins behavior Effi approved that must NEVER break (runs in npm test); this
// benchmark is the score to improve as the catalog grows and resolution gets
// smarter. known_fail cases document today's gaps without counting against the
// pass rate — but if one STARTS passing, the runner flags it for promotion.
//
// Case format (one JSON object per line):
//   { id, input: { query, filters? },
//     expect: { name?, matchType?, matchTypeIn?[], notMatchType?, confidence?,
//               family?, notName?, unresolved?, unresolvedId?,
//               // picker search (Phase 4.2.1F):
//               searchTop?, searchTopNot?, searchIncludes?[], searchMinResults?, searchNoExact?,
//               // discovery = search + filters (Phase 4.2.1I):
//               discoveryTop?, discoveryTopNot?, discoveryIncludes?[], discoveryExcludes?[],
//               discoveryMinResults?, discoveryEquip?[], discoveryEmpty? },
//     known_fail?, tags?[] }
// input.filters = { splits?[], movements?[], equipment?[] } (keys per exercise-filters.js).
//
// Phase 4.2.1J — logging identity + chronology (exercise-log.js), scored inline:
//   { id, identity: { a, b, sameExercise }, tags }
//     a / b are either a query STRING (resolved to real catalog identity via the
//     shared index) or a literal ref { exerciseId?, customId?, name } (for
//     custom / free-typed cases the catalog can't produce). sameExercise asserts
//     ExerciseLog.isComparableForProgression(a, b).
//   { id, prevSession: { sessions[], opts?, expectOrder[] }, tags }
//     asserts the workoutId order of ExerciseLog.selectPreviousSessions(...) —
//     current/incomplete/future-dated exclusion + deterministic ordering.
//
// Phase 4.2.1K — stable PR / exercise identity (exercise-log.js), scored inline:
//   { id, prIdentity: { a, b?, sameKey?, type?, key?, conflict? }, tags }
//     a / b are refs (query string or literal { exerciseId?, customId?, name }).
//     sameKey asserts ExerciseLog.identityKey(a)===identityKey(b) (PR identity
//     separation across canonical/custom/rename/recreate). type/key/conflict
//     assert identityType / identityKey / prConflictTarget of `a`.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EX = require('../exercise-core.js');
const EF = require('../exercise-filters.js');
const EL = require('../exercise-log.js');
const { EXERCISE_CATALOG } = require('./exercise-fixtures.js');

const strict = process.argv.includes('--strict');
const idx = EX.createExerciseIndex(EXERCISE_CATALOG);

function loadCases() {
  const file = path.join(__dirname, 'exercise-cases.jsonl');
  return fs.readFileSync(file, 'utf8').split('\n')
    .map((l) => l.trim()).filter(Boolean)
    .map((l, i) => { try { return JSON.parse(l); } catch (e) { throw new Error(`bad JSONL at line ${i + 1}: ${e.message}`); } });
}

const EXACT_TYPES = ['exact_canonical', 'exact_alias', 'normalized', 'normalized_alias'];

// Returns null on pass, or a reason string on failure. Checks the single-answer
// resolve() (name/matchType/…) AND, when a case declares search* expectations,
// the LIST-producing picker search (Phase 4.2.1F) over the same catalog.
function checkCase(c) {
  const e = c.expect || {};
  const fails = [];
  // Resolution/search/discovery cases carry input.query; identity/prevSession
  // cases (Phase 4.2.1J) do not — skip the resolver for those.
  const r = c.input ? idx.resolve(c.input.query) : null;
  if (r) {
  if (e.name !== undefined && r.canonicalName !== e.name) fails.push(`name ${JSON.stringify(r.canonicalName)} != ${JSON.stringify(e.name)}`);
  if (e.notName !== undefined && r.canonicalName === e.notName) fails.push(`name must NOT be ${JSON.stringify(e.notName)}`);
  if (e.matchType !== undefined && r.matchType !== e.matchType) fails.push(`matchType ${r.matchType} != ${e.matchType}`);
  if (e.matchTypeIn !== undefined && e.matchTypeIn.indexOf(r.matchType) === -1) fails.push(`matchType ${r.matchType} not in [${e.matchTypeIn}]`);
  if (e.notMatchType !== undefined && r.matchType === e.notMatchType) fails.push(`matchType must NOT be ${e.notMatchType}`);
  if (e.confidence !== undefined && r.confidence !== e.confidence) fails.push(`confidence ${r.confidence} != ${e.confidence}`);
  if (e.family !== undefined && r.exerciseFamily !== e.family) fails.push(`family ${r.exerciseFamily} != ${e.family}`);
  if (e.unresolved === true && r.matchType !== 'unresolved') fails.push(`expected unresolved, got ${r.matchType}`);
  if (e.unresolvedId === true && r.canonicalExerciseId !== null) fails.push(`expected no single id, got ${r.canonicalName}`);

  // Picker-search expectations (only evaluated when present).
  const hasSearch = ['searchTop', 'searchTopNot', 'searchIncludes', 'searchMinResults', 'searchNoExact']
    .some((k) => e[k] !== undefined);
  if (hasSearch) {
    const s = idx.search(c.input.query);
    const list = s.results.map((x) => x.name);
    if (e.searchTop !== undefined && list[0] !== e.searchTop) fails.push(`searchTop ${JSON.stringify(list[0])} != ${JSON.stringify(e.searchTop)}`);
    if (e.searchTopNot !== undefined && list[0] === e.searchTopNot) fails.push(`searchTop must NOT be ${JSON.stringify(e.searchTopNot)}`);
    if (e.searchMinResults !== undefined && list.length < e.searchMinResults) fails.push(`searchMinResults ${list.length} < ${e.searchMinResults}`);
    if (e.searchIncludes !== undefined) e.searchIncludes.forEach((n) => { if (list.indexOf(n) === -1) fails.push(`searchIncludes missing ${JSON.stringify(n)}`); });
    if (e.searchNoExact === true) {
      const exact = s.results.find((x) => EXACT_TYPES.indexOf(x.matchType) !== -1);
      if (exact) fails.push(`searchNoExact but ${exact.name} is ${exact.matchType}`);
    }
  }

  // Discovery expectations (Phase 4.2.1I) — search + split/movement/equipment
  // filters composed through the SAME shared layer the picker uses. Evaluated
  // when a case declares input.filters or any discovery* expectation.
  const hasDiscovery = c.input.filters !== undefined ||
    ['discoveryTop', 'discoveryTopNot', 'discoveryIncludes', 'discoveryExcludes',
     'discoveryMinResults', 'discoveryEquip', 'discoveryEmpty'].some((k) => e[k] !== undefined);
  if (hasDiscovery) {
    const d = EF.runDiscovery({ index: idx, customs: [], query: c.input.query, filters: c.input.filters, limit: 60 });
    const list = d.rows.map((x) => x.name);
    const eqs = [...new Set(d.rows.map((x) => x.exercise && x.exercise.equipment))];
    if (e.discoveryTop !== undefined && list[0] !== e.discoveryTop) fails.push(`discoveryTop ${JSON.stringify(list[0])} != ${JSON.stringify(e.discoveryTop)}`);
    if (e.discoveryTopNot !== undefined && list[0] === e.discoveryTopNot) fails.push(`discoveryTop must NOT be ${JSON.stringify(e.discoveryTopNot)}`);
    if (e.discoveryMinResults !== undefined && list.length < e.discoveryMinResults) fails.push(`discoveryMinResults ${list.length} < ${e.discoveryMinResults}`);
    if (e.discoveryEmpty === true && list.length !== 0) fails.push(`discoveryEmpty but got ${list.length} (${list.slice(0, 3)})`);
    if (e.discoveryIncludes !== undefined) e.discoveryIncludes.forEach((n) => { if (list.indexOf(n) === -1) fails.push(`discoveryIncludes missing ${JSON.stringify(n)}`); });
    if (e.discoveryExcludes !== undefined) e.discoveryExcludes.forEach((n) => { if (list.indexOf(n) !== -1) fails.push(`discoveryExcludes present ${JSON.stringify(n)}`); });
    if (e.discoveryEquip !== undefined) {
      const extra = eqs.filter((x) => e.discoveryEquip.indexOf(x) === -1);
      if (extra.length) fails.push(`discoveryEquip has unexpected ${JSON.stringify(extra)} (want only ${JSON.stringify(e.discoveryEquip)})`);
    }
  }
  } // end resolution/search/discovery (input-bearing cases)

  // Logging identity (Phase 4.2.1J) — resolves query strings to REAL catalog
  // identity via the shared index, then runs the exact ExerciseLog comparison
  // the workout logger uses for previous-performance / progression.
  if (c.identity) {
    const a = toRef(c.identity.a), b = toRef(c.identity.b);
    const same = EL.isComparableForProgression(a, b);
    if (c.identity.sameExercise !== undefined && same !== c.identity.sameExercise) {
      fails.push(`identity same=${same} != ${c.identity.sameExercise} (a=${JSON.stringify(a.name)}#${a.exerciseId || a.customId || '·'} b=${JSON.stringify(b.name)}#${b.exerciseId || b.customId || '·'})`);
    }
  }

  // PR / stable identity keys (Phase 4.2.1K) — the shared identity model behind
  // personal_records upserts and per-session keying. `a`/`b` are refs (string or
  // literal). Asserts sameKey (identityKey equality) and/or the individual
  // key/type/conflict-target of `a`.
  if (c.prIdentity) {
    const a = toRef(c.prIdentity.a);
    if (c.prIdentity.b !== undefined) {
      const b = toRef(c.prIdentity.b);
      const same = EL.identityKey(a) === EL.identityKey(b);
      if (c.prIdentity.sameKey !== undefined && same !== c.prIdentity.sameKey) {
        fails.push(`prIdentity sameKey=${same} != ${c.prIdentity.sameKey} (aKey=${EL.identityKey(a)} bKey=${EL.identityKey(b)})`);
      }
    }
    if (c.prIdentity.type !== undefined && EL.identityType(a) !== c.prIdentity.type) {
      fails.push(`prIdentity type=${EL.identityType(a)} != ${c.prIdentity.type}`);
    }
    if (c.prIdentity.key !== undefined && EL.identityKey(a) !== c.prIdentity.key) {
      fails.push(`prIdentity key=${EL.identityKey(a)} != ${c.prIdentity.key}`);
    }
    if (c.prIdentity.conflict !== undefined && EL.prConflictTarget(a) !== c.prIdentity.conflict) {
      fails.push(`prIdentity conflict=${EL.prConflictTarget(a)} != ${c.prIdentity.conflict}`);
    }
  }

  // Chronological previous-session selection (Phase 4.2.1J).
  if (c.prevSession) {
    const out = EL.selectPreviousSessions(c.prevSession.sessions, c.prevSession.opts || {});
    const order = out.map((s) => s.workoutId);
    if (c.prevSession.expectOrder !== undefined &&
        JSON.stringify(order) !== JSON.stringify(c.prevSession.expectOrder)) {
      fails.push(`prevSession order ${JSON.stringify(order)} != ${JSON.stringify(c.prevSession.expectOrder)}`);
    }
  }

  return fails.length ? fails.join('; ') : null;
}

// Build an ExerciseLog reference from either a query string (resolved to real
// catalog identity) or a literal ref object (custom / free-typed cases).
function toRef(spec) {
  if (spec && typeof spec === 'object') {
    return {
      exerciseId: spec.exerciseId != null ? spec.exerciseId : null,
      customId: spec.customId != null ? spec.customId : null,
      name: spec.name
    };
  }
  const r = idx.resolve(spec);
  return {
    exerciseId: r.canonicalExerciseId != null ? r.canonicalExerciseId : null,
    customId: null,
    name: r.canonicalName != null ? r.canonicalName : spec
  };
}

function main() {
  const cases = loadCases();
  let pass = 0, fail = 0, knownFail = 0, resurrected = 0;
  const failures = [];

  for (const c of cases) {
    const reason = checkCase(c);
    if (!reason) {
      pass++;
      if (c.known_fail) { resurrected++; console.log(`  ↑ RESURRECTED (promote): ${c.id} — known_fail now passes`); }
    } else if (c.known_fail) {
      knownFail++;
    } else {
      fail++;
      failures.push(`  ✗ ${c.id}: ${reason}`);
    }
  }

  console.log('\nExercise-resolution benchmark');
  console.log(`  cases:       ${cases.length}`);
  console.log(`  pass:        ${pass}`);
  console.log(`  fail:        ${fail}`);
  console.log(`  known_fail:  ${knownFail}`);
  const scored = cases.length - knownFail;
  console.log(`  score:       ${scored ? ((pass / scored) * 100).toFixed(1) : '100.0'}%  (${pass}/${scored} scored)`);
  if (failures.length) { console.log('\nUnexpected failures:'); failures.forEach((f) => console.log(f)); }

  if (strict && (fail > 0 || resurrected > 0)) process.exit(1);
}

main();
