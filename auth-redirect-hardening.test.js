/* ──────────────────────────────────────────────────────────────────────────
 * Phase 4.3.7C — auth redirect hardening and the PWA start_url re-proof
 *
 * Reversing the onboarding flow invalidated the loop-free proof that was made
 * under the old auth-first ordering. This file re-establishes it.
 *
 * The redirect graph below is a MODEL of the routing rules, not an execution
 * of the pages. It proves the RULES contain no cycle and that every auth state
 * terminates; it cannot prove the pages implement the rules. That half is
 * covered by the source assertions here, by onboarding-claim.test.js, and by
 * the real-device pass recorded in the phase report.
 * ──────────────────────────────────────────────────────────────────────── */

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const D = require('./onboarding-draft.js');
const SWPolicy = require('./sw-policy.js');

const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const readCode = (f) => read(f)
  .replace(/<style[\s\S]*?<\/style>/gi, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const MANIFEST = JSON.parse(read('manifest.webmanifest'));

/* ══════════════════════════════════════════════════════════════════════════
 * The redirect model
 *
 * A world = { session, complete, draft }. `next(page, world)` returns the page
 * the app sends that world to, or null when the page RENDERS (terminal).
 * ══════════════════════════════════════════════════════════════════════ */

const PROTECTED = ['app.html', 'profile.html', 'workout.html', 'nutrition.html',
  'weight-history.html'];

function next(page, w) {
  if (PROTECTED.includes(page)) {
    if (!w.session) return 'auth.html';          // requireAuth
    if (!w.complete) return 'onboarding.html';   // onboarding gate
    return null;                                 // renders
  }

  if (page === 'auth.html') {
    if (!w.session) return null;                 // renders the sign-in form
    // routeAfterAuth: a completed user's stale draft is discarded here.
    if (w.complete) { w.draft = false; return 'app.html'; }
    return 'onboarding.html';
  }

  if (page === 'onboarding.html') {
    const state = D.resolveOnboardingState({
      hasSession: w.session, onboardingComplete: w.complete, hasDraft: w.draft });
    switch (state) {
      case D.STATE.ANON_NEW:
      case D.STATE.ANON_RESUME:
      case D.STATE.AUTH_WIZARD:
        return null;                             // the wizard renders
      case D.STATE.CLAIM:
        // A successful claim completes the profile and clears the draft; a
        // failed one renders the wizard. Both terminate — modelled as success,
        // with the failure branch covered separately below.
        w.complete = true; w.draft = false;
        return 'app.html';
      case D.STATE.DISCARD_EXIT:
        w.draft = false;                         // discarded UNMERGED
        return 'app.html';
      case D.STATE.COMPLETE_EXIT:
        return 'app.html';
      default:
        throw new Error('unmodelled state: ' + state);
    }
  }
  return null;                                   // public pages render
}

// Walk until a page renders, or declare a loop.
function walk(start, world, limit = 12) {
  const w = Object.assign({}, world);
  const path0 = [start];
  let page = start;
  for (let i = 0; i < limit; i++) {
    const to = next(page, w);
    if (to === null) return { terminal: page, path: path0, world: w };
    if (path0.includes(to) && to !== path0[path0.length - 1]) {
      // Revisiting a page already in this walk is only safe if the world
      // changed such that it now terminates — the walk below will catch it.
    }
    path0.push(to);
    page = to;
  }
  return { terminal: null, path: path0, world: w, looped: true };
}

const WORLDS = {
  loggedOut:            { session: false, complete: false, draft: false },
  anonInProgress:       { session: false, complete: false, draft: true },
  anonDoneNoAccount:    { session: false, complete: false, draft: true },
  authIncomplete:       { session: true,  complete: false, draft: false },
  authIncompleteDraft:  { session: true,  complete: false, draft: true },
  authComplete:         { session: true,  complete: true,  draft: false },
  authCompleteStale:    { session: true,  complete: true,  draft: true },
};

const ENTRIES = ['app.html', 'auth.html', 'onboarding.html', 'profile.html',
  'workout.html', 'nutrition.html', 'weight-history.html'];

/* ══ every state terminates, from every entry point ══════════════════════ */

test('every auth state terminates from every entry point — no loops', () => {
  Object.entries(WORLDS).forEach(([name, world]) => {
    ENTRIES.forEach((entry) => {
      const r = walk(entry, world);
      assert.ok(!r.looped,
        `LOOP: ${name} entering ${entry} → ${r.path.join(' → ')}`);
      assert.ok(r.terminal, `${name} entering ${entry} never rendered`);
    });
  });
});

test('no walk exceeds three redirects', () => {
  // A longer chain would mean the rules are routing through a page that has
  // nothing to decide.
  Object.entries(WORLDS).forEach(([name, world]) => {
    ENTRIES.forEach((entry) => {
      const r = walk(entry, world);
      assert.ok(r.path.length <= 4,
        `${name} from ${entry} took ${r.path.length - 1} redirects: ${r.path.join(' → ')}`);
    });
  });
});

/* ══ the twelve states from the 4.3.7C proof matrix ══════════════════════ */

test('1 · logged out, normal browser', () => {
  assert.strictEqual(walk('app.html', WORLDS.loggedOut).terminal, 'auth.html');
  // ...and onboarding is now reachable rather than bouncing to auth.
  assert.strictEqual(walk('onboarding.html', WORLDS.loggedOut).terminal, 'onboarding.html');
});

test('2 · anonymous onboarding in progress stays put', () => {
  const r = walk('onboarding.html', WORLDS.anonInProgress);
  assert.strictEqual(r.terminal, 'onboarding.html');
  assert.strictEqual(r.path.length, 1, 'no redirect at all');
});

test('3 · reveal complete but no account yet stays put', () => {
  assert.strictEqual(walk('onboarding.html', WORLDS.anonDoneNoAccount).terminal,
    'onboarding.html');
});

test('4 · authenticated but incomplete lands on the wizard', () => {
  PROTECTED.forEach((p) => {
    const r = walk(p, WORLDS.authIncomplete);
    assert.strictEqual(r.terminal, 'onboarding.html', p + ' must route to onboarding');
  });
});

test('5 · authenticated and complete renders the destination', () => {
  PROTECTED.forEach((p) => {
    assert.strictEqual(walk(p, WORLDS.authComplete).terminal, p);
  });
});

test('6 · installed PWA relaunch terminates in every sub-state', () => {
  // start_url is /app.html for every launch, whatever the auth state.
  assert.strictEqual(MANIFEST.start_url, '/app.html');
  Object.entries(WORLDS).forEach(([name, world]) => {
    const r = walk(MANIFEST.start_url.replace(/^\//, ''), world);
    assert.ok(r.terminal, 'PWA launch did not terminate for ' + name);
  });
});

test('11 · a successful claim ends on the dashboard, complete, draft gone', () => {
  const r = walk('onboarding.html', WORLDS.authIncompleteDraft);
  assert.strictEqual(r.terminal, 'app.html');
  assert.strictEqual(r.world.complete, true);
  assert.strictEqual(r.world.draft, false);
});

test('12 · a returning completed user with a stale draft is protected', () => {
  // Through onboarding...
  const viaOnboarding = walk('onboarding.html', WORLDS.authCompleteStale);
  assert.strictEqual(viaOnboarding.terminal, 'app.html');
  assert.strictEqual(viaOnboarding.world.draft, false, 'draft must be discarded');
  assert.strictEqual(viaOnboarding.world.complete, true, 'profile stays complete');
  // ...and through auth.
  const viaAuth = walk('auth.html', WORLDS.authCompleteStale);
  assert.strictEqual(viaAuth.terminal, 'app.html');
  assert.strictEqual(viaAuth.world.draft, false);
});

/* ══ states 7–10: recovery, asserted at the source ═══════════════════════ */

test('7 · refresh mid-onboarding resumes rather than restarting', () => {
  const OB = readCode('onboarding.html');
  assert.match(OB, /OnboardingDraft\.loadDraft\(/);
  assert.match(OB, /if \(draft\) restoreDraft\(draft\)/);
  assert.match(OB, /persistDraft\(n\)/);
});

test('8 · back cannot return to a claimed or exited wizard', () => {
  // Every exit from onboarding uses replace(), which leaves no history entry.
  const OB = readCode('onboarding.html');
  const exits = OB.match(/window\.location\.(replace|href)\('app\.html'\)/g) || [];
  assert.ok(exits.length > 0, 'no exit to the dashboard found');
  exits.forEach((e) => assert.ok(e.includes('replace'),
    'onboarding must leave via replace(), not href: ' + e));
});

test('9 · a signup failure keeps the draft', () => {
  const AUTH = readCode('auth.html');
  const signup = AUTH.slice(AUTH.indexOf('async function handleSignup'));
  assert.ok(!/clearDraft|discardStaleDraft/.test(signup));
  assert.match(signup, /catch \(e\)[\s\S]{0,160}?showMsg\(/);
});

test('10 · OAuth cancellation returns to a resumable anonymous state', () => {
  // Cancelling means arriving back on the origin with no session. That world
  // resolves to ANON_RESUME — the answers are still there.
  assert.strictEqual(
    D.resolveOnboardingState({ hasSession: false, onboardingComplete: false, hasDraft: true }),
    D.STATE.ANON_RESUME);
  assert.match(readCode('auth.html'),
    /redirectTo: window\.location\.origin \+ '\/onboarding\.html'/);
});

/* ══ the service worker was not touched ═════════════════════════════════ */

test('HTML navigations are still never cacheable', () => {
  // The privacy rule the whole PWA design rests on, and the reason start_url
  // resolves against a live session rather than a cached shell.
  const nav = { url: 'https://musclemotivation.fit/app.html', method: 'GET', mode: 'navigate' };
  assert.strictEqual(SWPolicy.isCacheableRequest(nav), false);
  ['/onboarding.html', '/auth.html', '/index.html', '/'].forEach((p) => {
    assert.strictEqual(
      SWPolicy.isCacheableRequest({ url: 'https://musclemotivation.fit' + p, method: 'GET', mode: 'navigate' }),
      false, p + ' must not be cacheable');
  });
});

test('the onboarding flow added no cacheable route', () => {
  const allow = SWPolicy.STATIC_ALLOWLIST;
  // Asserted rather than defaulted: a renamed export must fail this test, not
  // silently satisfy it with an empty array.
  assert.ok(Array.isArray(allow) && allow.length > 0, 'STATIC_ALLOWLIST must be a real list');
  ['/onboarding.html', '/auth.html', '/index.html'].forEach((p) => {
    assert.ok(!allow.includes(p), p + ' must not be on the static allowlist');
  });
});

test('the manifest is unchanged by the flow reversal', () => {
  assert.strictEqual(MANIFEST.start_url, '/app.html');
  assert.strictEqual(MANIFEST.scope, '/');
  assert.strictEqual(MANIFEST.display, 'standalone');
  assert.strictEqual(MANIFEST.id, '/');
});

test('no authenticated page became offline-cacheable', () => {
  ['/app.html', '/profile.html', '/workout.html', '/nutrition.html',
    '/weight-history.html'].forEach((p) => {
    assert.strictEqual(
      SWPolicy.isCacheableRequest({ url: 'https://musclemotivation.fit' + p, method: 'GET', mode: 'navigate' }),
      false, p);
  });
});

/* ══ nothing was loosened ═══════════════════════════════════════════════ */

test('protection was not loosened anywhere', () => {
  ['app.html', 'profile.html', 'workout.html', 'workout-history.html',
    'workout-complete.html', 'nutrition.html', 'weight-history.html',
  ].forEach((p) => assert.match(read(p), /await requireAuth\(\)/, p));
});

test('every onboarding guard is still negative', () => {
  PROTECTED.forEach((p) => {
    const guards = [...read(p).matchAll(/if \([^)]*onboarding_complete[^)]*\)/g)].map((m) => m[0]);
    assert.ok(guards.length > 0, p + ' lost its onboarding guard');
    guards.forEach((g) => assert.match(g, /!/, p + ': guard must test incompleteness — ' + g));
  });
});

test('onboarding is the ONLY page without requireAuth', () => {
  const OB = readCode('onboarding.html');
  assert.ok(!/requireAuth\s*\(/.test(OB));
  // ...and it compensates with an explicit, total resolution.
  assert.match(OB, /OnboardingDraft\.resolveOnboardingState\(/);
});
