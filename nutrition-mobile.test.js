// nutrition-mobile.test.js — Phase 4.2.10d structural responsive contract.
// Pure static analysis of nutrition.html's inline CSS + rendered markup: no
// browser, no DOM engine. Asserts the mobile-hardening rules exist and that the
// overflow-prone constraints (flex-shrink:0 on the choice secondary, nowrap on
// the resolved metadata) are gone. Full rendered-width verification (scrollWidth)
// needs browser automation, which is unavailable here — see the checkpoint report.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, 'nutrition.html'), 'utf8');
const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';

// The FIRST flat rule block for a selector (declarations between { }).
function rule(selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
  const m = style.match(re);
  return m ? m[1] : '';
}
// A whole @media (max-width: <n>px) block, brace-balanced.
function mediaBlock(maxWidth) {
  const start = style.search(new RegExp('@media\\s*\\(max-width:\\s*' + maxWidth + 'px\\)'));
  if (start < 0) return '';
  let i = style.indexOf('{', start), depth = 0, out = '';
  for (; i < style.length; i++) {
    const ch = style[i];
    if (ch === '{') { depth++; if (depth === 1) continue; }
    else if (ch === '}') { depth--; if (depth === 0) break; }
    out += ch;
  }
  return out;
}

test('10d: mobile media tiers exist (480px primary + 360px narrow)', () => {
  assert.ok(mediaBlock(480).length > 0, '480px tier present');
  assert.ok(mediaBlock(360).length > 0, '360px tier present');
});

test('10d: clarification .ai-choice stacks vertically at ≤480px', () => {
  assert.match(mediaBlock(480), /\.ai-choice\s*\{[^}]*flex-direction:\s*column/,
    '.ai-choice → column so name + secondary stack');
});

test('10d: .ai-choice-brand is no longer non-shrinking (the 320px overflow fix)', () => {
  const base = rule('.ai-choice-brand');
  assert.ok(base.length, '.ai-choice-brand rule exists');
  assert.ok(!/flex-shrink:\s*0/.test(base), 'flex-shrink:0 removed');
  assert.match(base, /min-width:\s*0/, 'min-width:0 added');
  assert.match(base, /overflow-wrap:\s*anywhere/, 'long unbreakable tokens can break');
});

test('10d: resolved metadata is a wrapping two-group block (.ai-item-meta)', () => {
  const meta = rule('.ai-item-meta');
  assert.match(meta, /flex-wrap:\s*wrap/, 'wraps to two rows when tight');
  assert.match(meta, /min-width:\s*0/, 'shrinks with its parent');
  // markup renders identity + nutrition as two spans inside the meta block.
  assert.match(html, /class="ai-item-meta"[\s\S]{0,240}class="ai-item-sub"[\s\S]{0,240}class="ai-item-sub"/,
    'two .ai-item-sub metadata spans are rendered');
});

test('10d: resolved .ai-item-sub can wrap — calories/protein never truncated', () => {
  const sub = rule('.ai-item-sub');
  assert.ok(!/white-space:\s*nowrap/.test(sub), 'no nowrap on the metadata line');
  assert.ok(!/text-overflow:\s*ellipsis/.test(sub), 'no ellipsis truncation');
});

test('10d: the mini stepper stays protected and separate', () => {
  assert.match(rule('.ai-item-bottom'), /align-items:\s*flex-start/, 'stepper aligns top when meta wraps');
  assert.match(rule('.ai-mini-stepper'), /flex-shrink:\s*0/, 'stepper never shrinks/overlaps');
  // Tap targets are a consistent 32×32 and are NEVER shrunk to fit narrow phones.
  assert.match(rule('.ai-mini-step'), /width:\s*32px/, 'base step width is 32px');
  assert.match(rule('.ai-mini-step'), /height:\s*32px/, 'base step height is 32px');
  assert.ok(!/\.ai-mini-step\s*\{[^}]*(?:width|height):\s*(?:[12]?\d|3[01])px/.test(mediaBlock(360)),
    '.ai-mini-step is never overridden below 32px at ≤360px');
  assert.ok(!/\.ai-mini-step\s*\{[^}]*(?:width|height):\s*(?:[12]?\d|3[01])px/.test(mediaBlock(480)),
    '.ai-mini-step is never overridden below 32px at ≤480px');
});

