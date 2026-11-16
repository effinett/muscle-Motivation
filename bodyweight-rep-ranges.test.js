/* Bodyweight Foundations rep ranges (migration 20261116183238, owner-approved 2026-11-16).
 *
 * The owner decided no bodyweight slot may be a fixed target: the top of each
 * range is where progression offers the next step, so every slot needs room to
 * build. These tests lock the migration to exactly the nine approved changes and
 * prove nothing else in the five Routines moved. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const FILE = 'supabase/migrations/20261116183238_phase_439b_bodyweight_rep_ranges.sql';
const SQL = fs.readFileSync(path.join(__dirname, FILE), 'utf8');
const CP4C = fs.readFileSync(path.join(__dirname,
  'supabase/migrations/20261002173108_phase_439b_cp4c_bodyweight_guidance_pike_lean.sql'), 'utf8');

function literal(sql, tag) {
  const m = sql.match(new RegExp('\\$' + tag + '\\$([\\s\\S]*?)\\$' + tag + '\\$'));
  assert.ok(m, 'literal ' + tag + ' not found');
  return JSON.parse(m[1]);
}

const ROUTINES = ['fb_b', 'fb_c', 'lower_b', 'push_core_a', 'push_core_b'];

// [routine, index, name, old low, old high, new low, new high]
const APPROVED = [
  ['fb_b', 2, 'Superman', 10, 12, 10, 15],
  ['fb_b', 3, 'Dead Bug', 10, 10, 8, 12],
  ['fb_b', 4, 'Bird Dog', 8, 10, 8, 12],
  ['fb_c', 3, 'Superman', 10, 12, 10, 15],
  ['fb_c', 4, 'Mountain Climber', 30, 30, 20, 40],
  ['lower_b', 2, 'Lateral Lunge', 6, 8, 8, 12],
  ['lower_b', 3, 'Superman', 10, 12, 10, 15],
  ['push_core_a', 2, 'Dead Bug', 8, 10, 8, 12],
  ['push_core_b', 4, 'Bird Dog', 6, 8, 8, 12],
];

test('rep ranges: only the nine approved ranges change, nothing else in the five Routines', () => {
  for (const k of ROUTINES) {
    const oldA = literal(SQL, k + '_old');
    const newA = literal(SQL, k + '_new');
    assert.equal(newA.length, oldA.length, k + ' keeps its entry count');
    const edits = APPROVED.filter((a) => a[0] === k);
    oldA.forEach((o, i) => {
      const n = newA[i];
      const e = edits.find((a) => a[1] === i);
      const strip = (x) => { const c = Object.assign({}, x); delete c.reps_low; delete c.reps_high; return c; };
      assert.deepStrictEqual(strip(n), strip(o), k + '[' + i + '] changes nothing but the range');
      if (e) {
        assert.equal(o.name, e[2]);
        assert.deepStrictEqual([o.reps_low, o.reps_high], [e[3], e[4]], k + '[' + i + '] old range');
        assert.deepStrictEqual([n.reps_low, n.reps_high], [e[5], e[6]], k + '[' + i + '] new range');
      } else {
        assert.deepStrictEqual([n.reps_low, n.reps_high], [o.reps_low, o.reps_high], k + '[' + i + '] untouched');
      }
    });
  }
  assert.equal(APPROVED.length, 9);
});

test('rep ranges: no slot in the five Routines is a fixed or inverted target any more', () => {
  for (const k of ROUTINES) {
    literal(SQL, k + '_new').forEach((x) =>
      assert.ok(x.reps_low < x.reps_high, k + ' ' + x.name + ' ' + x.reps_low + '-' + x.reps_high));
  }
});

test('rep ranges: Full Body B starts from exactly the content CP4c left', () => {
  assert.deepStrictEqual(literal(SQL, 'fb_b_old'), literal(CP4C, 'b_new'));
});

test('rep ranges: the migration only updates — no INSERT, DELETE or DDL — and guards every state', () => {
  const body = SQL.replace(/--[^\n]*/g, '');
  assert.ok(!/\bINSERT\s+INTO\b/i.test(body));
  assert.ok(!/\bDELETE\s+FROM\b/i.test(body));
  assert.ok(!/\b(CREATE|ALTER|DROP)\s+(TABLE|INDEX|POLICY|FUNCTION|TRIGGER)\b/i.test(body));
  assert.equal((body.match(/UPDATE public\.workout_templates SET exercises/g) || []).length, 5);
  assert.match(body, /DIVERGED/);
  assert.match(body, /fixed or inverted ranges remain/);
});
