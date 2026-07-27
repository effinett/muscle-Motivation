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
//   { id, input: { query },
//     expect: { name?, matchType?, matchTypeIn?[], notMatchType?, confidence?,
//               family?, notName?, unresolved?, unresolvedId? },
//     known_fail?, tags?[] }

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const EX = require('../exercise-core.js');
const { EXERCISE_CATALOG } = require('./exercise-fixtures.js');

const strict = process.argv.includes('--strict');
const idx = EX.createExerciseIndex(EXERCISE_CATALOG);

function loadCases() {
  const file = path.join(__dirname, 'exercise-cases.jsonl');
  return fs.readFileSync(file, 'utf8').split('\n')
    .map((l) => l.trim()).filter(Boolean)
    .map((l, i) => { try { return JSON.parse(l); } catch (e) { throw new Error(`bad JSONL at line ${i + 1}: ${e.message}`); } });
}

// Returns null on pass, or a reason string on failure.
function checkCase(c) {
  const r = idx.resolve(c.input.query);
  const e = c.expect || {};
  const fails = [];
  if (e.name !== undefined && r.canonicalName !== e.name) fails.push(`name ${JSON.stringify(r.canonicalName)} != ${JSON.stringify(e.name)}`);
  if (e.notName !== undefined && r.canonicalName === e.notName) fails.push(`name must NOT be ${JSON.stringify(e.notName)}`);
  if (e.matchType !== undefined && r.matchType !== e.matchType) fails.push(`matchType ${r.matchType} != ${e.matchType}`);
  if (e.matchTypeIn !== undefined && e.matchTypeIn.indexOf(r.matchType) === -1) fails.push(`matchType ${r.matchType} not in [${e.matchTypeIn}]`);
  if (e.notMatchType !== undefined && r.matchType === e.notMatchType) fails.push(`matchType must NOT be ${e.notMatchType}`);
  if (e.confidence !== undefined && r.confidence !== e.confidence) fails.push(`confidence ${r.confidence} != ${e.confidence}`);
  if (e.family !== undefined && r.exerciseFamily !== e.family) fails.push(`family ${r.exerciseFamily} != ${e.family}`);
  if (e.unresolved === true && r.matchType !== 'unresolved') fails.push(`expected unresolved, got ${r.matchType}`);
  if (e.unresolvedId === true && r.canonicalExerciseId !== null) fails.push(`expected no single id, got ${r.canonicalName}`);
  return fails.length ? fails.join('; ') : null;
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
