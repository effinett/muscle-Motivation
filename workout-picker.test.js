// workout-picker.test.js — Phase 4.3.5B/D/E contract for the exercise picker.
//
// The picker is the app's most-used mobile interaction and produced three of
// this phase's reported defects: a caret that did not sit in the search field,
// the workout scrolling behind the open sheet, and rows that appeared selected
// at random while scrolling. Each test below pins the ROOT CAUSE that was fixed,
// so a future edit that reintroduces the mechanism fails here rather than on a
// user's phone.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const PAGE = read('workout.html');
const CSS = (PAGE.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
// Comments describe intent; they are not behaviour, so rule lookups ignore them.
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
const SHELL = read('app-shell.css');
// Phase 4.3.5C moved keyboard avoidance, focus handling and the open sequence
// out of the page and into the shared primitive. These tests follow the
// behaviour to its new home rather than being deleted — the defects they pin
// are the same ones, they are simply now fixed once for every consumer.
const SHEET_JS = read('mm-sheet.js');

function rule(selector) {
  const re = new RegExp('(^|[};])\\s*' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^{}]*)\\}');
  const m = CODE.match(re);
  return m ? m[2] : null;
}

/* ══════════════════════════════════════════════════════════════════════════
 * 4.3.5B — search / input reliability
 * ══════════════════════════════════════════════════════════════════════ */

test('search field: its geometry is fully declared, not inherited from a sibling', () => {
  const input = rule('.picker-search');
  assert.ok(input, '.picker-search is defined');
  assert.match(input, /font-size:\s*16px/,
    'agrees with the shell 16px form-control floor, so the caret box is the same on every pointer type');
  assert.match(input, /line-height:/, 'an explicit line box, not the UA default');
  assert.match(input, /min-height:/, 'its own height');
  assert.match(input, /appearance:\s*none/, 'no UA inner padding offsetting the text from the caret');

  // The row must not size the input for it — that decoupling is what put the
  // caret and the text in different boxes.
  const row = rule('.picker-search-row');
  assert.ok(row, '.picker-search-row is defined');
  assert.ok(!/align-items:\s*stretch/.test(row),
    'the search row no longer stretches the input to the Filters button height');
});

test('search field: it never falls below the iOS auto-zoom threshold', () => {
  // A control under 16px makes Mobile Safari zoom on focus, which desynchronises
  // the visual and layout viewports and makes every subsequent tap land wrong.
  const size = Number((rule('.picker-search').match(/font-size:\s*(\d+)px/) || [])[1]);
  assert.ok(size >= 16, `picker search is ${size}px — must be at least 16px`);
  // And the shell floor that enforces this app-wide is still in place.
  assert.match(SHELL, /font-size:\s*16px\s*!important/);
});

test('search field: iOS text rewriting is disabled on an exercise-name search', () => {
  const tag = (PAGE.match(/<input class="picker-search"[\s\S]*?>/) || [''])[0];
  assert.ok(tag, 'the search input exists');
  for (const attr of ['autocorrect="off"', 'autocapitalize="none"', 'spellcheck="false"', 'autocomplete="off"']) {
    assert.ok(tag.includes(attr), `search field sets ${attr}`);
  }
  assert.ok(tag.includes('aria-label="Search exercises"'), 'still labelled');
  assert.ok(/type="text"/.test(tag),
    'stays type=text — type=search injects a UA clear button into the caret box');
});

test('keyboard avoidance moves the sheet by LAYOUT, never by transform', () => {
  // WebKit paints a caret from the element's untransformed box, so a translated
  // ancestor puts the caret somewhere the text is not.
  const sheet = rule('.picker-sheet');
  assert.ok(sheet, '.picker-sheet is defined');
  assert.ok(!/transform/.test(sheet), 'the sheet declares no transform');
  assert.ok(!/transition:\s*transform/.test(sheet), 'and animates none');
  assert.ok(!/sheet\.style\.transform/.test(PAGE),
    'no script sets a transform on the sheet either');

  // The replacement — now owned by the shared primitive — adjusts the fixed
  // overlay's bottom edge. The ONLY transform it ever writes is the drag
  // offset, which is applied while the sheet is being pulled away and cleared
  // on release, and which blurs any focused field before it starts.
  assert.match(SHEET_JS, /r\.el\.style\.bottom = kb > 24 \? kb \+ 'px' : ''/,
    'keyboard inset is applied as a layout offset on the overlay');
  assert.match(SHEET_JS, /doc\.activeElement\.blur\(\)/,
    'a claimed drag drops the keyboard, so no caret sits inside a transformed panel');
});

