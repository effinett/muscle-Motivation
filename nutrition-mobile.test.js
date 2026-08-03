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

test('10d: component overflow guards — min-width:0 on key flex children', () => {
  assert.match(rule('.ai-item-meta'), /min-width:\s*0/);
  assert.match(rule('.sm-item-main'), /min-width:\s*0/);
  assert.match(rule('.nu-saved-main'), /min-width:\s*0/);
  assert.match(rule('.sm-list'), /min-width:\s*0/);
  // a wide card cannot widen the modal.
  assert.match(style, /\.sm-item,\s*\.ai-item,\s*\.ai-choice\s*\{[^}]*max-width:\s*100%/,
    'cards are capped to 100% of the list width');
});
