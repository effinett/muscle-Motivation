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

  // The replacement adjusts the fixed overlay's bottom edge.
  assert.match(PAGE, /overlay\.style\.bottom\s*=/,
    'keyboard inset is applied as a layout offset on the overlay');
});

test('keyboard avoidance listens to resize only, so page panning cannot move the sheet', () => {
  const bind = (PAGE.match(/function bindPickerViewport\(\)[\s\S]*?\n  \}/) || [''])[0];
  assert.match(bind, /addEventListener\('resize'/, 'resize is the keyboard signal');
  assert.ok(!/addEventListener\('scroll'/.test(bind),
    'visualViewport scroll is NOT bound — iOS fires it continuously while typing');

  const unbind = (PAGE.match(/function unbindPickerViewport\(\)[\s\S]*?\n  \}/) || [''])[0];
  assert.match(unbind, /removeEventListener\('resize'/, 'and it is removed on close');
  assert.match(unbind, /overlay\.style\.bottom\s*=\s*''/, 'the inset is cleared on close');
});

test('sheet height stays inside the overlay once the keyboard lifts it', () => {
  const sheet = rule('.picker-sheet');
  assert.match(sheet, /max-height:\s*80vh/, 'the pre-existing desktop cap is the fallback');
  assert.match(sheet, /max-height:\s*min\(80vh,\s*100%\)/,
    'and it never exceeds the space the overlay still occupies');
});

test('focus does not scroll the page behind the sheet', () => {
  assert.match(PAGE, /focus\(\{\s*preventScroll:\s*true\s*\}\)/,
    'programmatic focus suppresses the UA scroll-into-view');
  assert.match(PAGE, /catch \(e\) \{ input\.focus\(\); \}/,
    'engines without the options argument still get focus');
});

test('both picker entry points share one open sequence', () => {
  // They previously carried separate copies, so a fix to one missed the other.
  assert.match(PAGE, /function openPickerFor\(mode\)/);
  assert.match(PAGE, /function openPicker\(\)\s*\{\s*openPickerFor\('workout'\);\s*\}/);
  assert.match(PAGE, /function openTemplatePicker\(\)\s*\{\s*openPickerFor\('template'\);\s*\}/);
  const opens = (PAGE.match(/getElementById\('pickerModal'\)\.classList\.add\('open'\)/g) || []);
  assert.strictEqual(opens.length, 1, 'exactly one place opens the picker overlay');
});
