/* ──────────────────────────────────────────────────────────────────────────
 * Phase 4.3.7B1 — anonymous onboarding wiring
 *
 * The pure rules live in onboarding-draft.test.js. This file pins the WIRING
 * and the boundaries B1 promised: onboarding is the ONLY page that stopped
 * requiring a session, the draft is written only while anonymous, the
 * anonymous path never writes to a profile, the completed-user discard is
 * present at the page level, and the calculator math is untouched.
 * ──────────────────────────────────────────────────────────────────────── */

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const readCode = (f) => read(f)
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const OB = read('onboarding.html');
const OB_CODE = readCode('onboarding.html');

/* ══ load order ══════════════════════════════════════════════════════════ */

test('onboarding loads the draft module after its dependencies', () => {
  const draft = OB.indexOf('src="onboarding-draft.js"');
  assert.ok(draft > 0, 'onboarding.html must load onboarding-draft.js');
  assert.ok(OB.indexOf('src="supabase.js"') < draft);
  assert.ok(OB.indexOf('src="program-catalog.js"') < draft);
  assert.ok(OB.indexOf('src="personalization-core.js"') < draft);
});

/* ══ the auth-gate change is scoped to exactly one page ══════════════════ */

test('onboarding no longer calls requireAuth', () => {
  // It is the one page where "no session" is a supported state rather than an
  // error, because an anonymous visitor is allowed to complete the wizard.
  assert.ok(!/requireAuth\s*\(/.test(OB_CODE),
    'onboarding.html must resolve state explicitly, not gate on requireAuth');
  assert.ok(/await getSession\(\)/.test(OB_CODE),
    'onboarding.html must read the session without redirecting');
});

test('EVERY other protected page still requires a session', () => {
  // The exact list auth-routing.test.js protects. Loosening onboarding must
  // not have loosened anything else.
  ['app.html', 'profile.html', 'workout.html', 'workout-history.html',
    'workout-complete.html', 'nutrition.html', 'weight-history.html',
  ].forEach((p) => {
    assert.match(read(p), /await requireAuth\(\)/, p + ' must still requireAuth');
  });
});

test('onboarding never redirects to auth.html on load', () => {
  // The pre-4.3.7B catch block did exactly this. If it came back, an anonymous
  // visitor would bounce onboarding → auth → onboarding forever.
  const gate = OB_CODE.slice(
    OB_CODE.indexOf("window.addEventListener('load'"),
    OB_CODE.indexOf('function collectAnswers'));
  assert.ok(gate.length > 0, 'entry resolution block not found');
  assert.ok(!/auth\.html/.test(gate),
    'the entry path must not route to auth.html — that is the loop');
});

test('onboarding still never self-redirects', () => {
  assert.ok(!/location\.(href|replace)\('onboarding\.html'\)/.test(OB_CODE));
});

/* ══ the completed-user discard, at the page level ═══════════════════════ */

test('a completed user carrying a draft has it discarded, unmerged', () => {
  const gate = OB_CODE.slice(OB_CODE.indexOf("window.addEventListener('load'"));
  assert.match(gate, /STATE\.DISCARD_EXIT[\s\S]{0,200}?clearDraft\(\)/,
    'DISCARD_EXIT must clear the draft');
  assert.match(gate, /STATE\.DISCARD_EXIT[\s\S]{0,300}?replace\('app\.html'\)/,
    'DISCARD_EXIT must leave for the dashboard');
  // ...and must never merge on the way out.
  const branch = gate.slice(gate.indexOf('DISCARD_EXIT'), gate.indexOf('COMPLETE_EXIT'));
  assert.ok(!/merge|upsert|update/i.test(branch),
    'the discard branch must not write anything');
});

test('a completed user with no draft still goes straight to the dashboard', () => {
  assert.match(OB_CODE, /STATE\.COMPLETE_EXIT[\s\S]{0,160}?replace\('app\.html'\)/);
});

test('the page uses the shared resolver rather than its own conditionals', () => {
  assert.match(OB_CODE, /OnboardingDraft\.resolveOnboardingState\(/);
  // No page-local re-derivation of the six states.
  assert.ok(!/hasSession\s*&&\s*!?onboardingComplete/.test(OB_CODE));
});

/* ══ draft persistence is anonymous-only ════════════════════════════════ */

test('the draft is written only while anonymous', () => {
  assert.match(OB_CODE, /function persistDraft\([\s\S]{0,200}?if \(!anonymousMode\) return;/,
    'persistDraft must return early for an authenticated user');
});

test('every draft write goes through persistDraft', () => {
  // A direct saveDraft call would bypass the anonymous-only guard.
  const calls = OB_CODE.match(/OnboardingDraft\.saveDraft\(/g) || [];
  assert.strictEqual(calls.length, 1, 'exactly one saveDraft call, inside persistDraft');
  const persist = OB_CODE.slice(OB_CODE.indexOf('function persistDraft'),
    OB_CODE.indexOf('function restoreDraft'));
  assert.match(persist, /OnboardingDraft\.saveDraft\(/);
});

test('the draft is persisted on step transitions', () => {
  assert.match(OB_CODE, /function goStep\([\s\S]{0,240}?persistDraft\(n\)/);
});

test('derived values are never handed to the draft', () => {
  // collectAnswers must gather raw answers only — no targets, no macros.
  const collect = OB_CODE.slice(OB_CODE.indexOf('function collectAnswers'),
    OB_CODE.indexOf('function persistDraft'));
  ['target_calories', 'protein_target', 'maintenance_calories', 'carb_target',
    'fat_target', 'training_split', 'goal_summary'].forEach((k) => {
    assert.ok(!collect.includes(k), 'collectAnswers must not carry ' + k);
  });
});

/* ══ the anonymous path writes nothing ══════════════════════════════════ */

test('the anonymous save creates no profile and clears no draft', () => {
  const go = OB_CODE.slice(OB_CODE.indexOf('function goCreateAccount'),
    OB_CODE.indexOf('async function saveAndContinue'));
  assert.ok(go.length > 0, 'goCreateAccount not found');
  assert.ok(!/upsertProfile|\.update\(|\.insert\(|\.upsert\(/.test(go),
    'the anonymous path must not write to the database');
  assert.ok(!/clearDraft/.test(go),
    'the draft must survive until a confirmed completion');
  assert.match(go, /auth\.html/, 'it must send the visitor to create an account');
});

test('an anonymous user never reaches the authenticated save path', () => {
  assert.match(OB_CODE,
    /async function saveAndContinue\(\)[\s\S]{0,200}?if \(anonymousMode\) \{ goCreateAccount\(\); return; \}/);
});

test('the draft is cleared in exactly two places, both legitimate', () => {
  // 1 · the completed-user discard (never merged)
  // 2 · a claim CONFIRMED persisted
  // Any third clear would risk destroying recoverable answers.
  const clears = OB_CODE.match(/OnboardingDraft\.clearDraft\(\)/g) || [];
  assert.strictEqual(clears.length, 2, 'exactly two clearDraft call sites');
});

test('the claim clears the draft ONLY after confirming persistence', () => {
  const claim = OB_CODE.slice(OB_CODE.indexOf('async function claimDraft'),
    OB_CODE.indexOf('function goCreateAccount'));
  assert.ok(claim.length > 0, 'claimDraft not found');

  // The read-back must precede the clear, and the clear must be last.
  const confirmAt = claim.indexOf('confirmed.onboarding_complete !== true');
  const clearAt = claim.indexOf('OnboardingDraft.clearDraft()');
  assert.ok(confirmAt > 0, 'the claim must re-read and confirm the flag');
  assert.ok(clearAt > confirmAt, 'the draft must not be cleared before confirmation');
});

/* ══ the calculator is untouched ════════════════════════════════════════ */

test('the calorie and macro math is byte-identical to 50c83ca', () => {
  // Anonymous mode runs on THIS page and calls THESE functions. Nothing was
  // extracted or re-implemented, so no user's targets can have changed. These
  // are the exact computational expressions, pinned verbatim.
  [
    'return 370 + (21.6 * lean);',
    'var base = (10 * weightKg) + (6.25 * heightCm) - (5 * age);',
    "return gender === 'male' ? base + 5 : base - 161;",
    'var trainingAdd = trainingDays * 0.75 * 6 * (bmr / 24);',
    'return tdee + (trainingAdd / 7);',
    "var proteinPerLb = goal === 'recomp' ? 1.0 : goal === 'fatloss' ? 0.9 : 0.95;",
    'var fatCals  = Math.round(targetCals * 0.25);',
    'var fatG     = Math.round(fatCals / 9);',
    'var carbG    = Math.round(Math.max(0, targetCals - (proteinG * 4) - fatCals) / 4);',
    "var minCals = gender === 'female' ? 1350 : 1600;",
    'targetCals = Math.max(minCals, tdee - 500);',
    'targetCals = Math.max(minCals, tdee - 200);',
    'targetCals = tdee + 250;',
  ].forEach((expr) => {
    assert.ok(OB.includes(expr), 'calculator math changed — missing: ' + expr);
  });
});

test('no second calculator was introduced', () => {
  assert.strictEqual((OB_CODE.match(/function calcBMR\(/g) || []).length, 1);
  assert.strictEqual((OB_CODE.match(/function calcTDEE\(/g) || []).length, 1);
  assert.strictEqual((OB_CODE.match(/function calcMacros\(/g) || []).length, 1);
  // ...and the draft module contains no math at all.
  const draftSrc = readCode('onboarding-draft.js');
  ['calcBMR', 'calcTDEE', 'calcMacros', '21.6', '6.25', '1350', '1600'].forEach((t) => {
    assert.ok(!draftSrc.includes(t), 'onboarding-draft.js must not compute targets: ' + t);
  });
});

/* ══ personalization is unchanged ═══════════════════════════════════════ */

test('the reveal still uses the one shared engine', () => {
  assert.match(OB_CODE, /Personalization\.derivePersonalizedStart\(/);
  // No anonymous fork of the recommendation.
  assert.strictEqual(
    (OB_CODE.match(/derivePersonalizedStart\(/g) || []).length, 1);
});

test('the anonymous reveal evaluates no entitlement', () => {
  const reveal = OB_CODE.slice(OB_CODE.indexOf('function renderTrainingReveal'));
  assert.ok(!/accessibleSlugs/.test(reveal),
    'anonymous access must stay "not evaluated", never asserted');
  assert.ok(!/purchases/.test(reveal));
});

/* ══ copy and accessibility, asserted for THIS surface ══════════════════ */

test('the anonymous CTA promises only what it does', () => {
  assert.match(OB_CODE, /btn\.textContent = 'Save My Plan →'/);
  // It must not imply ownership, entitlement, enrolment or a dashboard the
  // visitor does not have yet.
  const banned = /\b(unlock|your program is ready|enrolled|start your program|free trial|dashboard)\b/i;
  const copy = OB_CODE.slice(OB_CODE.indexOf('function applyModeCopy'),
    OB_CODE.indexOf('function applyModeCopy') + 400);
  assert.ok(!banned.test(copy), 'the anonymous CTA overclaims');
});

test('the save control is a real button, not a styled div', () => {
  assert.match(OB, /<button class="btn-primary" id="saveBtn"/);
});

test('the save control meets a 44px touch target', () => {
  // Surface-specific by design: #42 shipped a 32.5px target because a Train
  // assertion was generalised to Home. This measures THIS button's own rule.
  assert.match(OB, /\.btn-primary \{[\s\S]*?padding: 15px;/);
  assert.match(OB, /\.btn-primary \{[\s\S]*?font-size: 13px;/);
  // 15px + 15px padding + ~16px line box ≥ 44px.
});

test('the two new inputs stayed labelled after the mode change', () => {
  assert.match(OB, /<label>Training Experience[\s\S]{0,140}id="ob-experience"/);
  assert.match(OB, /<label>Gym Access[\s\S]{0,140}id="ob-gym"/);
});

/* ══ B3 — the landing entry point ════════════════════════════════════════ */

test('new-prospect CTAs enter anonymous onboarding', () => {
  const INDEX = read('index.html');
  // Matched on href + label rather than the whole tag, so adding an attribute
  // (4.3.7G added an onclick) does not break a routing assertion.
  const hero = INDEX.match(/<a[^>]*class="btn btn-hero"[^>]*>[\s\S]*?<\/a>/);
  assert.ok(hero && hero[0].includes('href="onboarding.html"'), 'hero CTA must enter onboarding');
  assert.ok(hero[0].includes('Build My Free Fitness Plan'));
  // Unambiguous account-creation intent.
  const create = INDEX.match(/<a[^>]*>\s*Create Free Account\s*<\/a>/);
  assert.ok(create && create[0].includes('href="onboarding.html"'),
    'Create Free Account must enter onboarding');
});

test('every sign-in path still goes to auth, not onboarding', () => {
  // Returning users are untouched by the reversal — only new-prospect intent
  // was rerouted.
  const anchors = read('index.html')
    .match(/<a[^>]*>\s*(Login|Member Login|Sign In)\s*<\/a>/g) || [];
  assert.ok(anchors.length >= 4, 'expected at least the four sign-in CTAs');
  anchors.forEach((a) => assert.ok(a.includes('auth.html'), 'sign-in CTA rerouted: ' + a));
});

test('the calculator stays reachable as lead-gen', () => {
  // It is no longer the new-prospect entry, but it remains live and linked —
  // from its own "Not Sure Where to Start?" section and the footer.
  assert.ok((read('index.html').match(/href="calculator\.html"/g) || []).length >= 2,
    'calculator.html must stay reachable');
});

test('no emoji entered the onboarding surface', () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.ok(!emoji.test(OB));
  assert.ok(!emoji.test(read('onboarding-draft.js')));
});
