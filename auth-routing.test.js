// auth-routing.test.js — Phase 4.3.5H contract for authenticated routing.
//
// Two failure modes this phase had to close, and they pull in opposite
// directions, so both are pinned here:
//
//   1. Navigation that dumps a signed-in member out of the application onto the
//      public marketing site. It looks and feels exactly like being signed out,
//      and it was reachable from Store's own header.
//   2. Loosening a protected route in the course of fixing (1). Every gate that
//      existed before this phase must still exist.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Every page that requires a session.
const PROTECTED = [
  'app.html', 'profile.html', 'workout.html', 'workout-history.html',
  'workout-complete.html', 'nutrition.html', 'weight-history.html',
];
// Protected pages that are full destinations a user can deep-link or bookmark,
// and must therefore also enforce onboarding. workout-complete.html is a recap
// reached only from a finished session and is excluded by design.
const ONBOARDING_GATED = [
  'app.html', 'profile.html', 'workout.html', 'nutrition.html', 'weight-history.html',
];
// Public pages, which stay reachable and ungated (roadmap 4.5.9).
const PUBLIC = ['index.html', 'store.html', 'calculator.html', 'get-fit-guide.html'];

/* ══════════════════════════════════════════════════════════════════════════
 * 1 · Protection was not loosened
 * ══════════════════════════════════════════════════════════════════════ */

