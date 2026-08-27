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
 * 2 · Snap resolution — open or dismissed
 *
 * Two resting states, and the threshold has now been set three times, so these
 * pin BOTH failure modes it sits between:
 *   v1 dismissed past a quarter of the sheet — stray pulls threw the picker away.
 *   v2 added a persistent peek — closing then took two gestures.
 * The contract is: pull down to look, let go early and it returns, pull far
 * enough and it goes away. One gesture, either way.
 * ══════════════════════════════════════════════════════════════════════ */

const H = 650;                                   // a representative sheet height
const snap = (g) => MMSheet.resolveSnap(Object.assign({ sheetHeight: H }, g));

test('snap: a short drag returns the sheet fully open', () => {
  assert.strictEqual(snap({ dy: 20, elapsedMs: 500 }), 'open');
  assert.strictEqual(snap({ dy: 80, elapsedMs: 500 }), 'open');
});

test('snap: a MEDIUM drag also returns open — never a half-collapsed rest', () => {
  // The v2 regression: this range used to settle at a peek and needed a second
  // swipe to close. Releasing here must put the sheet back where it started.
  assert.strictEqual(snap({ dy: 150, elapsedMs: 700 }), 'open');
  assert.strictEqual(snap({ dy: 200, elapsedMs: 800 }), 'open');
  assert.strictEqual(snap({ dy: 246, elapsedMs: 900 }), 'open');
});

test('snap: one deliberate downward drag dismisses', () => {
  assert.strictEqual(snap({ dy: 248, elapsedMs: 900 }), 'dismissed');
  assert.strictEqual(snap({ dy: 400, elapsedMs: 900 }), 'dismissed');
});

test('snap: the threshold sits between the two known failures', () => {
  const G = MMSheet.SHEET_GESTURE;
  assert.ok(G.dismissFraction > 0.25, 'not as eager as v1, which dismissed on stray pulls');
  assert.ok(G.dismissFraction < 0.55, 'not as reluctant as v2, which needed two gestures');
});

test('snap: a fast swipe with real travel dismisses', () => {
  assert.strictEqual(snap({ dy: 290, elapsedMs: 900 }), 'dismissed', 'distance alone suffices');
  assert.strictEqual(snap({ dy: 120, elapsedMs: 80 }), 'dismissed', 'fast, and far enough');
});

test('snap: a CONTROLLED sub-threshold pull returns open, however brisk', () => {
  // The contract is "release before the threshold and it comes back". A drag
  // being merely purposeful must not smuggle itself through the flick path —
  // at the earlier 0.6px/ms bar, a 180px pull in 300ms dismissed.
  assert.strictEqual(snap({ dy: 180, elapsedMs: 300 }), 'open', '0.60 px/ms is a drag');
  assert.strictEqual(snap({ dy: 240, elapsedMs: 500 }), 'open', '0.48 px/ms is a drag');
  assert.ok(MMSheet.SHEET_GESTURE.flickVelocity >= 1.2,
    'the flick bar sits above any controlled drag speed');
});

test('snap: a tiny fast flick can NEVER dismiss', () => {
  // Velocity is a second route to the same verdict, not a shortcut past it.
  assert.strictEqual(snap({ dy: 30, elapsedMs: 30 }), 'open');
  assert.strictEqual(snap({ dy: 60, elapsedMs: 40 }), 'open');
  assert.strictEqual(snap({ dy: MMSheet.SHEET_GESTURE.flickMinPx - 1, elapsedMs: 10 }), 'open');
  assert.ok(MMSheet.SHEET_GESTURE.flickMinPx >= 90,
    'a flick must carry real travel before velocity counts');
});

test('snap: upward movement is never a dismissal', () => {
  assert.strictEqual(snap({ dy: -300, elapsedMs: 400 }), 'open');
  assert.strictEqual(snap({ dy: -50, elapsedMs: 30 }), 'open');
});

test('snap: the threshold scales with the sheet but keeps a px floor', () => {
  const G = MMSheet.SHEET_GESTURE;
  const tiny = (g) => MMSheet.resolveSnap(Object.assign({ sheetHeight: 120 }, g));
  assert.strictEqual(tiny({ dy: G.dismissMinPx - 2, elapsedMs: 800 }), 'open');
  assert.strictEqual(tiny({ dy: G.dismissMinPx + 2, elapsedMs: 800 }), 'dismissed');
});

