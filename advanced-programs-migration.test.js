/* Phase 4.3.9-L — Advanced Muscle, Advanced Fat Loss and Advanced Home Strength
 * hidden drafts (migration 20261118005437). The repository must hold EXACTLY the
 * text applied in production (md5 matched supabase_migrations.schema_migrations on
 * 2026-11-17, and the SQL reviewed in PR #121), and that text must keep all three
 * Programs hidden: nothing published, nothing priced, no access granted. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FILE = 'supabase/migrations/20261118005437_phase_439l_advanced_drafts.sql';
const sql = fs.readFileSync(path.join(__dirname, FILE), 'utf8');
const code = sql.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
const readme = fs.readFileSync(path.join(__dirname, 'supabase', 'README.md'), 'utf8');

test('the repository records the exact applied migration', () => {
  assert.equal(crypto.createHash('md5').update(sql).digest('hex'), '82873e264f30e3215e8b5cdac7e5b931');
  assert.equal(crypto.createHash('sha256').update(sql).digest('hex'),
    '638e14feec60efc17fd1fbeb586c97e3ece8863e288de5e9779c32f61b1cc6a6');
  assert.ok(!sql.includes('DRY RUN'));
  assert.ok(sql.includes("RAISE NOTICE 'phase_439l_advanced_drafts: state=%', v_state;"));
});

test('it only inserts hidden drafts: no publish, price, access or enrolment', () => {
  // Three draft Programs, membership-included, not standalone-purchasable.
  assert.match(sql, /'muscle', 'Intermediate – Advanced', 12, 4, 'Full Gym',\s+true, false, 'draft', 6, 'program\.html\?slug=advanced_muscle'\)/);
  assert.match(sql, /'fatloss', 'Intermediate – Advanced', 12, 4, 'Full Gym',\s+true, false, 'draft', 7, 'program\.html\?slug=advanced_fat_loss'\)/);
  assert.match(sql, /'muscle', 'Intermediate – Advanced', 10, 4, 'Home Setup',\s+true, false, 'draft', 8, 'program\.html\?slug=advanced_home_strength'\)/);
  assert.equal((sql.match(/'private', NULL\)/g) || []).length, 12);
  assert.doesNotMatch(code, /\bUPDATE\s+public\.|\bDELETE\s+FROM\b|\bTRUNCATE\b|\bALTER\s+TABLE\b|\bDROP\s+(TABLE|POLICY|FUNCTION)\b/i);
  // 'published' appears only in the guards that count published Programs (5 before and after).
  assert.equal((code.match(/'published'/g) || []).length, 2);
  assert.equal((code.match(/WHERE status = 'published'\) <> 5/g) || []).length, 2);
  assert.doesNotMatch(code, /\bpurchases\b|user_programs|entitlement|stripe|\bprice/i);
  const inserts = (code.match(/INSERT INTO public\.(\w+)/g) || []).sort();
  assert.deepEqual(inserts, ['INSERT INTO public.program_routines', 'INSERT INTO public.programs',
    'INSERT INTO public.workout_templates']);
});

test('its content follows the approved Program Catalog Plan revisions', () => {
  // Advanced Fat Loss: Routine names Lower and Upper; Jumping Jack in Conditioning & Core;
  // the incline walk is an unlogged note, never a logged block.
  assert.match(sql, /\(k_af_r1, v_owner, 'Lower',/);
  assert.match(sql, /\(k_af_r2, v_owner, 'Upper',/);
  assert.match(sql, /"name":"Jumping Jack","sets":4,"reps_low":30,"reps_high":45/);
  assert.match(sql, /"notes":"Then finish with a 20-30 minute incline walk\. Not logged\."/);
  assert.doesNotMatch(sql, /Treadmill|Incline Walk"/i);
  // Advanced Home Strength: Band Chest Press in Upper A.
  assert.match(sql, /"name":"Band Chest Press","sets":3,"reps_low":10,"reps_high":15/);
});

test('its session keys are the ones schedules.js uses for these Programs', () => {
  const sched = fs.readFileSync(path.join(__dirname, 'schedules.js'), 'utf8');
  ['upper_a', 'lower_a', 'upper_b', 'lower_b', 'lower', 'upper', 'full_body', 'conditioning_core'].forEach((k) => {
    assert.match(sql, new RegExp("'" + k + "', \\d, NULL\\)"), k);
    assert.ok(sched.includes(k), k);
  });
});

test('the README documents it', () => {
  assert.match(readme, /`20261118005437` \(`phase_439l_advanced_drafts`/);
  assert.match(readme, /It inserts only; it\npublishes nothing, modifies no existing row/);
});