test('every protected page still requires a session before rendering', () => {
  for (const p of PROTECTED) {
    const src = read(p);
    assert.match(src, /await requireAuth\(\)/, `${p} calls requireAuth()`);
  }
  // …and requireAuth is the single implementation that redirects when absent.
  assert.match(read('supabase.js'),
    /async function requireAuth\(\)[\s\S]*?if \(!session\) \{\s*\n\s*window\.location\.href = 'auth\.html';/);
});

test('a failed bootstrap never leaves a protected page showing content', () => {
  // requireAuth() itself redirects an unauthenticated visitor and only then
  // throws, so the catch handles DATA failures. Every page must resolve that to
  // either sign-in or an explicit fallback — never to the authenticated view.
  for (const p of PROTECTED) {
    const src = read(p);
    const handled = /catch[\s\S]{0,500}?location\.href = 'auth\.html'/.test(src)
      || /catch[\s\S]{0,500}?showFallback\(/.test(src);
    assert.ok(handled, `${p} handles a bootstrap failure without revealing content`);
  }
  // workout-complete.html is the deliberate exception to the redirect pattern:
  // a recap whose DATA failed to load should explain itself, not bounce a
  // signed-in user to the login screen.
  assert.match(read('workout-complete.html'),
    /catch\(e\)\{[\s\S]{0,200}?showFallback\('Something went wrong loading your recap\.'\)/);
});

test('sign-out is explicit and is the only thing that clears the session', () => {
  const sb = read('supabase.js');
  assert.match(sb, /async function signOut\(\)[\s\S]*?auth\.signOut\(\)[\s\S]*?location\.href = 'auth\.html'/);
  // No page may sign the user out as a side effect of navigating.
  for (const p of PROTECTED.concat(PUBLIC)) {
    for (const m of read(p).matchAll(/signOut\(\)/g)) {
      const at = m.index;
      const around = read(p).slice(Math.max(0, at - 220), at);
      assert.ok(/onclick|addEventListener|function |=>/.test(around),
        `${p}: signOut() must be bound to an explicit control`);
    }
  }
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2 · Onboarding routing is consistent
 * ══════════════════════════════════════════════════════════════════════ */

test('a half-onboarded user is routed to onboarding from ANY destination', () => {
  // Before 4.3.5H only Home and Profile checked, so a deep link or bookmark
  // dropped the user onto a destination where every target was missing.
  for (const p of ONBOARDING_GATED) {
    const src = read(p);
    assert.match(src, /onboarding_complete/, `${p} checks onboarding completion`);
    assert.match(src, /location\.(href\s*=\s*|replace\()'onboarding\.html'/,
      `${p} routes an incomplete profile to onboarding`);
  }
});

test('a completed user is never sent back to onboarding', () => {
  for (const p of ONBOARDING_GATED) {
    const src = read(p);
    // The guard must be negative — `!complete` — never an unconditional jump.
    const guards = [...src.matchAll(/if \([^)]*onboarding_complete[^)]*\)/g)].map((m) => m[0]);
    assert.ok(guards.length > 0, `${p} has an onboarding guard`);
    for (const g of guards) {
      assert.match(g, /!/, `${p}: guard "${g}" must test for INcompleteness`);
    }
  }
});

test('onboarding itself is not gated behind onboarding', () => {
  const ob = read('onboarding.html');
  assert.ok(!/location\.(href|replace)\('onboarding\.html'\)/.test(ob), 'no self-redirect loop');
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3 · Authenticated navigation stays inside the app
 * ══════════════════════════════════════════════════════════════════════ */

test('store: Home means the dashboard for a signed-in member', () => {
  const src = read('store.html');
  // The defect: every Home link pointed at the public landing page, so a member
  // browsing Programs who tapped Home was dropped out of the application.
  assert.match(src, /function applyAuthNav\(signedIn\)/);
  assert.match(src, /const home = signedIn \? 'app\.html' : 'index\.html'/);
  for (const id of ['headerLogoLink', 'headerHomeLink', 'mobileHomeLink']) {
    assert.ok(src.includes(`'${id}'`), `store.html rewrites #${id}`);
    assert.match(src, new RegExp(`id="${id}"`), `#${id} exists in the markup`);
  }
});

test('store: every Home affordance is covered, in both navs', () => {
  const src = read('store.html');
  // Any anchor whose visible text is "Home" must be one of the rewritten ids —
  // otherwise a third nav could silently reintroduce the same defect.
  // Header, mobile drawer AND footer — the footer link was the one the first
  // pass missed, which is precisely why this is asserted structurally.
  const homeLinks = [...src.matchAll(/<a\s([^>]*)>\s*Home\s*<\/a>/g)];
  assert.ok(homeLinks.length >= 3, 'all three Home affordances are present');
  for (const m of homeLinks) {
    assert.match(m[1], /id="(headerHomeLink|mobileHomeLink|footerHomeLink)"/,
      `an un-rewritten Home link exists: <a ${m[1]}>`);
  }
  // Same for every "sign in" affordance, so none is left saying Login to a
  // member who is already signed in.
  for (const m of src.matchAll(/<a\s([^>]*href="auth\.html"[^>]*)>/g)) {
    assert.match(m[1], /id="(headerLoginBtn|mobileLoginLink|footerLoginLink)"/,
      `an un-rewritten sign-in link exists: <a ${m[1]}>`);
  }
});

test('store: the signed-out experience is unchanged and fails closed', () => {
  const src = read('store.html');
  assert.match(src, /catch \(e\) \{ session = null; \}/,
    'a session error leaves the public nav in place');
  assert.match(src, /applyAuthNav\(!!session\)/);
  // Public entry points are untouched — the store stays usable signed-out.
  assert.match(src, /href="calculator\.html"/);
  assert.match(src, /id="headerLoginBtn" href="auth\.html"/, 'the default markup is the public one');
});

test('program pages already route members to the dashboard, not the landing page', () => {
  for (const p of ['program-fat-loss.html', 'program-muscle-gain.html', 'program-glute-builder.html']) {
    const src = read(p);
    assert.match(src, /class="header-logo" href="app\.html"/, `${p} logo → dashboard`);
    assert.match(src, /class="back-link" href="app\.html"/, `${p} back → dashboard`);
  }
});

test('in-app destinations never link to the public landing page', () => {
  for (const p of PROTECTED) {
    const src = read(p);
    for (const m of src.matchAll(/href="index\.html"/g)) {
      assert.fail(`${p} links to the public landing page at offset ${m.index}`);
    }
  }
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4 · The production host / service-worker guard (roadmap §10.3)
 * ══════════════════════════════════════════════════════════════════════ */

test('the service-worker guard names the confirmed canonical host', () => {
  // Confirmed 2026-08-14 against production: https://musclemotivation.fit/
  // answers 200 directly with no redirect, and https://www.musclemotivation.fit/
  // presents no valid certificate — the www host is not configured at all.
  // The apex is therefore canonical and the existing guard is correct.
  const sw = read('sw-register.js');
  assert.match(sw, /var PROD_HOST = 'musclemotivation\.fit';/);
  assert.match(sw, /if \(hostname === PROD_HOST\) return isHttps;/,
    'production registers over HTTPS only');
});

test('the guard still default-denies every other host', () => {
  const sw = read('sw-register.js');
  assert.match(sw, /return false;\s*\/\/ default deny/);
  // A www variant is NOT silently allowed — if www were ever configured this
  // test and the constant above must both be revisited deliberately.
  assert.ok(!/www\./.test(sw), 'no www host is whitelisted');
});

/* ══════════════════════════════════════════════════════════════════════════
 * 5 · Menu duplication (Phase 4.3.5 real-device follow-up)
 *
 * Signed in, the menu offered "Home" and "My Dashboard" as separate items that
 * went to the same authenticated dashboard. Routing was already correct — this
 * is redundancy, not a routing defect — so the fix is the smallest one that
 * removes the duplicate while leaving the signed-out menu untouched.
 * ══════════════════════════════════════════════════════════════════════ */

test('menu: signed OUT, Home and Login are genuinely different places', () => {
  const src = read('store.html');
  assert.match(src, /const home = signedIn \? 'app\.html' : 'index\.html'/);
  // Nothing is hidden in the public state — the menu is exactly as it was.
  assert.match(src, /if \(el\) el\.hidden = signedIn;/,
    'the plain Home link is hidden only when signed in');
});

test('menu: signed IN, the duplicate Home entry is withdrawn', () => {
  const src = read('store.html');
  const fn = src.match(/function applyAuthNav\(signedIn\)[\s\S]*?\n  \}/)[0];
  // All three Home affordances yield; the dashboard CTA is what remains.
  for (const id of ['headerHomeLink', 'mobileHomeLink', 'footerHomeLink']) {
    assert.ok(fn.includes(`'${id}'`), `${id} participates`);
  }
  assert.match(fn, /for \(const id of \['headerHomeLink', 'mobileHomeLink', 'footerHomeLink'\]\) \{\s*\n\s*const el = document\.getElementById\(id\);\s*\n\s*if \(el\) el\.hidden = signedIn;/);
});

test('menu: the dashboard entry is the one that survives, and still routes correctly', () => {
  const fn = read('store.html').match(/function applyAuthNav\(signedIn\)[\s\S]*?\n  \}/)[0];
  assert.match(fn, /el\.textContent = signedIn \? 'My Dashboard' : SIGNED_OUT_LABEL\[id\]/);
  assert.match(fn, /el\.href = signedIn \? 'app\.html' : 'auth\.html'/);
  // The login/dashboard control is never hidden — only the redundant Home is.
  assert.ok(!/headerLoginBtn[\s\S]{0,80}hidden/.test(fn));
});

test('menu: Free Calculator is preserved in both states', () => {
  const src = read('store.html');
  assert.match(src, /<a href="calculator\.html">Free Calculator<\/a>/, 'in the drawer');
  assert.match(src, /<a href="calculator\.html">Calculator<\/a>/, 'in the header');
  // It is never hidden by the auth pass.
  // Comments explain the intent; only code counts.
  const fn = src.match(/function applyAuthNav\(signedIn\)[\s\S]*?\n  \}/)[0]
    .replace(/\/\/[^\n]*/g, '');
  assert.ok(!/calculator/i.test(fn), 'applyAuthNav does not touch the calculator link');
});

test('menu: hiding actually takes effect on this page', () => {
  // store.html does not load app-shell.css, so it does not inherit the shell's
  // authoritative [hidden] guard — it needs its own, or a future display rule
  // on an anchor would silently resurrect the duplicate.
  const css = (read('store.html').match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
  assert.match(css, /\.header-nav a\[hidden\][\s\S]{0,120}display:\s*none\s*!important/);
  const storeCode = read('store.html').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/app-shell\.css/.test(storeCode),
    'and it still does not pull in the whole app shell for this');
});

test('menu: no navigation was redesigned — only the duplicate withdrawn', () => {
  const src = read('store.html');
  // The same items exist in the markup as before; nothing was deleted.
  for (const label of ['Home', 'Free Calculator', 'Contact']) {
    assert.ok(src.includes('>' + label + '<') || src.includes('>' + label + ' <'),
      `${label} is still present in the markup`);
  }
  assert.match(src, /id="mobileHomeLink"/, 'the Home link is hidden, not removed');
});
