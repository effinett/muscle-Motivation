// mm-dirty.test.js — Phase 4.3.5G contract for the shared unsaved-work signal.
//
// This closes roadmap §10.4. The hard part of a dirty-state contract is not
// detecting unsaved work — it is NOT crying wolf, because a prompt the user
// does not need trains them to dismiss the one that matters. So most of what
// follows pins the cases that must stay SILENT.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const MMDirty = require('./mm-dirty.js');
const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SRC = read('mm-dirty.js');

const src = (id, value, label) => ({ id, label, predicate: () => value });

/* ══════════════════════════════════════════════════════════════════════════
 * 1 · The verdict
 * ══════════════════════════════════════════════════════════════════════ */

test('evaluate: nothing registered means nothing to protect', () => {
  assert.deepStrictEqual(MMDirty.evaluate([]), { dirty: false, reasons: [], labels: [] });
  assert.strictEqual(MMDirty.evaluate(null).dirty, false);
  assert.strictEqual(MMDirty.evaluate(undefined).dirty, false);
});

test('evaluate: reports which sources are dirty, and only those', () => {
  const out = MMDirty.evaluate([
    src('clean', false, 'nothing'),
    src('workout', true, 'a workout in progress'),
    src('form', true, 'unsaved changes in an open form'),
  ]);
  assert.strictEqual(out.dirty, true);
  assert.deepStrictEqual(out.reasons, ['workout', 'form']);
  assert.deepStrictEqual(out.labels, ['a workout in progress', 'unsaved changes in an open form']);
});

test('evaluate: a source reports only THAT it is dirty, never what it holds', () => {
  // Labels are fixed phrases written in the source, so no typed text, food
  // name or measurement can reach a prompt, a log, or anywhere else.
  const out = MMDirty.evaluate([src('quickLogText', true, 'text you have typed into Quick Log')]);
  assert.deepStrictEqual(out.labels, ['text you have typed into Quick Log']);
  assert.ok(!('value' in out) && !('content' in out), 'the verdict carries no content');
});

test('evaluate: a throwing predicate fails OPEN, never trapping the user', () => {
  // Deliberate direction. Losing a warning is recoverable; a page that can
  // never be left because a predicate is broken is not.
  const out = MMDirty.evaluate([
    { id: 'boom', predicate: () => { throw new Error('bug'); } },
    src('real', true),
  ]);
  assert.deepStrictEqual(out.reasons, ['real'], 'the broken source is skipped, the real one still counts');
});

test('evaluate: malformed sources are ignored rather than throwing', () => {
  const out = MMDirty.evaluate([null, undefined, {}, { id: 'x' }, { predicate: 'nope' }, src('ok', true)]);
  assert.deepStrictEqual(out.reasons, ['ok']);
});

