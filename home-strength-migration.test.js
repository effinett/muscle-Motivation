/* Phase 4.3.9-L — Home Strength hidden draft (migration 20261117192044).
 * The repository must hold EXACTLY the text applied in production (md5 matched
 * supabase_migrations.schema_migrations on 2026-11-17), and that text must keep
 * the draft hidden: nothing published, nothing priced, no access granted. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FILE = 'supabase/migrations/20261117192044_phase_439l_home_strength_draft.sql';
const sql = fs.readFileSync(path.join(__dirname, FILE), 'utf8');
const readme = fs.readFileSync(path.join(__dirname, 'supabase', 'README.md'), 'utf8');

test('the repository records the exact applied migration', () => {
  assert.equal(crypto.createHash('md5').update(sql).digest('hex'), '4f63de2e9a5f8866331262f50fd858ea');
  assert.equal(crypto.createHash('sha256').update(sql).digest('hex'),
    '275ef4dbd2e2bad60573a4f6e0037440b52d439372bf2c40c63031eb3592d9a6');
  // The dry-run variant (forced rollback) is never the recorded text.
  assert.ok(!sql.includes('DRY RUN'));
  assert.ok(sql.includes("RAISE NOTICE 'phase_439l_home_strength_draft: state=%', v_state;"));
});

test('it only inserts a hidden draft: no publish, price, access or enrolment', () => {
  assert.match(sql, /true, false, 'draft', 5, 'program\.html\?slug=home_strength'\);/);
  assert.equal((sql.match(/'private', NULL\)/g) || []).length, 4);
  const code = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  assert.doesNotMatch(code, /\bUPDATE\s+public\.|\bDELETE\s+FROM\b|\bTRUNCATE\b|\bALTER\s+TABLE\b|\bDROP\s+(TABLE|POLICY|FUNCTION)\b/i);
  // 'published' appears once in the code: the guard that counts published Programs.
  assert.equal((code.match(/'published'/g) || []).length, 1);
  assert.match(code, /WHERE status = 'published'\) <> 4/);
  assert.doesNotMatch(code, /\bpurchases\b|user_programs|entitlement|stripe|\bprice/i);
  const inserts = sql.match(/INSERT INTO public\.(\w+)/g) || [];
  assert.deepEqual(inserts.sort(), ['INSERT INTO public.program_routines', 'INSERT INTO public.programs',
    'INSERT INTO public.workout_templates']);
});

test('its session keys are the ones schedules.js uses for Home Strength', () => {
  const sched = fs.readFileSync(path.join(__dirname, 'schedules.js'), 'utf8');
  ['full_a', 'full_b', 'full_c', 'conditioning_core'].forEach((k) => {
    assert.match(sql, new RegExp("'" + k + "',\\s+\\d, NULL\\)"));
    assert.ok(sched.includes(k), k);
  });
});

test('the README documents it', () => {
  assert.match(readme, /`20261117192044` \(`phase_439l_home_strength_draft`/);
  assert.match(readme, /publishes nothing, modifies no existing row/);
});