test('snap: malformed input resolves to open, never to a dismissal', () => {
  assert.strictEqual(MMSheet.resolveSnap(null), 'open');
  assert.strictEqual(MMSheet.resolveSnap({}), 'open');
  assert.strictEqual(snap({ dy: NaN, elapsedMs: NaN }), 'open');
});

test('snap: there is no third resting state anywhere in the verdict', () => {
  const seen = new Set();
  for (const dy of [-200, -10, 0, 5, 40, 90, 150, 246, 248, 300, 900]) {
    for (const ms of [10, 60, 200, 500, 1500]) seen.add(snap({ dy, elapsedMs: ms }));
  }
  assert.deepStrictEqual([...seen].sort(), ['dismissed', 'open']);
});

test('drag offset never lets the sheet rise above its open position', () => {
  assert.strictEqual(MMSheet.dragOffset(120), 120);
  assert.strictEqual(MMSheet.dragOffset(-80), 0);
  assert.strictEqual(MMSheet.dragOffset('nonsense'), 0);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2b · Transient drag preview
 *
 * The one thing worth keeping from the persistent peek: you can see the workout
 * underneath while you pull. It lives only for the duration of the gesture.
 * ══════════════════════════════════════════════════════════════════════ */

test('preview: the backdrop clears in step with the pull', () => {
  assert.strictEqual(MMSheet.dragProgress(0, H), 0, 'untouched at rest');
  const mid = MMSheet.dragProgress(124, H);
  assert.ok(mid > 0.4 && mid < 0.6, `half-way through the pull reads ${mid}`);
  assert.strictEqual(MMSheet.dragProgress(400, H), 1, 'clamped');
  assert.strictEqual(MMSheet.dragProgress(-50, H), 0, 'upward reveals nothing');
});

test('preview: the backdrop is fully clear exactly at the dismiss threshold', () => {
  // The reveal doubles as a readout of the threshold: when you can see the
  // workout, letting go will close the sheet.
  const G = MMSheet.SHEET_GESTURE;
  const threshold = Math.max(G.dismissMinPx, H * G.dismissFraction);
  assert.strictEqual(MMSheet.dragProgress(threshold, H), 1);
  assert.ok(MMSheet.dragProgress(threshold - 20, H) < 1);
});

test('preview: fading preserves the page\'s own backdrop colour', () => {
  // The primitive hard-codes no palette — it reduces the alpha of whatever the
  // consumer\'s CSS produced.
  assert.strictEqual(MMSheet.fadeBackdrop('rgba(0, 0, 0, 0.82)', 0), 'rgba(0, 0, 0, 0.820)');
  assert.strictEqual(MMSheet.fadeBackdrop('rgba(0, 0, 0, 0.82)', 1), 'rgba(0, 0, 0, 0.000)');
  assert.strictEqual(MMSheet.fadeBackdrop('rgba(20, 10, 10, 0.9)', 0.5), 'rgba(20, 10, 10, 0.450)');
  assert.strictEqual(MMSheet.fadeBackdrop('rgb(10, 20, 30)', 0.5), 'rgba(10, 20, 30, 0.500)');
});

test('preview: an unreadable backdrop is left alone rather than guessed at', () => {
  assert.strictEqual(MMSheet.fadeBackdrop('oklch(0.2 0 0)', 0.5), null);
  assert.strictEqual(MMSheet.fadeBackdrop('transparent', 0.5), null);
  assert.strictEqual(MMSheet.fadeBackdrop('rgba(0, 0, 0, 0)', 0.5), null);
  assert.strictEqual(MMSheet.fadeBackdrop(null, 0.5), null);
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
    'dragProgress', 'fadeBackdrop', 'dragOffset']) {
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

test('consumers: browsing surfaces are SHEETS; confirmations are dialogs', () => {
  const wk = read('workout.html');
  // The invariant is about CONSEQUENCE, not count. A surface may be swipe-
  // dismissible only when dismissing it costs the user nothing: the picker
  // (Phase 4.3.5C) selects nothing until a row is tapped, and the exercise
  // detail sheet (Phase 4.3.6H) is read-only and holds no input at all. A
  // destructive confirm must be dismissed deliberately — never by a stray
  // downward swipe — so it stays a dialog with no gesture handling.
  const SWIPEABLE = ['pickerModal', 'exerciseDetailModal', 'exerciseSwapModal'];
  const DELIBERATE = ['finishModal', 'discardModal', 'customEditModal', 'customConfirmModal'];

  // Comments mention the option; only real call sites count.
  const wkCode = wk.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
  const sheetVariants = (wkCode.match(/variant: 'sheet'/g) || []).length;
  assert.strictEqual(sheetVariants, SWIPEABLE.length,
    'every sheet-variant consumer on workout.html is accounted for below');

  for (const id of SWIPEABLE) {
    // Anchored on the options-object head rather than the closing paren: these
    // calls carry callbacks whose own `);` would end a lazy match early.
    const call = new RegExp("MMSheet\\.open\\(document\\.getElementById\\('" + id +
      "'\\),\\s*\\{[\\s\\S]{0,120}?variant:\\s*'sheet'");
    assert.match(wkCode, call, `${id} is a swipe-dismissible browsing sheet`);
  }
  for (const id of DELIBERATE) {
    const call = new RegExp("MMSheet\\.open\\(document\\.getElementById\\('" + id + "'\\)([\\s\\S]{0,160}?)\\);");
    const m = wk.match(call);
    assert.ok(m, `${id} opens through the primitive`);
    assert.ok(!/variant:\s*'sheet'/.test(m[1]), `${id} is a dialog, not a swipeable sheet`);
  }

  // A swipeable surface must not be able to lose typed input. The detail and
  // swap sheets earn their gesture by holding no editable control whatsoever —
  // dismissing either discards nothing, because neither has committed anything.
  [['exerciseDetailModal', 'detail'], ['exerciseSwapModal', 'swap']].forEach(([id, label]) => {
    const m = wk.match(new RegExp('<div class="overlay" id="' + id + '">([\\s\\S]*?)\\n</div>\\n'));
    assert.ok(m, label + ' modal markup located');
    assert.ok(!/<input|<textarea|<form|contenteditable/i.test(m[1]),
      'the ' + label + ' sheet holds no input, so a swipe dismissal can never discard user data');
  });
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
 * 8 · Transient preview, and the absence of a persistent peek
 *
 * The persistent collapsed state shipped, was tested on device, and was removed
 * because it made closing the picker take two gestures. These pin that it is
 * genuinely gone — not merely unused — and that what replaced it preserves
 * every guarantee it was built to protect.
 * ══════════════════════════════════════════════════════════════════════ */

const SHEET_SRC = read('mm-sheet.js');
const SHEET_STYLES = read('mm-sheet.css');
const WORKOUT_SRC = read('workout.html');

test('no persistent collapsed state survives anywhere', () => {
  const code = SHEET_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
  for (const gone of ['collapsible', 'setSheetState', 'toggleCollapsed', 'syncHandleLabel',
    'collapsedOffset', 'STATE_ATTR', 'onPanelFocusIn', 'onHandleClick']) {
    assert.ok(!code.includes(gone), `${gone} is machinery for a state that no longer exists`);
  }
  assert.ok(!/data-mm-sheet-state/.test(SHEET_STYLES), 'no collapsed styling remains');
  assert.ok(!/collapsible/.test(WORKOUT_SRC), 'the picker no longer opts into a peek');
});

test('the handle claims no state it no longer has', () => {
  // It was a <button> with aria-expanded while a collapsed state existed.
  // Announcing an expanded/collapsed state now would be a lie.
  assert.ok(!/aria-expanded/.test(SHEET_SRC), 'no aria-expanded is written by the primitive');
  assert.match(WORKOUT_SRC, /<div class="mm-sheet-handle" aria-hidden="true"><\/div>/,
    'the handle is a drag affordance again, not a control');
  assert.ok(!/button\.mm-sheet-handle/.test(SHEET_STYLES), 'and its button styling is gone');
});

test('the non-gesture close is still present and is what the handle defers to', () => {
  // Roadmap §2.6 — the gesture (drag to dismiss) still owes an alternative.
  // Cancel and Escape are both in the accessibility tree; the handle is not.
  assert.match(WORKOUT_SRC, /<button class="btn-picker-close" onclick="closePicker\(\)">Cancel<\/button>/);
  assert.match(SHEET_SRC, /if \(ev\.key === 'Escape'\)/);
  assert.match(WORKOUT_SRC, /aria-hidden="true"><\/div>/, 'the handle is not a phantom tab stop');
});

test('the workout is revealed DURING the drag, and only during it', () => {
  assert.match(SHEET_SRC, /function beginPreview\(r\)/);
  assert.match(SHEET_SRC, /function updatePreview\(r, offset\)/);
  assert.match(SHEET_SRC, /function endPreview\(r\)/);
  // Started when the drag is claimed, ended when the finger lifts — either
  // verdict — so it can never outlive the gesture.
  assert.match(SHEET_SRC, /panel\.setAttribute\(DRAG_ATTR, 'true'\);\s*\n\s*beginPreview\(r\);/);
  assert.match(SHEET_SRC, /endPreview\(r\);\s*\n\s*if \(settled === 'dismissed'\)/);
  assert.match(SHEET_SRC, /updatePreview\(r, offset\);/);
});

test('a drag that does not dismiss springs the sheet back open', () => {
  assert.match(SHEET_SRC, /function snapOpen\(r\)/);
  assert.match(SHEET_SRC, /r\.panel\.style\.transform = '';/);
  assert.match(SHEET_SRC, /snapOpen\(r\);/);
  // …and it is animated unless the user asked for less motion.
  assert.match(SHEET_SRC, /prefersReducedMotion\(\) \? 'none' : 'transform 0\.22s ease'/);
});

test('the preview never touches the scroll lock or any scroll position', () => {
  // The builder must be exactly where it was, before and after a pull.
  for (const fn of ['beginPreview', 'updatePreview', 'endPreview', 'snapOpen']) {
    const body = SHEET_SRC.match(new RegExp('function ' + fn + '\\([^)]*\\)[\\s\\S]*?\\n  \\}'))[0];
    for (const forbidden of ['applyLock', 'releaseLock', 'scrollTo', 'scrollIntoView', 'LOCK_CLASS']) {
      assert.ok(!body.includes(forbidden), `${fn} must not touch ${forbidden}`);
    }
  }
});

test('the background stays non-interactive throughout the drag', () => {
  // Only the backdrop COLOUR changes. The overlay keeps its inset and keeps
  // intercepting, so a revealed workout is still not touchable — 4.3.5D holds.
  const update = SHEET_SRC.match(/function updatePreview\(r, offset\)[\s\S]*?\n  \}/)[0];
  assert.match(update, /r\.el\.style\.backgroundColor = faded;/);
  for (const forbidden of ['pointerEvents', 'display', 'inset', 'position', 'visibility']) {
    assert.ok(!update.includes(forbidden), `the preview must not alter ${forbidden}`);
  }
  assert.match(SHEET_SRC, /el\.style\.backgroundColor = '';/, 'and the colour is restored on close');
});

test('the preview reads the page\'s own backdrop instead of assuming one', () => {
  const begin = SHEET_SRC.match(/function beginPreview\(r\)[\s\S]*?\n  \}/)[0];
  assert.match(begin, /win\.getComputedStyle\(r\.el\)\.backgroundColor/);
  // No colour literal anywhere in the primitive's JS.
  const code = SHEET_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
  assert.ok(!/#[0-9A-Fa-f]{3,8}\b/.test(code), 'mm-sheet.js hard-codes no colour');
});

test('the caret protection survives without the focus guard', () => {
  // The guard existed because a RESTING collapsed state could hold a focused
  // input inside a transformed panel (the WebKit bug 4.3.5B fixed). The panel is
  // now only transformed mid-drag, and claiming a drag already blurs whatever
  // was focused — so the protection is intact by a simpler mechanism.
  assert.match(SHEET_SRC, /doc\.activeElement\.blur\(\)/);
  assert.match(SHEET_SRC,
    /if \(doc\.activeElement && panel\.contains\(doc\.activeElement\)\) \{/);
  // At rest the panel carries no transform at all.
  assert.ok(!/style\.transform = 'translateY/.test(
    SHEET_SRC.replace(/function move\(ev\)[\s\S]*?\n    \}/, '')),
    'only the active drag ever translates the panel');
});