test('evaluate: a deliberate saving navigation suppresses everything', () => {
  const all = [src('workout', true), src('form', true)];
  assert.strictEqual(MMDirty.evaluate(all, { suspended: true }).dirty, false);
  assert.deepStrictEqual(MMDirty.evaluate(all, { suspended: true }).reasons, []);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2 · Form comparison — opening a dialog is not editing it
 * ══════════════════════════════════════════════════════════════════════ */

test('form: an untouched dialog is not dirty', () => {
  const snap = { nuName: '', nuServings: '1', nuMeal: 'lunch' };
  assert.strictEqual(MMDirty.formChanged(snap, { ...snap }), false);
});

test('form: typing into a dialog makes it dirty', () => {
  const before = { nuName: '', nuServings: '1' };
  assert.strictEqual(MMDirty.formChanged(before, { nuName: 'chicken', nuServings: '1' }), true);
});

test('form: a prefilled dialog is only dirty once the value CHANGES', () => {
  // The weigh-in modal opens prefilled with today's weight; that is not an edit.
  const before = { wlWeight: '213', wlNote: '' };
  assert.strictEqual(MMDirty.formChanged(before, { wlWeight: '213', wlNote: '' }), false);
  assert.strictEqual(MMDirty.formChanged(before, { wlWeight: '211', wlNote: '' }), true);
});

test('form: switching views inside one dialog is not an edit', () => {
  // The food modal swaps between search / USDA / manual faces, so the set of
  // fields on screen changes without the user typing anything.
  assert.strictEqual(MMDirty.formChanged({ nuSearch: '' }, { nuName: '', nuCalories: '' }), false);
  // …but a value carried into the new face still counts.
  assert.strictEqual(MMDirty.formChanged({ nuSearch: '' }, { nuName: 'rice' }), true);
});

test('form: clearing a prefilled field counts as an edit', () => {
  assert.strictEqual(MMDirty.formChanged({ customEditInput: 'Bulgarian Split Squat' },
    { customEditInput: '' }), true);
});

test('form: missing snapshots are never treated as changes', () => {
  assert.strictEqual(MMDirty.formChanged(null, { a: 'x' }), false);
  assert.strictEqual(MMDirty.formChanged({ a: 'x' }, null), false);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3 · Module hygiene
 * ══════════════════════════════════════════════════════════════════════ */

test('module: it reads no user data and talks to nothing', () => {
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');
  for (const forbidden of [/\bfetch\s*\(/, /XMLHttpRequest/, /localStorage/, /sessionStorage/,
    /indexedDB/, /supabase/i, /serviceWorker/, /\bcaches\b/, /console\./]) {
    assert.ok(!forbidden.test(code), `mm-dirty.js must not reference ${forbidden}`);
  }
});

test('module: the guard is attached only while dirty, preserving bfcache', () => {
  // A permanently-registered beforeunload makes a document bfcache-ineligible,
  // which would work directly against the 4.3.5F navigation improvements.
  assert.match(SRC, /if \(dirty && !listening\) \{\s*\n\s*win\.addEventListener\('beforeunload'/);
  assert.match(SRC, /\} else if \(!dirty && listening\) \{\s*\n\s*win\.removeEventListener\('beforeunload'/);
});

test('module: the guard re-checks at departure rather than trusting a flag', () => {
  const handler = SRC.match(/function onBeforeUnload\(ev\)[\s\S]*?\n  \}/)[0];
  assert.match(handler, /if \(!evaluate\(sources, \{ suspended: suspended \}\)\.dirty\) return undefined/,
    'a form submitted since the last sync must not still prompt');
  assert.match(handler, /ev\.preventDefault\(\)/, 'the modern signal');
  assert.match(handler, /ev\.returnValue = ''/, 'and the legacy one');
});

test('module: registering the same id twice replaces rather than duplicates', () => {
  MMDirty.register('dup', () => false);
  MMDirty.register('dup', () => false);
  assert.deepStrictEqual(MMDirty.sourceIds().filter((i) => i === 'dup'), ['dup']);
  MMDirty.unregister('dup');
  assert.ok(!MMDirty.sourceIds().includes('dup'));
});

test('module: a clean registry never arms the guard', () => {
  MMDirty.register('idle', () => false);
  assert.strictEqual(MMDirty.check().dirty, false);
  assert.strictEqual(MMDirty.isListening(), false, 'no beforeunload while clean');
  MMDirty.unregister('idle');
});

test('module: it exports both halves and is browser-safe', () => {
  assert.match(SRC, /if \(global\) global\.MMDirty = MMDirty;/);
  assert.match(SRC, /if \(typeof module !== 'undefined' && module\.exports\)/);
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4 · Consumers
 * ══════════════════════════════════════════════════════════════════════ */

const PAGES = ['app.html', 'workout.html', 'nutrition.html', 'weight-history.html',
  'profile.html', 'store.html'];

test('consumers: the contract loads before the sheet primitive that feeds it', () => {
  // Both are `defer`, which preserves document order; the sheet reads MMDirty
  // when a dialog opens, so it must already be defined.
  for (const p of PAGES) {
    const src = read(p);
    const dirtyAt = src.indexOf('src="mm-dirty.js"');
    const sheetAt = src.indexOf('src="mm-sheet.js"');
    assert.ok(dirtyAt > -1, `${p} loads mm-dirty.js`);
    assert.ok(dirtyAt < sheetAt, `${p} loads mm-dirty.js before mm-sheet.js`);
  }
});

test('consumers: one registration covers every dialog in the app', () => {
  // The whole reason the sheet primitive owns this: it already knows what is
  // open, so thirteen dialogs get unsaved-work protection from one source
  // rather than thirteen separate implementations.
  const sheet = read('mm-sheet.js');
  assert.match(sheet, /var DIRTY_ID = 'mm-sheet-open-form'/);
  assert.match(sheet, /formSnapshot: dirtyApi\(\) \? global\.MMDirty\.snapshotForm\(el\) : null/,
    'each dialog is snapshotted as it opens');
  assert.match(sheet, /function anyOpenFormEdited\(\)/);
  assert.match(sheet, /api\.register\(DIRTY_ID, anyOpenFormEdited/);
  assert.match(sheet, /else api\.unregister\(DIRTY_ID\)/, 'and released when nothing is open');
  // Typing is what changes the answer, so it must re-arm the guard.
  assert.match(sheet, /el\.addEventListener\('input', onDirtyInput\)/);
  assert.match(sheet, /el\.removeEventListener\('input', onDirtyInput\)/);
});

test('consumers: the primitive degrades silently when the contract is absent', () => {
  const sheet = read('mm-sheet.js');
  assert.match(sheet, /return \(global && global\.MMDirty && typeof global\.MMDirty\.register === 'function'\)/,
    'every dirty call is behind a capability check');
  assert.match(sheet, /if \(!api\) return/);
});

test('consumers: a live workout is dirty; a finished one is not', () => {
  const wk = read('workout.html');
  assert.match(wk, /MMDirty\.register\('activeWorkout', function \(\) \{\s*\n\s*return !!\(currentWorkout && !currentWorkout\.completed\);/,
    'a completed workout is never dirty');
  assert.match(wk, /registerActiveWorkoutDirty\(\);/, 'registered when the live view opens');
});

test('consumers: the three saving/discarding exits are never challenged', () => {
  // Finishing, discarding, and landing on an already-finished workout are all
  // deliberate outcomes. Warning about them would be the "annoying prompt on
  // harmless navigation" the phase explicitly forbids.
  const wk = read('workout.html');
  const suspends = (wk.match(/MMDirty\.suspend\(\)/g) || []).length;
  assert.strictEqual(suspends, 3, 'finish, already-finished, and discard each suspend the guard');
});

test('consumers: unsubmitted Quick Log text is protected, empty text is not', () => {
  const nu = read('nutrition.html');
  assert.match(nu, /MMDirty\.register\('quickLogText'/);
  assert.match(nu, /return !!\(el && el\.value && el\.value\.trim\(\)\.length > 0\);/,
    'whitespace alone is not unsaved work');
  assert.match(nu, /input\.addEventListener\('input', function \(\) \{ MMDirty\.refresh\(\); \}\)/,
    'the guard arms and disarms with the field, so an empty page stays bfcache-eligible');
});

test('consumers: nothing harmless was made to prompt', () => {
  // Scroll position, an open-but-untouched dialog, a saved set, ordinary
  // reading — none of these are registered anywhere.
  const registered = [];
  for (const p of PAGES.concat(['mm-sheet.js', 'nutrition.js', 'weight.js', 'metrics.js'])) {
    for (const m of read(p).matchAll(/MMDirty\.register\(\s*'([^']+)'/g)) registered.push(m[1]);
  }
  for (const m of read('mm-sheet.js').matchAll(/DIRTY_ID = '([^']+)'/g)) registered.push(m[1]);
  assert.deepStrictEqual(registered.sort(),
    ['activeWorkout', 'mm-sheet-open-form', 'quickLogText'],
    'exactly three dirty sources exist in the whole app');
});

test('consumers: the service-worker update path needed no change', () => {
  // beforeunload covers a link, a nav tap, a programmatic location change AND
  // the update's location.reload() — one mechanism, so the tested 4.3.2/4.3.3
  // update state machine is untouched.
  const sw = read('sw-register.js');
  assert.ok(!/MMDirty/.test(sw), 'sw-register.js is not coupled to the contract');
  assert.match(sw, /reload: function \(\) \{ location\.reload\(\); \}/,
    'it still reloads through the normal path, which fires beforeunload');
});
