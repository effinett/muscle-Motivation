/* Phase 4.3.9-L — Bodyweight Fat Loss hidden draft (migration 20261119070922).
 * The repository must hold EXACTLY the text applied in production (md5 matched
 * supabase_migrations.schema_migrations on 2026-11-19; the SQL reviewed in PR #128
 * at a74ae30e, without its trailing newline), and that text must keep the Program
 * hidden: nothing published, nothing priced, no access granted. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FILE = 'supabase/migrations/20261119070922_phase_439l_bodyweight_fat_loss_draft.sql';
const sql = fs.readFileSync(path.join(__dirname, FILE), 'utf8');
const code = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
const readme = fs.readFileSync(path.join(__dirname, 'supabase', 'README.md'), 'utf8');
const filters = fs.readFileSync(path.join(__dirname, 'exercise-filters.js'), 'utf8');

test('the repository records the exact applied migration', () => {
  assert.equal(crypto.createHash('md5').update(sql).digest('hex'), '111a3594b8a7a856e7c37a6edef3f51b');
  assert.equal(crypto.createHash('sha256').update(sql).digest('hex'),
    '58ab5798a75e4026ae59b180b5071e83d536d86500212f0faf8694ebded160f0');
  assert.ok(!sql.includes('DRY RUN'));
  assert.ok(sql.includes("RAISE NOTICE 'phase_439l_bodyweight_fat_loss_draft: state=%', v_state;"));
});

test('it only inserts a hidden draft: no publish, price, access or enrolment', () => {
  assert.match(sql, /'fatloss', 'Beginner – Intermediate', 8, 4, 'Bodyweight',\s+true, false, 'draft', 9, 'program\.html\?slug=bodyweight_fat_loss'\)/);
  assert.equal((sql.match(/'private', NULL\)/g) || []).length, 4);
  assert.doesNotMatch(code, /\bUPDATE\s+public\.|\bDELETE\s+FROM\b|\bTRUNCATE\b|\bALTER\s+TABLE\b|\bDROP\s+(TABLE|POLICY|FUNCTION)\b/i);
  // 'published' appears only in the guards that count published Programs (7 before and after).
  assert.equal((code.match(/'published'/g) || []).length, 2);
  assert.equal((code.match(/WHERE status = 'published'\) <> 7/g) || []).length, 2);
  assert.doesNotMatch(code, /\bpurchases\b|user_programs|entitlement|stripe|\bprice/i);
  const inserts = (code.match(/INSERT INTO public\.(\w+)/g) || []).sort();
  assert.deepEqual(inserts, ['INSERT INTO public.program_routines', 'INSERT INTO public.programs',
    'INSERT INTO public.workout_templates']);
});

test('its content follows the approved Program Catalog Plan and owner revisions', () => {
  assert.match(sql, /'A no-equipment, four-day fat-loss plan with two full-body strength days '\n\s+'and two conditioning circuits\.'/);
  // Decision 1a: Mountain Climber, not a lunge, in Conditioning B.
  assert.match(sql, /\(k_rcb, v_owner, 'Conditioning B',\n\s+'\[\{"name":"Step Jack"[^\n]*"name":"Mountain Climber","sets":3,"reps_low":20,"reps_high":40/);
  assert.doesNotMatch(code, /Forward Lunge/);
  // The existing Bodyweight Foundations Swap guidance, word for word.
  assert.ok(sql.includes('"name":"Push-Up","sets":3,"reps_low":6,"reps_high":12,"notes":"Too hard? Use Swap before logging sets: Knee Push-Up, or Wall Push-Up if that is too hard. Swap applies to this workout only."'));
  assert.ok(sql.includes('"name":"Knee Push-Up","sets":3,"reps_low":8,"reps_high":12,"notes":"Too hard? Use Swap before logging sets: Wall Push-Up. Ready for more: Push-Up. Swap applies to this workout only."'));
});

test('every prescribed exercise is in the equipment-free pool the app uses', () => {
  const ids = [...new Set((sql.match(/"exercise_id":"([0-9a-f-]{36})"/g) || [])
    .map((m) => m.slice(15, 51)))];
  assert.equal(ids.length, 20);
  ids.forEach((id) => assert.ok(filters.includes("'" + id + "'"), id));
  assert.match(filters, /EQUIPMENT_FREE_PROGRAMS = \{[^}]*bodyweight_fat_loss: true/);
});

test('its session keys are the ones schedules.js uses for this Program', () => {
  const sched = fs.readFileSync(path.join(__dirname, 'schedules.js'), 'utf8');
  ['full_a', 'conditioning_a', 'full_b', 'conditioning_b'].forEach((k) => {
    assert.match(sql, new RegExp("'" + k + "',\\s+\\d, NULL\\)"), k);
    assert.ok(sched.includes(k), k);
  });
});

test('the README documents it', () => {
  assert.match(readme, /`20261119070922` \(`phase_439l_bodyweight_fat_loss_draft`/);
  assert.match(readme, /It inserts only; it publishes nothing, modifies no existing row,\nand creates no price/);
});
