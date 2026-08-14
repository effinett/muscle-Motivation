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
 * 2 · Dismissal threshold
 * ══════════════════════════════════════════════════════════════════════ */

test('dismiss: a short pull springs back', () => {
  assert.strictEqual(MMSheet.shouldDismiss({ dy: 20, elapsedMs: 400, sheetHeight: 600 }), false);
});

test('dismiss: a pull past a quarter of the sheet closes it', () => {
  assert.strictEqual(MMSheet.shouldDismiss({ dy: 149, elapsedMs: 800, sheetHeight: 600 }), false);
  assert.strictEqual(MMSheet.shouldDismiss({ dy: 151, elapsedMs: 800, sheetHeight: 600 }), true);
});

test('dismiss: the threshold is proportional but never below the floor', () => {
  // A 120px confirm dialog would otherwise dismiss after a 30px twitch.
  assert.strictEqual(MMSheet.shouldDismiss({ dy: 40, elapsedMs: 900, sheetHeight: 120 }), false);
  assert.strictEqual(MMSheet.shouldDismiss({ dy: G.dismissMinPx + 1, elapsedMs: 900, sheetHeight: 120 }), true);
});

test('dismiss: a fast flick closes below the distance threshold', () => {
  // 60px in 60ms = 1 px/ms — decisively a flick.
  assert.strictEqual(MMSheet.shouldDismiss({ dy: 60, elapsedMs: 60, sheetHeight: 600 }), true);
  // The same distance taken slowly is a hesitant drag and springs back.
  assert.strictEqual(MMSheet.shouldDismiss({ dy: 60, elapsedMs: 900, sheetHeight: 600 }), false);
});

test('dismiss: a fast but tiny movement is a tap, not a flick', () => {
  assert.strictEqual(MMSheet.shouldDismiss({ dy: 10, elapsedMs: 5, sheetHeight: 600 }), false);
});

test('dismiss: an upward drag never closes, at any speed', () => {
  assert.strictEqual(MMSheet.shouldDismiss({ dy: -400, elapsedMs: 50, sheetHeight: 600 }), false);
});

test('drag offset: the sheet cannot be pulled up out of position', () => {
  assert.strictEqual(MMSheet.dragOffset(120), 120);
  assert.strictEqual(MMSheet.dragOffset(-80), 0);
  assert.strictEqual(MMSheet.dragOffset('nonsense'), 0);
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
  for (const fn of ['open', 'close', 'isOpen', 'classifyGesture', 'shouldDismiss']) {
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
