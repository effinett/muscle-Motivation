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

/* ── Publish (migration 20261117204221) ───────────────────────────────────
 * Applied 2026-11-17 after the locked page gained its membership route (#119).
 * The stored text matched the dry-run-reviewed file (md5 e3c94550…). */
const PUB_FILE = 'supabase/migrations/20261117204221_phase_439l_publish_home_strength.sql';
const pub = fs.readFileSync(path.join(__dirname, PUB_FILE), 'utf8');
const pubCode = pub.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');

test('publish: the repository records the exact applied migration', () => {
  assert.equal(crypto.createHash('md5').update(pub).digest('hex'), 'e3c945508af286681a062e2eb54523d3');
  assert.equal(crypto.createHash('sha256').update(pub).digest('hex'),
    'ee0e5403c44586500c329d104487dfd33c916991d803b1804b2b6d7ae4bed080');
  assert.ok(!pub.includes('DRY RUN'));
  assert.ok(pub.includes("RAISE NOTICE 'phase_439l_publish_home_strength: state=%', v_state;"));
});

test('publish: exactly two writes, status and visibility only, on the named Home Strength rows', () => {
  const updates = pubCode.match(/UPDATE public\.\w+ SET [^\n]+\n[^\n]+/g) || [];
  assert.deepEqual(updates, [
    "UPDATE public.workout_templates SET visibility = 'published'\n     WHERE id IN (k_ra, k_rb, k_rc, k_rcc) AND visibility = 'private';",
    "UPDATE public.programs SET status = 'published'\n     WHERE id = k_prog AND status = 'draft';",
  ]);
  assert.doesNotMatch(pubCode, /\bINSERT INTO public\.|\bDELETE\s+FROM\b|\bTRUNCATE\b|\bALTER\s+TABLE\b/i);
  assert.doesNotMatch(pubCode, /\bpurchases\b|user_programs|entitlement|stripe|\bprice/i);
  // Access is pinned unchanged: membership-included, not standalone-purchasable.
  assert.match(pubCode, /'muscle', 'Beginner – Intermediate', 8, 3, 'Home Setup',\s+true, false, 5, 'program\.html\?slug=home_strength'\);/);
  // Same ids as the draft migration, so nothing else can be reached.
  ['ed50e0e1-5280-4680-a730-2a6be2a46f0b', '7ce33308-275a-49f8-bf69-fa97866bf0ac',
   '0db8dde9-4182-49e1-af9b-4f105e39f0f6', '5b40fa88-7a44-44ab-85c1-3292ba654011',
   '33b5ff59-1f1a-4093-bcf0-f4360219563d'].forEach((id) => {
    assert.ok(pub.includes(id) && sql.includes(id), id);
  });
});

test('publish: the README documents it', () => {
  assert.match(readme, /`20261117204221` \(`phase_439l_publish_home_strength`/);
  assert.match(readme, /creates no price, purchase, entitlement or enrolment/);
});
