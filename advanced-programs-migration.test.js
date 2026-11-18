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

/* ── Publish Advanced Muscle (migration 20261118044157) ───────────────────
 * Applied 2026-11-18 after Codex review on #123. The stored text matched the
 * dry-run-reviewed file (md5 fb6e8882…). Advanced Fat Loss and Advanced Home
 * Strength stay hidden drafts. */
const PUB_FILE = 'supabase/migrations/20261118044157_phase_439l_publish_advanced_muscle.sql';
const pub = fs.readFileSync(path.join(__dirname, PUB_FILE), 'utf8');
const pubCode = pub.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
const AM_IDS = ['13c8ee8a-dc10-5858-afa5-cf2402300268', 'f70d7306-dbca-5b80-adaa-161d7d2c57e8',
  '19c09b00-2482-554f-aa08-1a9c1c2f626a', '1e854b64-3232-551e-a467-db886b141915',
  'e40f5cb9-d978-55e8-aad5-acac4e14ca01'];

test('publish AM: the repository records the exact applied migration', () => {
  assert.equal(crypto.createHash('md5').update(pub).digest('hex'), 'fb6e8882c9efdeacecf5228aaa80eed8');
  assert.equal(crypto.createHash('sha256').update(pub).digest('hex'),
    'a94945f02f1582cab733e4bf3361faf3b061e71d56b7749044f57a06134d5f24');
  assert.ok(!pub.includes('DRY RUN'));
  assert.ok(pub.includes("RAISE NOTICE 'phase_439l_publish_advanced_muscle: state=%', v_state;"));
});

test('publish AM: exactly two writes, Routines before Program, on the named rows only', () => {
  const updates = pubCode.match(/UPDATE public\.\w+ SET [^\n]+\n[^\n]+/g) || [];
  assert.deepEqual(updates, [
    "UPDATE public.workout_templates SET visibility = 'published'\n     WHERE id IN (k_r1, k_r2, k_r3, k_r4) AND visibility = 'private';",
    "UPDATE public.programs SET status = 'published'\n     WHERE id = k_prog AND status = 'draft';",
  ]);
  assert.doesNotMatch(pubCode, /\bINSERT INTO public\.|\bDELETE\s+FROM\b|\bTRUNCATE\b|\bALTER\s+TABLE\b/i);
  assert.doesNotMatch(pubCode, /stripe|entitlement|\bprice/i);
  // purchases, user_programs and profiles are only locked and fingerprinted, never written.
  assert.doesNotMatch(pubCode, /(UPDATE|INSERT INTO)\s+public\.(purchases|user_programs|profiles)\b/i);
  ['purchases', 'user_programs', 'profiles'].forEach((t) => {
    assert.match(pubCode, new RegExp('LOCK TABLE public\\.' + t + '\\s+IN SHARE MODE;'));
    assert.match(pubCode, new RegExp('FROM public\\.' + t + ' x\\) <> b_'));
  });
  // Access pinned unchanged: membership-included, not standalone-purchasable.
  assert.match(pubCode, /'muscle', 'Intermediate – Advanced', 12, 4, 'Full Gym',\s+true, false, 6, 'program\.html\?slug=advanced_muscle'\);/);
  // Same ids as the draft migration; none of the other two Advanced Programs' ids.
  AM_IDS.forEach((id) => assert.ok(pub.includes(id) && sql.includes(id), id));
  ['4299697c-b0f2-5cd2-a4a0-2d28ba2e8022', '2ab5945b-5436-5024-ad96-8bed32c2c572'].forEach((id) => {
    assert.ok(!pub.includes(id), id);
  });
  assert.match(pubCode, /slug IN \('advanced_fat_loss', 'advanced_home_strength'\) AND status = 'draft'\) <> 2/);
});

test('publish AM: the README documents it', () => {
  assert.match(readme, /`20261118044157` \(`phase_439l_publish_advanced_muscle`/);
  assert.match(readme, /Advanced Fat Loss and Advanced Home Strength stay drafts/);
});