test('keyboard avoidance listens to resize only, so page panning cannot move the sheet', () => {
  const bind = (SHEET_JS.match(/function bindViewport\(\)[\s\S]*?\n  \}/) || [''])[0];
  assert.match(bind, /addEventListener\('resize'/, 'resize is the keyboard signal');
  assert.ok(!/addEventListener\('scroll'/.test(SHEET_JS),
    'visualViewport scroll is NOT bound — iOS fires it continuously while typing');

  const unbind = (SHEET_JS.match(/function unbindViewport\(\)[\s\S]*?\n  \}/) || [''])[0];
  assert.match(unbind, /removeEventListener\('resize'/, 'and it is removed on close');
  assert.match(SHEET_JS, /el\.style\.bottom = '';/, 'the inset is cleared on close');
});

test('sheet height stays inside the overlay once the keyboard lifts it', () => {
  const sheet = rule('.picker-sheet');
  assert.match(sheet, /max-height:\s*80vh/, 'the pre-existing desktop cap is the fallback');
  assert.match(sheet, /max-height:\s*min\(80vh,\s*100%\)/,
    'and it never exceeds the space the overlay still occupies');
});

test('focus does not scroll the page behind the sheet', () => {
  // Owned by the primitive since 4.3.5C, so every dialog gets it — not just
  // the picker. Inside a position:fixed overlay there is nothing to scroll to,
  // and the UA's scroll-into-view only ever moved the frozen page underneath.
  assert.match(SHEET_JS, /target\.focus\(\{ preventScroll: true \}\)/,
    'programmatic focus suppresses the UA scroll-into-view');
  assert.match(SHEET_JS, /catch \(e2\) \{ \/\* contained \*\/ \}/,
    'engines without the options argument still get focus');
  assert.match(PAGE, /initialFocus: '#pickerSearch'/, 'the picker asks for its search field');
});

test('both picker entry points share one open sequence', () => {
  // They previously carried separate copies, so a fix to one missed the other.
  assert.match(PAGE, /function openPickerFor\(mode\)/);
  assert.match(PAGE, /function openPicker\(\)\s*\{\s*openPickerFor\('workout'\);\s*\}/);
  assert.match(PAGE, /function openTemplatePicker\(\)\s*\{\s*openPickerFor\('template'\);\s*\}/);
  const opens = (PAGE.match(/MMSheet\.open\(document\.getElementById\('pickerModal'\)/g) || []);
  assert.strictEqual(opens.length, 1, 'exactly one place opens the picker overlay');
  assert.ok(!/getElementById\('pickerModal'\)\.classList/.test(PAGE),
    'and it never toggles the class directly, which would skip the scroll lock');
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4.3.5D — scroll isolation
 *
 * The mechanism lives in the shared primitive (mm-sheet.test.js covers the
 * lock bookkeeping and the gesture verdicts). What is pinned HERE is that the
 * picker actually opts into it, because a missing class is a silent regression.
 * ══════════════════════════════════════════════════════════════════════ */

test('scroll isolation: opening the picker freezes the workout behind it', () => {
  assert.match(PAGE, /MMSheet\.open\(document\.getElementById\('pickerModal'\)/,
    'the picker opens through the primitive, which applies the lock');
  assert.match(SHEET_JS, /body\.classList\.add\(LOCK_CLASS\)/);
  assert.match(read('mm-sheet.css'), /body\.mm-sheet-lock\s*\{[^}]*position:\s*fixed/,
    'the lock genuinely freezes the page, not just overflow:hidden');
});

test('scroll isolation: closing restores the exact scroll position', () => {
  // "Opening/closing the picker should not unexpectedly alter the underlying
  // scroll position." Freezing the body with a negative top is what makes the
  // explicit restore necessary — without it the page returns to the top.
  assert.match(SHEET_JS, /win\.scrollTo\(0, out\.y\)/);
  assert.match(SHEET_JS, /if \(depth === 1\) \{ savedY = num\(y\); return true; \}/,
    'the saved position belongs to the first lock, not a stacked one');
});

test('scroll isolation: the list owns its own scrolling and contains it', () => {
  assert.match(PAGE, /class="picker-list mm-sheet-scroll"/,
    'the result list carries the scroll contract');
  const list = rule('.picker-list');
  assert.match(list, /flex:\s*1/, 'it is the flexible region of the sheet');
  assert.match(list, /min-height:\s*0/, 'so it can actually shrink and scroll');
  assert.ok(!/overflow/.test(list),
    'overflow belongs to .mm-sheet-scroll — one definition, not two');
});

test('scroll isolation: the filter panel scrolls independently too', () => {
  assert.match(PAGE, /class="filter-panel mm-sheet-scroll"/);
  const panel = rule('.filter-panel');
  assert.match(panel, /max-height:\s*46vh/, 'it is capped so it never pushes the list away');
  assert.ok(!/overflow/.test(panel), 'and it does not redeclare scrolling');
});

test('scroll isolation: drag and list-scroll cannot be confused', () => {
  // Full behaviour in mm-sheet.test.js; this pins that the picker gives the
  // primitive what it needs to tell them apart — a handle and a marked region.
  assert.match(PAGE, /class="mm-sheet-handle"/);
  assert.match(PAGE, /class="picker-list mm-sheet-scroll"/);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4.3.5E — selection state
 * ══════════════════════════════════════════════════════════════════════ */

test('selection: the red highlight is pointer-only, so nothing stays lit on touch', () => {
  // THE ROOT CAUSE of "random exercises appear highlighted red" and "the
  // highlight changes as I scroll": iOS keeps :hover on the last-tapped element
  // and moves it under the finger during a scroll. The rule must be inside a
  // (hover: hover) block — the same guard .mm-nav-item has always used.
  const bare = new RegExp('(^|[};])\\s*\\.picker-item:hover');
  const guarded = /@media \(hover: hover\) \{\s*\.picker-item:hover \.picker-item-name/;
  assert.match(CODE, guarded, 'the hover highlight is pointer-gated');
  const outsideMedia = CODE.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  assert.ok(!bare.test(outsideMedia), 'no unguarded .picker-item:hover rule remains');
  assert.match(SHELL, /@media \(hover: hover\) \{[\s\S]*?\.mm-nav-item:hover/,
    'consistent with the shell precedent');
});

test('selection: pressed state is transient and is our own, not the OS flash', () => {
  assert.match(CODE, /\.picker-item:active\s*\{/, 'a real pressed state exists');
  const item = rule('.picker-item');
  assert.match(item, /-webkit-tap-highlight-color:\s*transparent/,
    'the OS tap flash is replaced rather than layered on top');
  // :active is inherently transient — it cannot survive the touch that set it,
  // which is the property the stuck :hover lacked.
});

test('selection: no persistent selected class is written to rows', () => {
  // Rows are re-rendered wholesale by filterPicker(); a persisted selected class
  // combined with that would be exactly the "state leaking between rows" bug.
  // Tapping a row adds the exercise and closes the sheet — there is no selection
  // to remember, and nothing may invent one.
  assert.ok(!/picker-item[^"'\n]*\bis-selected\b|classList\.\w+\('selected'\)/.test(PAGE),
    'the picker holds no per-row selected state');
  assert.match(PAGE, /function selectExercise\(name, pickedId\)/,
    'selection is an action, not a stored row state');
});

test('selection: a picker row is a real control, reachable by keyboard', () => {
  // A <div onclick> is not focusable, so Tab used to skip the entire list —
  // and the sheet focus trap had nothing to land on between the search field
  // and Cancel.
  assert.ok(!/<div class="picker-item"/.test(PAGE), 'no non-focusable div rows remain');
  const rows = (PAGE.match(/<button type="button" class="picker-item"/g) || []);
  assert.strictEqual(rows.length, 2, 'both the result rows and the "+ Add" row are buttons');
  const item = rule('.picker-item');
  assert.match(item, /width:\s*100%/, 'the button still fills the row');
  assert.match(item, /text-align:\s*left/, 'and keeps the list reading order');
  assert.match(CODE, /\.picker-item:focus-visible\s*\{[^}]*outline:/, 'with a visible focus ring');
  // The primitive can now actually find them.
  assert.ok(require('./mm-sheet.js').FOCUSABLE.includes('button:not([disabled])'));
});

test('selection: canonical vs custom identity is unchanged by the markup change', () => {
  // Phase 4.2.1F/H/K contract: a global catalog hit stamps the real exercises.id,
  // a custom stamps '' — and the SAVED name is always the canonical name.
  assert.match(PAGE, /data-id="' \+ esc\(id \|\| ''\) \+\s*'" onclick="selectExercise\(this\.dataset\.name, this\.dataset\.id\)"/);
  assert.match(PAGE, /rows\.push\(pickerRowHtml\(r\.name, r\.isCustom \? '' : r\.id, r\.category, eq\)\)/,
    'custom rows still carry no canonical id');
});

test('selection: hover colours that encode a STATE are pointer-gated', () => {
  // A stuck hover that happens to be the same colour as a real state is the
  // same class of defect as the picker rows: .btn-check hover green reads as
  // "set completed", and a hovered filter chip reads as an active filter.
  for (const sel of ['.btn-check:hover', '.filter-chip:hover', '.btn-filter:hover']) {
    const re = new RegExp('@media \\(hover: hover\\) \\{[\\s\\S]{0,400}?' +
      sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    assert.match(CODE, re, `${sel} is inside a (hover: hover) guard`);
  }
});
