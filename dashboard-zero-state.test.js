// dashboard-zero-state.test.js — Phase 4.3.5A behavioural contract for Home's
// nutrition module at zero.
//
// The defect this pins: with nothing logged, Home replaced the whole nutrition
// module with the sentence "Nothing logged yet today", so the user could not see
// where progress would appear or what their targets were until after they had
// already logged something.
//
// These are BEHAVIOURAL tests, not source-text greps: the real `renderNutrition`
// and `setMeter` are lifted out of app.html and executed against a minimal DOM
// stub, so the assertions describe what the user actually sees. Nothing here
// snapshots markup — each test states one property of the rendered output.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const HOME = fs.readFileSync(path.join(__dirname, 'app.html'), 'utf8');

/* ── Extract one top-level `function name(...) { … }` by brace matching ──── */
function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start > -1, 'app.html defines ' + name + '()');
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced braces in ' + name);
}

/* ── Minimal DOM stub — only what these two functions touch ─────────────── */
function makeElement(id) {
  return {
    id,
    innerHTML: '',
    className: '',
    style: {
      _props: {},
      setProperty(k, v) { this._props[k] = v; },
      getPropertyValue(k) { return this._props[k]; },
    },
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
  };
}

// Renders `model` through the real Home code and returns the resulting DOM stub.
function render(model) {
  const els = { nutBody: makeElement('nutBody') };
  const sandbox = {
    document: {
      getElementById(id) {
        // The meters only exist after renderNutrition writes them into nutBody,
        // which the stub cannot parse — so they are created lazily on demand,
        // exactly matching the ids the production code asks for.
        if (!els[id]) els[id] = makeElement(id);
        return els[id];
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(
    extractFn(HOME, 'setMeter') + '\n' + extractFn(HOME, 'renderNutrition') +
    '\nrenderNutrition(__model);',
    Object.assign(sandbox, { __model: model })
  );
  return { html: els.nutBody.innerHTML, el: (id) => els[id] };
}

/* ── Model fixtures, shaped exactly like dashboard-model.buildNutrition ──── */
const ZERO_WITH_TARGETS = {
  hasData: true, logged: false, hasTargets: true,
  consumed: 0, target: 2400, left: 2400, over: false, pct: 0,
  protein: { consumed: 0, target: 180, pct: 0, behind: true },
  href: 'nutrition.html',
};
const ZERO_NO_TARGETS = {
  hasData: true, logged: false, hasTargets: false,
  consumed: 0, target: null,
  protein: { consumed: 0, target: null, pct: 0, behind: false },
  href: 'nutrition.html',
};
const LOGGED = {
  hasData: true, logged: true, hasTargets: true,
  consumed: 1200, target: 2400, left: 1200, over: false, pct: 50,
  protein: { consumed: 90, target: 180, pct: 50, behind: true },
  href: 'nutrition.html',
};

/* ── 1 · The structure survives zero ────────────────────────────────────── */

test('zero state: the nutrition module keeps its normal structure', () => {
  const { html } = render(ZERO_WITH_TARGETS);
  assert.match(html, />Calories</, 'Calories is present');
  assert.match(html, />Protein</, 'Protein is present');
  assert.ok(!/Nothing logged/i.test(html), 'no message-only replacement');
  assert.ok(!/home-empty/.test(html), 'the module does not degrade to an empty state');
});

test('zero state: both progress tracks are rendered', () => {
  const { html } = render(ZERO_WITH_TARGETS);
  const meters = html.match(/class="mm-meter[^"]*" id="nut(Cal|Pro)Meter"/g) || [];
  assert.strictEqual(meters.length, 2, 'a calorie track and a protein track');
  assert.match(html, /role="progressbar"[^>]*aria-label="Calories"/);
  assert.match(html, /role="progressbar"[^>]*aria-label="Protein"/);
});

test('zero state: the tracks are EMPTY, not floored to a visible sliver', () => {
  const { el } = render(ZERO_WITH_TARGETS);
  for (const id of ['nutCalMeter', 'nutProMeter']) {
    assert.strictEqual(el(id).style.getPropertyValue('--mm-meter-pct'), '0%', id + ' is 0%');
    assert.strictEqual(el(id).getAttribute('aria-valuenow'), '0', id + ' announces 0');
    assert.strictEqual(el(id).getAttribute('data-empty'), 'true',
      id + ' renders the track alone (app-shell.css hides the fill at data-empty)');
  }
});

/* ── 2 · Targets are visible before anything is logged ──────────────────── */

test('zero state: the user can see the whole calorie target remaining', () => {
  const { html } = render(ZERO_WITH_TARGETS);
  assert.match(html, /2,400 <span class="sub">kcal left<\/span>/,
    'the full target reads as remaining, not as an unexplained 0');
  assert.ok(!/over/.test(html), 'zero is never "over target"');
});

test('zero state: protein shows 0 against its real target', () => {
  const { html } = render(ZERO_WITH_TARGETS);
  assert.match(html, /0 <span class="sub">\/ 180 g<\/span>/);
});

/* ── 3 · Nothing is fabricated ──────────────────────────────────────────── */

test('zero state: no intake is invented', () => {
  const { html } = render(ZERO_WITH_TARGETS);
  // Visible text only — attribute values such as aria-valuemax are not content.
  const text = html.replace(/<[^>]*>/g, ' ');
  const numbers = (text.match(/\d[\d,]*/g) || []).filter((n) => n !== '0');
  assert.deepStrictEqual(numbers.sort(), ['180', '2,400'],
    'only the targets appear alongside zero — no estimated or carried-over intake');
});

test('zero state without targets: Calories and Protein still both appear', () => {
  const { html, el } = render(ZERO_NO_TARGETS);
  assert.match(html, />Calories</);
  assert.match(html, />Protein</);
  assert.match(html, /0 <span class="sub">kcal today<\/span>/,
    'without a target we state what was consumed, never a meaningless "left"');
  assert.match(html, /0 <span class="sub">g<\/span>/, 'protein total, no invented target');
  assert.strictEqual(el('nutCalMeter').getAttribute('data-empty'), 'true');
  assert.ok(!/nutProMeter/.test(html),
    'no protein bar without a target — a bar needs something honest to measure against');
});

/* ── 4 · A genuinely unknown snapshot is still distinct from zero ───────── */

test('no snapshot at all is NOT rendered as zero', () => {
  const { html } = render({ hasData: false, logged: false, hasTargets: false });
  assert.match(html, /home-empty/, 'unknown data degrades honestly');
  assert.ok(!/mm-meter/.test(html), 'we never draw a 0% bar for data we do not have');
});

/* ── 5 · The logged path is unchanged (parity) ──────────────────────────── */

test('logged days render exactly as before', () => {
  const { html, el } = render(LOGGED);
  assert.match(html, /1,200 <span class="sub">kcal left<\/span>/);
  assert.match(html, /90 <span class="sub">\/ 180 g<\/span>/);
  assert.strictEqual(el('nutCalMeter').style.getPropertyValue('--mm-meter-pct'), '50%');
  assert.strictEqual(el('nutProMeter').style.getPropertyValue('--mm-meter-pct'), '50%');
  assert.strictEqual(el('nutCalMeter').getAttribute('data-empty'), null, 'a real value draws a fill');
  assert.match(el('nutCalMeter').className, /mm-meter--calories/, 'category colouring preserved');
});
