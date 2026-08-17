// mm-sheet.test.js — Phase 4.3.5C contract for the shared overlay primitive.
//
// Two halves, matching the module:
//   1. the PURE layer (gesture verdicts, scroll-lock bookkeeping, focus ring),
//      exercised directly — this is where the behaviour that is hard to see in a
//      browser actually lives;
//   2. the CONSUMER contract — that every overlay in the app really goes through
//      the primitive rather than re-implementing it, which is the whole point of
//      building it (CLAUDE.md §4, roadmap §2.7).

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const MMSheet = require('./mm-sheet.js');
const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SHEET_CSS = read('mm-sheet.css');
const SHEET_JS = read('mm-sheet.js');

const G = MMSheet.SHEET_GESTURE;

/* ══════════════════════════════════════════════════════════════════════════
 * 1 · Gesture classification — scroll vs dismiss
 * ══════════════════════════════════════════════════════════════════════ */

test('gesture: nothing is claimed before the intent threshold', () => {
  assert.strictEqual(MMSheet.classifyGesture({ dx: 0, dy: 0 }), 'pending');
  assert.strictEqual(MMSheet.classifyGesture({ dx: 3, dy: 5 }), 'pending');
  // A tap with a jittery finger must never become a drag.
  assert.strictEqual(MMSheet.classifyGesture({ dx: 2, dy: 2, fromHandle: true }), 'pending');
});

test('gesture: a slight diagonal scrolls the list — it never dismisses', () => {
  // This is the explicit requirement: vertical list scrolling must stay easy,
  // and a gesture that is only a little off-vertical must not close the sheet.
  // 30px down with 25px of sideways travel is well inside normal thumb drift.
  assert.strictEqual(
    MMSheet.classifyGesture({ dx: 25, dy: 30, scrollable: true, scrollTop: 0 }), 'scroll');
  assert.strictEqual(
    MMSheet.classifyGesture({ dx: -25, dy: 30, scrollable: true, scrollTop: 0 }), 'scroll');
  // Even on the handle, a mostly-sideways gesture is not a dismissal.
  assert.strictEqual(MMSheet.classifyGesture({ dx: 40, dy: 20, fromHandle: true }), 'scroll');
});

test('gesture: a clearly vertical pull at the top of the list is a drag', () => {
  assert.strictEqual(
    MMSheet.classifyGesture({ dx: 4, dy: 40, scrollable: true, scrollTop: 0 }), 'drag');
});

test('gesture: mid-list, a downward pull keeps scrolling', () => {
  // Dismissing here would be indistinguishable from a mis-read scroll and would
  // lose the user's place in a long exercise list.
  assert.strictEqual(
    MMSheet.classifyGesture({ dx: 0, dy: 60, scrollable: true, scrollTop: 120 }), 'scroll');
  // …but the handle still works, wherever the list happens to be scrolled to.
  assert.strictEqual(
    MMSheet.classifyGesture({ dx: 0, dy: 60, scrollable: true, scrollTop: 120, fromHandle: true }), 'drag');
});

test('gesture: an upward pull is never a dismissal', () => {
  assert.strictEqual(MMSheet.classifyGesture({ dx: 0, dy: -50, scrollable: true, scrollTop: 0 }), 'scroll');
  assert.strictEqual(MMSheet.classifyGesture({ dx: 0, dy: -50 }), 'scroll');
});

test('gesture: outside a scrollable region a downward pull is a drag', () => {
  // e.g. the fixed title / search zone of the picker sheet.
  assert.strictEqual(MMSheet.classifyGesture({ dx: 0, dy: 30, scrollable: false }), 'drag');
});

