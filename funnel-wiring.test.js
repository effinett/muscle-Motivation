/* ──────────────────────────────────────────────────────────────────────────
 * Phase 4.3.7G2 — funnel wiring
 *
 * The vocabulary is pinned in analytics-core.test.js. This file pins WHERE
 * events fire and — more importantly — where they must NOT: an already-
 * onboarded user reaching onboarding is not an acquisition, and counting them
 * would inflate the top of the funnel with people who were never in it.
 * ──────────────────────────────────────────────────────────────────────── */

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const A = require('./analytics-core.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const readCode = (f) => read(f)
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const INDEX = read('index.html');
const INDEX_CODE = readCode('index.html');
const OB = read('onboarding.html');
const OB_CODE = readCode('onboarding.html');
const AUTH_CODE = readCode('auth.html');

const PAGES = [['index.html', INDEX], ['onboarding.html', OB], ['auth.html', read('auth.html')]];

/* ══ load ═══════════════════════════════════════════════════════════════ */

test('every instrumented page loads analytics-core', () => {
  PAGES.forEach(([name, src]) => {
    assert.match(src, /<script src="analytics-core\.js"><\/script>/, name);
  });
});

test('index.html loads it NOT deferred', () => {
  // The landing CTAs are the first thing a visitor can click; a deferred
  // script may not have parsed by then.
  assert.match(INDEX, /<script src="analytics-core\.js"><\/script>/);
  assert.ok(!/analytics-core\.js"\s+defer/.test(INDEX));
});

test('no protected page was instrumented', () => {
  // This is 4.3.7G, not a product analytics rewrite.
  ['app.html', 'workout.html', 'nutrition.html', 'weight-history.html',
    'profile.html', 'workout-history.html', 'store.html', 'calculator.html',
  ].forEach((p) => {
    assert.ok(!read(p).includes('analytics-core.js'), p + ' must not be instrumented');
  });
});

/* ══ the eight call sites ═══════════════════════════════════════════════ */

test('landing CTAs emit, and only the two rerouted ones', () => {
  assert.match(INDEX, /onclick="mmFunnel\('landing_cta_clicked','hero'\)"/);
  assert.match(INDEX, /onclick="mmFunnel\('landing_cta_clicked','create_account'\)"/);
  assert.strictEqual((INDEX.match(/landing_cta_clicked/g) || []).length, 2);
  // Sign-in CTAs are not acquisition events.
  const signIn = INDEX.match(/<a[^>]*>\s*(Login|Member Login|Sign In)\s*<\/a>/g) || [];
  signIn.forEach((a) => assert.ok(!a.includes('mmFunnel'), 'sign-in CTA emits: ' + a));
});

test('onboarding_started fires only on a genuine start', () => {
  assert.match(OB_CODE, /STATE\.ANON_NEW\)\s*\{\s*mmFunnel\('onboarding_started', 'anonymous'\)/);
  assert.match(OB_CODE, /STATE\.AUTH_WIZARD\)\s*\{\s*mmFunnel\('onboarding_started', 'authenticated'\)/);
  // ANON_RESUME is the same funnel continuing after a refresh or OAuth.
  const gate = OB_CODE.slice(OB_CODE.indexOf('anonymousMode = !session'),
    OB_CODE.indexOf('if (draft) restoreDraft'));
  assert.ok(!/ANON_RESUME/.test(gate), 'a resume must not count as a start');
});

test('step completion reports the step LEFT, and only steps 1-4', () => {
  assert.match(OB_CODE,
    /if \(n > 1 && n <= TOTAL_STEPS\) mmFunnel\('onboarding_step_completed', String\(n - 1\)\)/);
  // String(n-1) for n in 2..5 gives '1'..'4' — exactly the allowed details.
  [2, 3, 4, 5].forEach((n) => {
    assert.strictEqual(A.isValidEvent('onboarding_step_completed', String(n - 1)), true);
  });
});

test('the reveal reports the plan status it actually rendered', () => {
  assert.match(OB_CODE, /mmFunnel\('personalized_plan_viewed', plan\.status\)/);
  // Every status the engine can produce is a permitted detail.
  const P = require('./personalization-core.js');
  Object.keys(P.STATUS).forEach((k) => {
    assert.strictEqual(A.isValidEvent('personalized_plan_viewed', P.STATUS[k]), true,
      'engine status not in the funnel vocabulary: ' + P.STATUS[k]);
  });
});

test('save_plan_clicked fires on the anonymous CTA with no detail', () => {
  assert.match(OB_CODE, /mmFunnel\('save_plan_clicked', null\)/);
});

test('email signup emits precisely; google is attributed by elimination', () => {
  assert.match(AUTH_CODE, /mmFunnel\('signup_completed', 'email'\)/);
  assert.match(OB_CODE, /mmFunnel\('signup_completed', 'google'\)/);
  // The google emit sits in the CLAIM branch, where a returning OAuth user
  // lands, and dedupe suppresses it when email already fired.
  const claimBranch = OB_CODE.slice(OB_CODE.indexOf('STATE.CLAIM &&'),
    OB_CODE.indexOf('var claimed = await claimDraft'));
  assert.match(claimBranch, /signup_completed', 'google'/);
});

test('every claim failure reason has a call site, one per fail-stop', () => {
  const claim = OB_CODE.slice(OB_CODE.indexOf('async function claimDraft'),
    OB_CODE.indexOf('function goCreateAccount'));
  A.FUNNEL_EVENTS.onboarding_claim_failed.forEach((reason) => {
    assert.ok(claim.includes("onboarding_claim_failed', '" + reason + "'"),
      'no emit for claim failure reason: ' + reason);
  });
  // ...and each sits beside a return false, not after it.
  assert.strictEqual((claim.match(/onboarding_claim_failed/g) || []).length, 5);
  assert.strictEqual((claim.match(/return false;/g) || []).length, 5);
});

test('completion distinguishes the two paths', () => {
  assert.match(OB_CODE, /mmFunnel\('onboarding_completed', 'anonymous_claim'\)/);
  assert.match(OB_CODE, /mmFunnel\('onboarding_completed', 'authenticated_wizard'\)/);
});

test('completion is emitted BEFORE the funnel id is cleared', () => {
  // Clearing first would mint a fresh id on the next emit, detaching the
  // completion from the funnel it completes.
  const claimed = OB_CODE.slice(OB_CODE.indexOf('if (claimed) {'));
  const emitAt = claimed.indexOf("onboarding_completed', 'anonymous_claim'");
  const clearAt = claimed.indexOf('mmFunnelClear()');
  assert.ok(emitAt >= 0 && clearAt > emitAt, 'clear must follow the emit');

  const save = OB_CODE.slice(OB_CODE.indexOf('async function saveAndContinue'));
  const e2 = save.indexOf("onboarding_completed', 'authenticated_wizard'");
  const c2 = save.indexOf('mmFunnelClear()');
  assert.ok(e2 >= 0 && c2 > e2, 'clear must follow the emit on the wizard path too');
});

/* ══ the exclusions — what must NOT be counted ══════════════════════════ */

test('an already-onboarded user emits NOTHING', () => {
  const gate = OB_CODE.slice(OB_CODE.indexOf('STATE.DISCARD_EXIT'),
    OB_CODE.indexOf('pcLoadCatalog()'));
  assert.ok(gate.length > 0, 'exit branches not found');
  assert.ok(!/mmFunnel\(/.test(gate),
    'the discard/complete exits must emit no funnel event');
  // ...and the funnel id is cleared so the visit leaves no trace.
  assert.match(gate, /mmFunnelClear\(\)/);
});

test('auth clears the funnel for a completed user without emitting', () => {
  const discard = AUTH_CODE.slice(AUTH_CODE.indexOf('function discardStaleDraft'),
    AUTH_CODE.indexOf('function mmFunnel'));
  assert.match(discard, /clearFunnel\(\)/);
  assert.ok(!/emit\(/.test(discard));
});

test('sign-in is never counted as signup', () => {
  const login = AUTH_CODE.slice(AUTH_CODE.indexOf('async function handleLogin'),
    AUTH_CODE.indexOf('function passwordPolicyError'));
  assert.ok(!/mmFunnel\(/.test(login), 'handleLogin must not emit signup_completed');
});

/* ══ it can never break the product ═════════════════════════════════════ */

test('every call site goes through a guarded helper', () => {
  // A raw MMAnalytics.emit( in page code would bypass the try/catch.
  [['onboarding.html', OB_CODE], ['auth.html', AUTH_CODE], ['index.html', INDEX_CODE],
  ].forEach(([name, code]) => {
    const raw = code.match(/MMAnalytics\.emit\(/g) || [];
    // The only permitted MMAnalytics.emit is the one inside mmFunnel itself.
    assert.ok(raw.length <= 1, name + ' calls MMAnalytics.emit outside the helper');
  });
});

test('the helper is guarded on every page', () => {
  [['onboarding.html', OB_CODE], ['auth.html', AUTH_CODE], ['index.html', INDEX_CODE],
  ].forEach(([name, code]) => {
    assert.match(code,
      /function mmFunnel\([\s\S]{0,220}?typeof MMAnalytics !== 'undefined'[\s\S]{0,160}?catch/,
      name + ' must guard its emitter');
  });
});

test('no funnel emit is ever awaited', () => {
  [OB_CODE, AUTH_CODE, INDEX_CODE].forEach((code) => {
    assert.ok(!/await\s+mmFunnel\(/.test(code));
    assert.ok(!/await\s+MMAnalytics\./.test(code));
    assert.ok(!/mmFunnel\([^)]*\)\s*\.then/.test(code));
  });
});

test('no emit sits between a write and its confirmation', () => {
  // The claim ordering is the safety property; telemetry must not be spliced
  // into it. Every emit in claimDraft is on a failure return path.
  const claim = OB_CODE.slice(OB_CODE.indexOf('async function claimDraft'),
    OB_CODE.indexOf('function goCreateAccount'));
  const fieldAt = claim.indexOf('upsertProfile(currentUser.id, patch)');
  const confirmAt = claim.indexOf('confirmed.onboarding_complete !== true');
  const between = claim.slice(fieldAt, confirmAt);
  const emits = between.match(/mmFunnel\(/g) || [];
  // Only the two failure emits (field_write, flag_write) may appear, each
  // guarding a return.
  assert.ok(emits.length <= 2, 'telemetry spliced into the claim sequence');
  assert.ok(!/onboarding_completed/.test(between));
});

/* ══ privacy at the call sites ══════════════════════════════════════════ */

// Extract mmFunnel(...) arguments with balanced parens — a naive [^)]* would
// truncate a nested call like String(n - 1) and make the check meaningless.
function funnelCallArgs(code) {
  const out = [];
  const needle = 'mmFunnel(';
  let i = code.indexOf(needle);
  while (i >= 0) {
    let depth = 1;
    let j = i + needle.length;
    while (j < code.length && depth > 0) {
      if (code[j] === '(') depth++;
      else if (code[j] === ')') depth--;
      if (depth > 0) j++;
    }
    out.push(code.slice(i + needle.length, j).trim());
    i = code.indexOf(needle, j);
  }
  return out;
}

test('no call site passes anything but a literal from the vocabulary', () => {
  const calls = funnelCallArgs(OB_CODE)
    .concat(funnelCallArgs(AUTH_CODE))
    .concat(funnelCallArgs(INDEX_CODE))
    .filter((c) => c && !c.startsWith('event, detail'));

  assert.ok(calls.length >= 10, 'expected the wired call sites, found ' + calls.length);
  calls.forEach((args) => {
    // Permitted: two quoted literals, or a quoted literal plus null, or the
    // three audited computed values.
    const ok = /^'[a-z_]+',\s*('[a-z0-9_]+'|null)$/.test(args)
      || args === "'personalized_plan_viewed', plan.status"
      || args === "'onboarding_step_completed', String(n - 1)";
    assert.ok(ok, 'suspect funnel argument: ' + args);
  });
});

test('the computed details can only produce allowlisted values', () => {
  // plan.status and String(n-1) are the only non-literals; both are bounded.
  const P = require('./personalization-core.js');
  Object.keys(P.STATUS).forEach((k) =>
    assert.ok(A.FUNNEL_EVENTS.personalized_plan_viewed.includes(P.STATUS[k])));
  [2, 3, 4, 5].forEach((n) =>
    assert.ok(A.FUNNEL_EVENTS.onboarding_step_completed.includes(String(n - 1))));
});