test('10d: modal width reclaimed on mobile (reduced padding)', () => {
  const m480 = mediaBlock(480);
  assert.match(m480, /\.modal-overlay\s*\{[^}]*padding:\s*12px/, 'overlay padding reduced at ≤480px');
  assert.match(m480, /\.modal-box\s*\{[^}]*padding:\s*20px 16px/, 'modal padding reduced at ≤480px');
  assert.match(mediaBlock(360), /\.modal-(overlay|box)\s*\{[^}]*padding:/, 'further tightened at ≤360px');
});

/* ── Phase 4.3.4 CP5 · iOS auto-zoom defect ────────────────────────────────
 * Real-device defect: on iPhone Safari, focusing the food-search field zoomed
 * the page (the field computed 14px, below iOS's 16px threshold). While zoomed,
 * the visual viewport no longer aligns with the layout viewport, so a tap on
 * the fixed modal's red add button missed it entirely — no log, no toast, no
 * error. Manually zooming out made the identical food log correctly.
 * The fix sizes the CONTROLS; pinch-zoom must stay available. */

const SHELL = fs.readFileSync(path.join(__dirname, 'app-shell.css'), 'utf8');
const SHELL_PAGES = ['app.html', 'profile.html', 'workout.html',
  'workout-history.html', 'nutrition.html', 'weight-history.html'];

// The whole @media block that carries the guard.
function zoomGuardBlock() {
  const start = SHELL.search(/@media \(max-width: 480px\), \(pointer: coarse\)/);
  if (start < 0) return '';
  let i = SHELL.indexOf('{', start), depth = 0, out = '';
  for (; i < SHELL.length; i++) {
    const ch = SHELL[i];
    if (ch === '{') { depth++; if (depth === 1) continue; }
    else if (ch === '}') { depth--; if (depth === 0) break; }
    out += ch;
  }
  return out;
}