test('gesture: malformed input degrades to "pending", never to a dismissal', () => {
  assert.strictEqual(MMSheet.classifyGesture(null), 'pending');
  assert.strictEqual(MMSheet.classifyGesture({ dx: NaN, dy: undefined }), 'pending');
  assert.strictEqual(MMSheet.classifyGesture({ dx: 'x', dy: 'y' }), 'pending');
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2 · Snap resolution — open / collapsed / dismissed
 *
 * Rewritten after real-device testing. The previous model was binary and
 * dismissed past a quarter of the sheet, so an ordinary half-height drag threw
 * the picker away. These pin the three-outcome model that replaced it, and in
 * particular that everything short of a long committed pull is RECOVERABLE.
 * ══════════════════════════════════════════════════════════════════════ */

const H = 600;                                   // a representative sheet height
const snap = (g) => MMSheet.resolveSnap(Object.assign(
  { state: 'open', sheetHeight: H, collapsible: true }, g));

test('snap: a small drag springs back fully open', () => {
  assert.strictEqual(snap({ dy: 20, elapsedMs: 500 }), 'open');
  assert.strictEqual(snap({ dy: 80, elapsedMs: 500 }), 'open');
});

test('snap: THE REPORTED DEFECT — dragging about halfway now collapses, not dismisses', () => {
  // "drag approximately halfway down, release, picker disappears completely"
  // was the complaint. Half of the sheet must land on the peek state.
  assert.strictEqual(snap({ dy: H / 2, elapsedMs: 800 }), 'collapsed');
  // …and a good way past halfway is still recoverable.
  assert.strictEqual(snap({ dy: 320, elapsedMs: 800 }), 'collapsed');
});

test('snap: only a long, committed pull dismisses', () => {
  assert.strictEqual(snap({ dy: 329, elapsedMs: 900 }), 'collapsed');
  assert.strictEqual(snap({ dy: 331, elapsedMs: 900 }), 'dismissed');
  // The dismissal distance is past the midpoint, on purpose.
  assert.ok(MMSheet.SHEET_GESTURE.dismissFraction > 0.5,
    'dismissal must require more than half the sheet');
});

test('snap: a medium drag reaches the collapsed peek', () => {
  assert.strictEqual(snap({ dy: 107, elapsedMs: 600 }), 'open');
  assert.strictEqual(snap({ dy: 109, elapsedMs: 600 }), 'collapsed');
});

test('snap: a quick flick tucks the sheet away rather than throwing it away', () => {
  // Fast but short — the forgiving reading is the recoverable one.
  assert.strictEqual(snap({ dy: 60, elapsedMs: 60 }), 'collapsed');
  assert.strictEqual(snap({ dy: 120, elapsedMs: 100 }), 'collapsed');
  // Fast AND far is a deliberate throw.
  assert.strictEqual(snap({ dy: 250, elapsedMs: 180 }), 'dismissed');
});

test('snap: velocity can never dismiss on its own', () => {
  // A tiny fast twitch is a tap with a jittery finger, not a gesture.
  assert.strictEqual(snap({ dy: 10, elapsedMs: 5 }), 'open');
  assert.strictEqual(snap({ dy: 39, elapsedMs: 20 }), 'open');
});

test('snap: upward from open does nothing — the sheet is already at its stop', () => {
  assert.strictEqual(snap({ dy: -200, elapsedMs: 300 }), 'open');
  assert.strictEqual(snap({ dy: -400, elapsedMs: 50 }), 'open');
});

test('snap: from collapsed, a small upward pull re-expands eagerly', () => {
  const c = (g) => MMSheet.resolveSnap(Object.assign(
    { state: 'collapsed', sheetHeight: H, collapsible: true }, g));
  assert.strictEqual(c({ dy: -70, elapsedMs: 400 }), 'open');
  assert.strictEqual(c({ dy: -20, elapsedMs: 400 }), 'collapsed');
  assert.strictEqual(c({ dy: -45, elapsedMs: 60 }), 'open', 'an upward flick expands');
});

test('snap: from collapsed, a shorter downward pull dismisses', () => {
  const c = (g) => MMSheet.resolveSnap(Object.assign(
    { state: 'collapsed', sheetHeight: H, collapsible: true }, g));
  // Intent has already been expressed once, so the sheet gives up sooner —
  // but still not on a twitch.
  assert.strictEqual(c({ dy: 40, elapsedMs: 500 }), 'collapsed');
  assert.strictEqual(c({ dy: 140, elapsedMs: 500 }), 'dismissed');
});

test('snap: a non-collapsible sheet keeps the two-outcome model', () => {
  const d = (g) => MMSheet.resolveSnap(Object.assign(
    { state: 'open', sheetHeight: H, collapsible: false }, g));
  assert.strictEqual(d({ dy: 200, elapsedMs: 600 }), 'open', 'never collapses');
  assert.strictEqual(d({ dy: 400, elapsedMs: 600 }), 'dismissed');
  // A destructive confirm must not acquire a peek state by accident.
  const wk = read('workout.html');
  for (const id of ['finishModal', 'discardModal', 'customEditModal', 'customConfirmModal']) {
    const call = new RegExp("MMSheet\\.open\\(document\\.getElementById\\('" + id + "'\\)([\\s\\S]{0,200}?)\\);");
    const m = wk.match(call);
    assert.ok(m, id + ' opens through the primitive');
    assert.ok(!/collapsible/.test(m[1]), id + ' must not be collapsible');
  }
});

test('snap: thresholds scale with the sheet but never below their floors', () => {
  const tiny = (g) => MMSheet.resolveSnap(Object.assign(
    { state: 'open', sheetHeight: 120, collapsible: true }, g));
  const G = MMSheet.SHEET_GESTURE;
  // On a short sheet the fractions would be trivially small, so the px floors
  // take over and a real pull is still required.
  assert.strictEqual(tiny({ dy: G.collapseMinPx - 2, elapsedMs: 600 }), 'open');
  assert.strictEqual(tiny({ dy: G.collapseMinPx + 2, elapsedMs: 600 }), 'collapsed');
  assert.strictEqual(tiny({ dy: G.dismissMinPx + 2, elapsedMs: 600 }), 'dismissed');
});

test('snap: malformed input resolves to the safe state, never dismissal', () => {
  assert.strictEqual(MMSheet.resolveSnap(null), 'open');
  assert.strictEqual(MMSheet.resolveSnap({}), 'open');
  assert.strictEqual(snap({ dy: NaN, elapsedMs: NaN }), 'open');
});

test('collapsed offset leaves a usable peek of the sheet on screen', () => {
  const off = MMSheet.collapsedOffset(H);
  assert.ok(off > 0 && off < H, 'the sheet is partly hidden, not gone');
  const visible = H - off;
  assert.ok(visible >= 150, `only ${visible}px would remain — too little to grab or read`);
  assert.ok(off / H >= 0.5, 'most of the viewport is given back to the workout underneath');
  assert.strictEqual(MMSheet.collapsedOffset(0), 0, 'degrades safely with no height');
});

test('drag offset is absolute — a drag from the peek walks back toward open', () => {
  const off = MMSheet.collapsedOffset(H);
  assert.strictEqual(MMSheet.dragOffset(120), 120, 'from open, unchanged');
  assert.strictEqual(MMSheet.dragOffset(50, { base: off }), off + 50, 'from the peek, downward');
  assert.strictEqual(MMSheet.dragOffset(-100, { base: off }), off - 100, 'from the peek, upward');
  assert.strictEqual(MMSheet.dragOffset(-9999, { base: off }), 0,
    'never above the fully-open position');
  assert.strictEqual(MMSheet.dragOffset(-80), 0, 'and never above it from open either');
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3 · Scroll-lock bookkeeping
 * ══════════════════════════════════════════════════════════════════════ */

test('scroll lock: only the first acquire freezes and the last releases', () => {
  const l = MMSheet.createLockCounter();
  assert.strictEqual(l.acquire(500), true, 'first lock freezes the page');
  assert.strictEqual(l.acquire(0), false, 'a stacked dialog does not re-freeze');
  assert.strictEqual(l.release().released, false, 'closing the inner dialog keeps the page frozen');
  assert.strictEqual(l.release().released, true, 'the last close releases it');
});

test('scroll lock: the restored position belongs to the FIRST lock', () => {
  // The bug this prevents: the second dialog captures an already-frozen page,
  // reads scrollY as 0, and returns the user to the top when everything closes.
  const l = MMSheet.createLockCounter();
  l.acquire(742);
  l.acquire(0);
  l.release();
  assert.strictEqual(l.release().y, 742, 'the user is returned exactly where they were');
});

test('scroll lock: an unbalanced release cannot drive the depth negative', () => {
  const l = MMSheet.createLockCounter();
  assert.strictEqual(l.release().released, false);
  assert.strictEqual(l.depth(), 0);
  // A page left in this state must still be lockable.
  assert.strictEqual(l.acquire(10), true);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4 · Focus ring
 * ══════════════════════════════════════════════════════════════════════ */

test('focus trap: Tab wraps forwards and backwards inside the dialog', () => {
  assert.strictEqual(MMSheet.nextFocusIndex(3, 2, false), 0, 'last -> first');
  assert.strictEqual(MMSheet.nextFocusIndex(3, 0, true), 2, 'first -> last (shift)');
  assert.strictEqual(MMSheet.nextFocusIndex(3, 0, false), 1);
  assert.strictEqual(MMSheet.nextFocusIndex(3, 2, true), 1);
});

test('focus trap: focus outside the ring is pulled back into it', () => {
  assert.strictEqual(MMSheet.nextFocusIndex(3, -1, false), 0);
  assert.strictEqual(MMSheet.nextFocusIndex(3, -1, true), 2);
});

test('focus trap: an empty dialog cannot produce a bogus index', () => {
  assert.strictEqual(MMSheet.nextFocusIndex(0, 0, false), -1);
});

test('focus: the focusable set is explicit, so page wrappers never become tab stops', () => {
  assert.ok(MMSheet.FOCUSABLE.includes('button:not([disabled])'));
  assert.ok(MMSheet.FOCUSABLE.includes('[tabindex]:not([tabindex="-1"])'));
  assert.ok(!/\*/.test(MMSheet.FOCUSABLE), 'no wildcard selector');
});

/* ══════════════════════════════════════════════════════════════════════════
 * 5 · Module hygiene
 * ══════════════════════════════════════════════════════════════════════ */

test('module: it is pure infrastructure — no network, storage or user data', () => {
  const code = SHEET_JS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  for (const forbidden of ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage',
    'supabase', 'serviceWorker', 'caches.']) {
    assert.ok(!code.includes(forbidden), `mm-sheet.js must not reference ${forbidden}`);
  }
});

test('module: every gesture constant is a named weight, not an inline literal', () => {
  for (const k of ['intentSlop', 'verticalRatio', 'dismissFraction', 'dismissMinPx',
    'flickVelocity', 'flickMinPx', 'maxUpwardPx']) {
    assert.strictEqual(typeof G[k], 'number', `${k} is a named, tunable weight`);
  }
});

test('module: it exports both halves and loads in a browser without module', () => {
  for (const fn of ['open', 'close', 'isOpen', 'classifyGesture', 'resolveSnap',
    'collapsedOffset', 'sheetState', 'setState']) {
    assert.strictEqual(typeof MMSheet[fn], 'function', `${fn} is exported`);
  }
  assert.match(SHEET_JS, /if \(typeof module !== 'undefined' && module\.exports\)/,
    'the Node export is guarded, as in every other shared core');
  assert.match(SHEET_JS, /if \(global\) global\.MMSheet = MMSheet;/, 'browser global');
});

/* ══════════════════════════════════════════════════════════════════════════
 * 6 · CSS contract
 * ══════════════════════════════════════════════════════════════════════ */

test('css: the scroll lock freezes the body rather than setting overflow alone', () => {
  const lock = (SHEET_CSS.match(/body\.mm-sheet-lock\s*\{([^}]*)\}/) || [])[1];
  assert.ok(lock, 'the lock rule exists');
  assert.match(lock, /position:\s*fixed/,
    'overflow:hidden alone does not stop scrolling in Mobile Safari');
  assert.ok(!/top:/.test(lock), 'top is supplied inline by the script (the captured offset)');
  assert.match(SHEET_JS, /body\.style\.top = '-' \+ lock\.savedY\(\) \+ 'px'/);
  assert.match(SHEET_JS, /win\.scrollTo\(\{ top: out\.y, left: 0, behavior: 'instant' \}\)/,
    'and the position is restored on release');
  // `behavior: instant` is required, not cosmetic: the public pages set
  // `scroll-behavior: smooth` on the root, which the two-argument scrollTo()
  // inherits — so the restore ANIMATED instead of simply being correct, and
  // showed motion to a reduced-motion user. Found by browser validation.
  assert.match(SHEET_JS, /try \{ win\.scrollTo\(0, out\.y\); \} catch \(e2\)/,
    'with a two-argument fallback for engines without the options form');
});

test('css: scrollable regions contain their overscroll', () => {
  const s = (SHEET_CSS.match(/\.mm-sheet-scroll\s*\{([^}]*)\}/) || [])[1];
  assert.match(s, /overscroll-behavior:\s*contain/,
    'a flick at the end of the list must not chain to the page behind it');
});

test('css: the drag handle is a real target, not 4px of decoration', () => {
  const h = (SHEET_CSS.match(/\.mm-sheet-handle\s*\{([^}]*)\}/) || [])[1];
  assert.match(h, /touch-action:\s*none/, 'the compositor must not start its own scroll here');
  const before = (SHEET_CSS.match(/\.mm-sheet-handle::before\s*\{([^}]*)\}/) || [])[1];
  assert.ok(before, 'an expanded catch area exists');
  const top = Math.abs(Number((before.match(/top:\s*(-?\d+)px/) || [])[1]));
  const bottom = Math.abs(Number((before.match(/bottom:\s*(-?\d+)px/) || [])[1]));
  const height = Number((h.match(/height:\s*(\d+)px/) || [])[1]);
  assert.ok(top + bottom + height >= 44,
    `handle catch area is ${top + bottom + height}px — must be at least 44px`);
});

test('css: the primitive carries no palette, so it is safe on public pages', () => {
  // app-shell.css owns the application palette and the sticky header; loading it
  // on store.html would restyle that page's own 68px header.
  assert.ok(!/^:root\s*\{/m.test(SHEET_CSS), 'declares no tokens of its own');
  assert.ok(!/(^|\n)header\s*\{/.test(SHEET_CSS), 'never styles the page header');
  // Every colour it does use has a literal fallback for a page without the shell.
  for (const m of SHEET_CSS.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
    assert.strictEqual(m[2], ',', `${m[1]} must carry a fallback value`);
  }
});

/* ══════════════════════════════════════════════════════════════════════════
 * 7 · Consumer contract — the primitive is actually used
 * ══════════════════════════════════════════════════════════════════════ */

// Every page/module that hosts an overlay, and whether it loads the primitive.
const CONSUMERS = [
  { file: 'workout.html', page: true },
  { file: 'nutrition.html', page: true },
  { file: 'app.html', page: true },
  { file: 'weight-history.html', page: true },
  { file: 'profile.html', page: true },
  { file: 'store.html', page: true },
  { file: 'nutrition.js', page: false },
  { file: 'weight.js', page: false },
  { file: 'metrics.js', page: false },
];

test('consumers: every page hosting an overlay loads the primitive, script and CSS', () => {
  for (const c of CONSUMERS.filter((x) => x.page)) {
    const src = read(c.file);
    assert.match(src, /<script src="mm-sheet\.js" defer><\/script>/, `${c.file} loads mm-sheet.js`);
    assert.match(src, /<link rel="stylesheet" href="mm-sheet\.css">/, `${c.file} loads mm-sheet.css`);
  }
});

test('consumers: no overlay toggles the open class behind the primitive\'s back', () => {
  // The primitive owns the scroll lock and the focus ring; a direct class toggle
  // would open a dialog with neither, which is exactly the state 4.3.5C removed.
  const EXEMPT = {
    // Transient PR celebration — deliberately not a dialog. See workout.html.
    'workout.html': ["getElementById('prModal').classList.add('open')",
                     "getElementById('prModal').classList.remove('open')"],
    // The responsive site menu is not a dialog; 4.3.5I owns it.
    'store.html': ["mobileNav.classList.toggle('open')", "mobileNav.classList.remove('open')"],
  };
  for (const c of CONSUMERS) {
    const src = read(c.file);
    const hits = (src.match(/[\w.'()\[\]]*\.classList\.(add|remove|toggle)\('open'\)/g) || [])
      .filter((h) => !(EXEMPT[c.file] || []).some((e) => e.endsWith(h) || h.endsWith(e.split('.').pop())));
    const unexpected = hits.filter((h) => !(EXEMPT[c.file] || []).some((e) => e.includes(h)));
    assert.deepStrictEqual(unexpected, [],
      `${c.file} still toggles .open directly: ${unexpected.join(', ')}`);
  }
});

test('consumers: no overlay keeps its own inline backdrop-dismiss handler', () => {
  for (const c of CONSUMERS) {
    const src = read(c.file);
    // The one documented exception is #prModal, whose whole surface dismisses.
    const inline = (src.match(/<div class="(?:modal-)?overlay" id="(\w+)"[^>]*onclick=/g) || [])
      .filter((m) => !m.includes('prModal'));
    assert.deepStrictEqual(inline, [], `${c.file} has an un-migrated inline backdrop handler`);
  }
});

test('consumers: the picker is the one bottom SHEET; confirmations are dialogs', () => {
  const wk = read('workout.html');
  // A destructive confirm must be dismissed deliberately — never by a stray
  // downward swipe — so it is opened as a dialog with no gesture handling.
  assert.match(wk, /MMSheet\.open\(document\.getElementById\('pickerModal'\), \{\s*\n\s*variant: 'sheet'/);
  // Comments mention the option; only real call sites count.
  const wkCode = wk.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
  const sheetVariants = (wkCode.match(/variant: 'sheet'/g) || []).length;
  assert.strictEqual(sheetVariants, 1, 'exactly one sheet-variant consumer on workout.html');
  for (const id of ['finishModal', 'discardModal', 'customEditModal', 'customConfirmModal']) {
    const call = new RegExp("MMSheet\\.open\\(document\\.getElementById\\('" + id + "'\\)([\\s\\S]{0,160}?)\\);");
    const m = wk.match(call);
    assert.ok(m, `${id} opens through the primitive`);
    assert.ok(!/variant:\s*'sheet'/.test(m[1]), `${id} is a dialog, not a swipeable sheet`);
  }
});

test('consumers: the picker list and filter panel carry the scroll contract', () => {
  const wk = read('workout.html');
  assert.match(wk, /class="picker-list mm-sheet-scroll"/);
  assert.match(wk, /class="filter-panel mm-sheet-scroll"/);
  assert.match(wk, /class="mm-sheet-handle"/, 'and the sheet has a real drag handle');
  assert.ok(!/class="picker-drag"/.test(wk), 'the decorative handle is gone');
});

test('consumers: the shipped bottom-control contracts are untouched', () => {
  // The SW update banner and the PWA install sheet find the nav through these.
  assert.match(read('app-nav.js'), /data-mm-sw-bottom-control/);
  assert.match(read('app-shell.css'), /--mm-bottom-clearance:\s*calc\(var\(--mm-nav-base-height\)/);
  assert.match(read('app-shell.css'), /:root\.mm-has-nav\s*\{[^}]*--mm-nav-base-height:\s*64px/);
  // …and the primitive never touches them. Its header comment documents the
  // contract it must not break, so comments are stripped before checking.
  const primitive = (SHEET_CSS + SHEET_JS)
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
  assert.ok(!/--mm-nav-base-height|--mm-bottom-clearance|data-mm-sw-bottom-control/.test(primitive),
    'the overlay primitive does not participate in bottom-clearance');
});

/* ══════════════════════════════════════════════════════════════════════════
 * 8 · Collapsed / peek state (Phase 4.3.5 real-device follow-up)
 *
 * The picker needed a way to be temporarily lowered so the workout underneath
 * is readable — "which exercises did I already add?" — without losing the
 * selection context. These pin that it is OPT-IN, that the background stays
 * protected while becoming visible, and that it cannot undo earlier phases.
 * ══════════════════════════════════════════════════════════════════════ */

const SHEET_SRC = read('mm-sheet.js');
const SHEET_STYLES = read('mm-sheet.css');

test('collapse: only a consumer that opts in gets a peek state', () => {
  assert.match(SHEET_SRC, /var next = \(state === 'collapsed' && r\.opts\.collapsible\) \? 'collapsed' : 'open';/,
    'a non-collapsible sheet can never be put into the collapsed state');
  // Exactly one consumer opts in today, and it is the picker.
  const wk = read('workout.html').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
  const optIns = (wk.match(/collapsible:\s*true/g) || []).length;
  assert.strictEqual(optIns, 1, 'exactly one collapsible consumer');
  assert.match(wk, /getElementById\('pickerModal'\)[\s\S]{0,200}?collapsible:\s*true/,
    'and it is the exercise picker');
});

test('collapse: the workout underneath becomes VISIBLE', () => {
  const rule = (SHEET_STYLES.match(/\[data-mm-sheet-state="collapsed"\]\s*\{([^}]*)\}/) || [])[1];
  assert.ok(rule, 'the collapsed state has a style');
  assert.match(rule, /background:\s*transparent/, 'the backdrop stops obscuring the page');
  assert.match(rule, /backdrop-filter:\s*none/, 'and stops blurring it');
});

test('collapse: the background stays protected — 4.3.5D is not undone', () => {
  // The overlay keeps its full inset and keeps intercepting, and the body lock
  // is untouched by a state change. Visible is not the same as interactive.
  const rule = (SHEET_STYLES.match(/\[data-mm-sheet-state="collapsed"\]\s*\{([^}]*)\}/) || [])[1];
  assert.ok(!/pointer-events/.test(rule),
    'the collapsed backdrop must keep intercepting pointer events');
  assert.ok(!/inset|position|display/.test(rule),
    'it must keep covering the viewport');
  // setSheetState touches transform and the attribute only — never the lock.
  const fn = SHEET_SRC.match(/function setSheetState\(r, state, animate\)[\s\S]*?\n  \}/)[0];
  for (const forbidden of ['applyLock', 'releaseLock', 'scrollTo', 'LOCK_CLASS']) {
    assert.ok(!fn.includes(forbidden),
      `changing sheet state must not touch ${forbidden} — the builder's scroll position must survive`);
  }
});

test('collapse: the peek is not a scroll surface', () => {
  assert.match(SHEET_STYLES,
    /\[data-mm-sheet-state="collapsed"\] \.mm-sheet-scroll\s*\{[^}]*overflow-y:\s*hidden/);
  // …and the gesture layer agrees: while collapsed every vertical gesture is
  // the sheet's, so a pull cannot be swallowed by a two-row list.
  assert.strictEqual(
    MMSheet.classifyGesture({ dx: 0, dy: 40, scrollable: true, scrollTop: 200, state: 'collapsed' }),
    'drag');
});

test('collapse: focus entering a collapsed sheet expands it first', () => {
  // THE CARET GUARD. The collapsed state is a transform, and Phase 4.3.5B
  // established that WebKit paints a caret from the untransformed box. Letting
  // a text field take focus inside a translated panel would reintroduce exactly
  // the bug that phase removed.
  assert.match(SHEET_SRC, /r\.onPanelFocusIn = function \(\) \{\s*\n\s*if \(r\.state === 'collapsed'\) setSheetState\(r, 'open', true\);/);
  assert.match(SHEET_SRC, /el\.addEventListener\('focusin', r\.onPanelFocusIn\)/);
  assert.match(SHEET_SRC, /el\.removeEventListener\('focusin', r\.onPanelFocusIn\)/);
  // And the fully-open state carries no transform at all.
  assert.match(SHEET_SRC, /r\.panel\.style\.transform = '';/);
});

test('collapse: there is a non-gesture way to reach and leave the peek', () => {
  // Roadmap §2.6 — every gesture owes an accessible alternative.
  assert.match(SHEET_SRC, /h\.addEventListener\('click', r\.onHandleClick\)/,
    'the handle is clickable, not drag-only');
  assert.match(SHEET_SRC, /function toggleCollapsed\(r\)/);
  assert.match(read('workout.html'), /<button type="button" class="mm-sheet-handle"/,
    'the handle is a real button element');
  assert.match(SHEET_STYLES, /button\.mm-sheet-handle\s*\{/, 'and is styled as a handle, not a button');
  assert.match(SHEET_STYLES, /\.mm-sheet-handle:focus-visible/, 'with a visible focus ring');
});

test('collapse: the handle announces which action it offers', () => {
  assert.match(SHEET_SRC, /h\.setAttribute\('aria-expanded', collapsed \? 'false' : 'true'\)/);
  assert.match(SHEET_SRC, /aria-label', collapsed \? 'Expand exercise picker' : 'Collapse exercise picker'/);
  assert.match(SHEET_SRC, /function syncHandleLabel\(r\)/);
});

test('collapse: reduced motion removes the animation, not the state change', () => {
  const fn = SHEET_SRC.match(/function setSheetState\(r, state, animate\)[\s\S]*?\n  \}/)[0];
  assert.match(fn, /var reduce = prefersReducedMotion\(\);/);
  assert.match(fn, /\(animate && !reduce\) \? 'transform 0\.22s ease' : 'none'/);
  assert.match(SHEET_SRC, /prefers-reduced-motion: reduce/);
});

test('collapse: every sheet starts fully open and the state is torn down on close', () => {
  assert.match(SHEET_SRC, /r\.state = 'open';\s*\n\s*el\.setAttribute\(STATE_ATTR, 'open'\)/);
  assert.match(SHEET_SRC, /el\.removeAttribute\(STATE_ATTR\)/);
  assert.match(SHEET_SRC, /r\.panel\.style\.transition = '';/, 'the transition is cleared too');
});
