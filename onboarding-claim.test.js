/* ──────────────────────────────────────────────────────────────────────────
 * Phase 4.3.7B2 — the claim step
 *
 * Where an anonymous draft becomes real profile data. The ordering here is the
 * safety property: fields before flag, confirmation before discard. Every
 * assertion below exists because the opposite ordering loses user data or
 * marks a plan complete that was never saved.
 * ──────────────────────────────────────────────────────────────────────── */

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const D = require('./onboarding-draft.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const readCode = (f) => read(f)
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const OB = read('onboarding.html');
const OB_CODE = readCode('onboarding.html');
const AUTH = read('auth.html');
const AUTH_CODE = readCode('auth.html');

const CLAIM = OB_CODE.slice(OB_CODE.indexOf('async function claimDraft'),
  OB_CODE.indexOf('function goCreateAccount'));

/* ══ the ordered sequence ════════════════════════════════════════════════ */

test('the claim exists and is ordered: fields → flag → confirm → clear', () => {
  assert.ok(CLAIM.length > 0, 'claimDraft not found');

  const fieldWrite = CLAIM.indexOf('upsertProfile(currentUser.id, patch)');
  const flagWrite  = CLAIM.indexOf('onboarding_complete: true');
  const confirm    = CLAIM.indexOf('getProfile(currentUser.id)');
  const clear      = CLAIM.indexOf('clearDraft()');

  assert.ok(fieldWrite > 0, 'field write missing');
  assert.ok(flagWrite > fieldWrite, 'the flag must be written AFTER the fields');
  assert.ok(confirm > flagWrite, 'the flag must be read back AFTER it is written');
  assert.ok(clear > confirm, 'the draft must be cleared LAST');
});

test('every step fails stop — no step proceeds past an error', () => {
  // Three guarded writes/reads, each returning false rather than continuing.
  assert.match(CLAIM, /if \(!fields\.ok\)[\s\S]{0,120}?return false;/);
  assert.match(CLAIM, /if \(!flag\.ok\)[\s\S]{0,120}?return false;/);
  assert.match(CLAIM, /confirmed\.onboarding_complete !== true[\s\S]{0,120}?return false;/);
});

test('a failed claim never marks onboarding complete', () => {
  // The flag write is the only place the flag is set, and it is preceded by a
  // fail-stop on the field write.
  const flagWrites = OB_CODE.match(/onboarding_complete: true/g) || [];
  // One in computePlan's generated object (dropped by the merge), one here.
  assert.ok(flagWrites.length <= 2, 'unexpected extra completion write');
  const beforeFlag = CLAIM.slice(0, CLAIM.indexOf('onboarding_complete: true'));
  assert.match(beforeFlag, /return false;/, 'no fail-stop before the flag write');
});

test('the completion flag is never smuggled in with the field patch', () => {
  // computePlan() produces onboarding_complete: true; the merge must drop it.
  assert.strictEqual(D.isClaimable('onboarding_complete'), false);
  const patch = D.mergeIntoProfile(
    { id: 'u', onboarding_complete: false },
    { goal: 'fatloss', onboarding_complete: true });
  assert.ok(!('onboarding_complete' in patch));
  assert.strictEqual(patch.goal, 'fatloss');
});

test('an empty patch aborts rather than marking complete', () => {
  // Otherwise a refused merge would still flip the flag, marking a plan
  // complete that was never written.
  assert.match(CLAIM, /if \(!Object\.keys\(patch\)\.length\)[\s\S]{0,200}?return false;/);
});

/* ══ the plan is recomputed, never read from the draft ═══════════════════ */

test('the claim recomputes the plan with this page\'s own calculator', () => {
  assert.match(CLAIM, /computePlan\(\)/,
    'the claim must recompute, not read derived values from the draft');
  // And it must not pull targets out of the draft.
  assert.ok(!/draft\.answers\.(target_calories|protein_target|maintenance_calories)/.test(CLAIM));
});

test('computePlan is the single shared implementation', () => {
  assert.strictEqual((OB_CODE.match(/function computePlan\(/g) || []).length, 1);
  // Both the wizard and the claim call it — no second derivation path.
  const callers = (OB_CODE.match(/computePlan\(\)/g) || []).length;
  assert.ok(callers >= 2, 'computePlan must serve both the wizard and the claim');
});

test('the extraction preserved the calculator verbatim', () => {
  // Same pin as B1: the move must not have altered a single expression.
  [
    'return 370 + (21.6 * lean);',
    'var base = (10 * weightKg) + (6.25 * heightCm) - (5 * age);',
    "return gender === 'male' ? base + 5 : base - 161;",
    'var trainingAdd = trainingDays * 0.75 * 6 * (bmr / 24);',
    "var proteinPerLb = goal === 'recomp' ? 1.0 : goal === 'fatloss' ? 0.9 : 0.95;",
    'var carbG    = Math.round(Math.max(0, targetCals - (proteinG * 4) - fatCals) / 4);',
    "var minCals = gender === 'female' ? 1350 : 1600;",
    'targetCals = Math.max(minCals, tdee - 500);',
    'targetCals = tdee + 250;',
  ].forEach((expr) => assert.ok(OB.includes(expr), 'calculator changed: ' + expr));
});

/* ══ existing-user protection, both gates ═══════════════════════════════ */

test('gate 1 — the resolver never routes a completed user into a claim', () => {
  assert.strictEqual(
    D.resolveOnboardingState({ hasSession: true, onboardingComplete: true, hasDraft: true }),
    D.STATE.DISCARD_EXIT);
});

test('gate 2 — the merge refuses a completed profile even if called directly', () => {
  const patch = D.mergeIntoProfile(
    { id: 'u', onboarding_complete: true, goal: 'muscle', target_calories: 3000 },
    { goal: 'fatloss', target_calories: 1800, weight_lbs: 150 });
  assert.deepStrictEqual(patch, {});
});

test('the claim is only attempted for a genuinely complete draft', () => {
  // A partial draft must fall through to the wizard rather than have a
  // half-plan written on the user's behalf.
  assert.match(OB_CODE,
    /STATE\.CLAIM && OnboardingDraft\.isComplete\(draft\)/);
});

test('a failed claim leaves the user recoverable, not stranded', () => {
  const branch = OB_CODE.slice(OB_CODE.indexOf('STATE.CLAIM &&'),
    OB_CODE.indexOf('applyModeCopy();'));
  // No redirect away on failure; the wizard renders with answers restored.
  assert.match(branch, /if \(claimed\)/);
  assert.ok(!/if \(!claimed\)[\s\S]{0,120}?location\./.test(branch),
    'a failed claim must not redirect the user away');
  assert.match(branch, /showSaveMessage\(/, 'the failure must be surfaced');
});

/* ══ auth.html — the stale-draft discard ════════════════════════════════ */

test('auth loads the draft module', () => {
  assert.match(AUTH, /<script src="onboarding-draft\.js"><\/script>/);
  assert.ok(AUTH.indexOf('src="supabase.js"') < AUTH.indexOf('src="onboarding-draft.js"'));
});

test('auth discards a stale draft ONLY on the completed branch', () => {
  const route = AUTH_CODE.slice(AUTH_CODE.indexOf('function routeAfterAuth'),
    AUTH_CODE.indexOf('window.addEventListener'));
  assert.ok(route.length > 0, 'routeAfterAuth not found');
  // Completed → discard then dashboard.
  assert.match(route, /onboarding_complete\)[\s\S]{0,140}?discardStaleDraft\(\)[\s\S]{0,80}?'app\.html'/);
  // Incomplete → onboarding, with the draft INTACT (it is needed to claim).
  const incomplete = route.slice(route.indexOf("'app.html'"));
  assert.ok(!/discardStaleDraft/.test(incomplete),
    'an incomplete user must keep their draft — it is what gets claimed');
});

test('both auth routing paths go through the one helper', () => {
  // Call sites only — exclude the declaration itself.
  const calls = (AUTH_CODE.match(/(?<!function )routeAfterAuth\(profile\)/g) || []).length;
  assert.strictEqual(calls, 2, 'the load check and the email login both route via the helper');
  // No surviving inline ternary that would bypass the discard.
  assert.ok(!/onboarding_complete\) \? 'app\.html' : 'onboarding\.html'/.test(AUTH_CODE));
});

test('the discard never blocks a redirect', () => {
  assert.match(AUTH_CODE, /function discardStaleDraft\(\)[\s\S]{0,220}?catch \(e\)/);
});

test('signup still routes to onboarding with the draft intact', () => {
  // The claim depends on arriving at onboarding.html holding the draft.
  assert.match(AUTH_CODE, /data\.session[\s\S]{0,160}?'onboarding\.html'/);
  const signup = AUTH_CODE.slice(AUTH_CODE.indexOf('async function handleSignup'));
  assert.ok(!/clearDraft|discardStaleDraft/.test(signup),
    'signup must never discard the draft it is about to claim');
});

test('Google OAuth still returns to onboarding', () => {
  assert.match(AUTH_CODE, /redirectTo: window\.location\.origin \+ '\/onboarding\.html'/);
});

test('auth mechanics are otherwise unchanged', () => {
  // Confirmation stays OFF — the claim depends on signUp returning a session.
  assert.match(AUTH_CODE, /signUp\(\{/);
  assert.match(AUTH_CODE, /signInWithPassword\(/);
  assert.match(AUTH_CODE, /isPasswordPwned\(/);
  assert.match(AUTH_CODE, /passwordPolicyError\(/);
});

/* ══ nothing else regressed ═════════════════════════════════════════════ */

test('the claim writes only through the shared upsert helper', () => {
  assert.ok(!/\.from\('profiles'\)[\s\S]{0,80}?\.(update|insert)\(/.test(CLAIM),
    'the claim must not hand-roll a write');
  assert.strictEqual((CLAIM.match(/upsertProfile\(/g) || []).length, 2);
});

test('no service role or privileged key appears in either page', () => {
  [OB, AUTH].forEach((src) => {
    assert.ok(!/service_role|SUPABASE_SERVICE|secret/i.test(src));
  });
});

test('protected pages still require a session', () => {
  ['app.html', 'profile.html', 'workout.html', 'nutrition.html', 'weight-history.html',
  ].forEach((p) => assert.match(read(p), /await requireAuth\(\)/, p));
});