test('cp5: the shell guards text controls against iOS focus auto-zoom', () => {
  const guard = zoomGuardBlock();
  assert.ok(guard.length, 'a phone/touch-scoped guard block exists');
  assert.match(guard, /font-size:\s*16px\s*!important/,
    'controls are floored at the 16px iOS threshold');
  // Must reach inputs, selects AND textareas — selects were the ones page CSS
  // (.field-group select) kept overriding.
  assert.match(guard, /(^|,|\s)input:not\(/, 'covers text inputs');
  assert.match(guard, /(^|,|\s)select(\s|,)/, 'covers selects');
  assert.match(guard, /(^|,|\s)textarea(\s|,)/, 'covers textareas');
  // Non-text controls keep their own sizing.
  for (const t of ['checkbox', 'radio', 'range', 'color']) {
    assert.ok(guard.includes(`:not([type="${t}"])`), `${t} inputs are excluded`);
  }
});

test('cp5: the guard is a floor page CSS cannot lose to', () => {
  // .field-group select (0,1,1) outranks a bare select (0,0,1); without
  // !important every <select> silently kept 14px and went on zooming.
  const guard = zoomGuardBlock();
  const decls = guard.match(/font-size:[^;]+;/g) || [];
  assert.ok(decls.length, 'the guard declares a font-size');
  for (const d of decls) {
    assert.match(d, /!important/, `guard declaration must not be overridable: ${d}`);
  }
});

test('cp5: pinch-zoom is never disabled — the fix is the controls, not the viewport', () => {
  for (const p of SHELL_PAGES) {
    const html = fs.readFileSync(path.join(__dirname, p), 'utf8');
    const meta = (html.match(/<meta[^>]+name="viewport"[^>]*>/) || [''])[0];
    assert.ok(meta, `${p} declares a viewport`);
    assert.ok(!/maximum-scale/.test(meta), `${p}: must not cap zoom`);
    assert.ok(!/user-scalable\s*=\s*no/.test(meta), `${p}: must not disable zoom`);
    assert.match(meta, /width=device-width/, `${p}: responsive viewport`);
    assert.match(meta, /viewport-fit=cover/, `${p}: safe-area aware`);
  }
});

test('cp5: every shell page actually loads the guard', () => {
  for (const p of SHELL_PAGES) {
    const html = fs.readFileSync(path.join(__dirname, p), 'utf8');
    assert.match(html, /<link[^>]+href="app-shell\.css"/, `${p} loads app-shell.css`);
  }
});

/* The meal contract the defect was initially suspected to involve. It was NOT
 * the cause — these pin that the fix changed none of it. */
const NUTRITION_JS = fs.readFileSync(path.join(__dirname, 'nutrition.js'), 'utf8');

test('cp5: meal values are one list, shared by picker, form and save', () => {
  const decl = (NUTRITION_JS.match(/var NU_MEALS\s*=\s*\[([^\]]+)\]/) || [])[1] || '';
  const meals = decl.split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  assert.deepStrictEqual(meals, ['breakfast', 'lunch', 'dinner', 'snack'],
    'the canonical meal values');
  // The <select> options are generated from that same list — no second source
  // and no snack/snacks divergence in the VALUE (Snacks is a label only).
  assert.match(NUTRITION_JS, /NU_MEALS\.map\(function \(m\)[\s\S]{0,120}option value="' \+ m \+ '"/,
    'meal options are built from NU_MEALS');
  assert.match(NUTRITION_JS, /NU_MEAL_LABELS\s*=\s*\{[^}]*snack:\s*'Snacks'/,
    'Snacks is a label for the snack value');
  assert.match(NUTRITION_JS, /NU_MEALS\.indexOf\(meal\) === -1/,
    'save validates against the same list');
});

test('cp5: meal context survives open → manual entry → save, for every meal', () => {
  // addToMeal passes the meal straight through; nuOpenModal seeds the select.
  assert.match(
    fs.readFileSync(path.join(__dirname, 'nutrition.html'), 'utf8'),
    /function addToMeal\(meal\)\s*\{\s*nuOpenModal\(\{ meal: meal, date: currentDate \}\)/,
    'the meal button passes its own meal');
  assert.match(NUTRITION_JS, /getElementById\('nuMeal'\)\.value\s*=\s*prefill\.meal \|\| 'breakfast'/,
    'the modal seeds the meal select from the caller');
  // The manual-entry switch must never clear it — that was the suspected
  // state-loss path, and it must stay clear of #nuMeal.
  const manual = (NUTRITION_JS.match(/function nuManualEntry\(\)[\s\S]*?\n\}/) || [''])[0];
  assert.ok(manual.length, 'located nuManualEntry');
  assert.ok(!/nuMeal/.test(manual), 'manual entry never touches the meal select');
  const reset = (NUTRITION_JS.match(/function nuResetModalState\(\)[\s\S]*?\n\}/) || [''])[0];
  assert.ok(!/nuMeal/.test(reset), 'modal reset never touches the meal select');
  // Save reads the select and writes it straight to the log row.
  assert.match(NUTRITION_JS, /var meal = document\.getElementById\('nuMeal'\)\.value/);
  assert.match(NUTRITION_JS, /meal:\s*entry\.meal/, 'the log row carries that meal');
});

test('cp5: a failed save can never look successful', () => {
  const save = (NUTRITION_JS.match(/async function nuSave\(\)[\s\S]*?\n\}/) || [''])[0];
  assert.ok(save.length, 'located nuSave');
  // The success toast/refresh sit AFTER the error throw, so a rejected insert
  // cannot fall through to "Food logged!".
  const throwAt = save.indexOf('if (res.error) throw res.error;');
  const toastAt = save.indexOf("showToast('Food logged!')");
  assert.ok(throwAt > -1 && toastAt > throwAt, 'errors throw before the success toast');
  assert.match(save, /catch \(err\)[\s\S]{0,160}showToast\('Error saving/,
    'a rejected insert surfaces an error toast');
});

test('10d: component overflow guards — min-width:0 on key flex children', () => {
  assert.match(rule('.ai-item-meta'), /min-width:\s*0/);
  assert.match(rule('.sm-item-main'), /min-width:\s*0/);
  assert.match(rule('.nu-saved-main'), /min-width:\s*0/);
  assert.match(rule('.sm-list'), /min-width:\s*0/);
  // a wide card cannot widen the modal.
  assert.match(style, /\.sm-item,\s*\.ai-item,\s*\.ai-choice\s*\{[^}]*max-width:\s*100%/,
    'cards are capped to 100% of the list width');
});
