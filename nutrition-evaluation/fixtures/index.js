// Phase 4.2.9 — fixture aggregation. Loads every category file and concatenates
// into one suite. The case-set version bumps whenever cases are added/changed so
// the baseline records which corpus produced it.

'use strict';

const CASE_SET_VERSION = '4.2.9-1';

const files = [
  'parsing', 'retrieval', 'ranking', 'confidence', 'clarification',
  'portions', 'meals', 'corrections', 'display', 'regressions',
];

function load() {
  const all = [];
  for (const f of files) {
    const cases = require('./' + f + '.js');
    if (!Array.isArray(cases)) throw new Error(`fixtures/${f}.js must export an array`);
    for (const c of cases) all.push(c);
  }
  return all;
}

module.exports = { load, CASE_SET_VERSION, files };
