// exercise-detail-ui.test.js — Phase 4.3.6H contract for the exercise detail
// surface as it is wired into workout.html.
//
// Same static-analysis style as workout-picker.test.js: these pin the STRUCTURAL
// properties that make the surface safe — a read-only sheet, a detail action
// that cannot select an exercise, real touch targets, and a lazy fetch that
// never lands in the Train bootstrap. A future edit that reintroduces one of
// those hazards fails here rather than on a user's phone.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const PAGE = read('workout.html');
const CSS = (PAGE.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
// Script bodies with comments stripped — comments state intent, not behaviour.
const JS = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function rule(selector) {
  const re = new RegExp('(^|[};])\\s*' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^{}]*)\\}');
  const m = CODE.match(re);
  return m ? m[2] : null;
}
// The body of a top-level function declaration, brace-matched.
function fnBody(name) {
  const start = JS.indexOf('function ' + name + '(');
  if (start < 0) return null;
  let i = JS.indexOf('{', start);
  if (i < 0) return null;
  let depth = 0;
  for (let j = i; j < JS.length; j++) {
    if (JS[j] === '{') depth++;
    else if (JS[j] === '}') { depth--; if (depth === 0) return JS.slice(i, j + 1); }
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Wiring
 * ══════════════════════════════════════════════════════════════════════ */

test('the shared detail core is loaded, and after exercise-log (identity never forks)', () => {
  const detail = PAGE.indexOf('src="exercise-detail.js"');
  const log = PAGE.indexOf('src="exercise-log.js"');
  assert.ok(detail > 0, 'exercise-detail.js is loaded on workout.html');
  assert.ok(log > 0 && log < detail, 'exercise-detail.js loads after exercise-log.js');
});

test('the detail sheet exists and is a labelled modal dialog', () => {
  assert.match(PAGE, /id="exerciseDetailModal"/);
  assert.match(PAGE, /class="detail-sheet"[^>]*role="dialog"/);
  assert.match(PAGE, /aria-modal="true"/);
  assert.match(PAGE, /aria-labelledby="exerciseDetailTitle"/,
    'the dialog is named by its own visible heading');
});

test('the sheet opens through the shared primitive, inheriting Escape/focus/scroll-lock', () => {
  const body = fnBody('openExerciseDetail');
  assert.ok(body, 'openExerciseDetail exists');
  assert.match(body, /MMSheet\.open\(/, 'opened via mm-sheet.js, not a bare classList toggle');
  assert.match(body, /variant:\s*'sheet'/);
  assert.ok(!/classList\.add\(\s*'open'\s*\)/.test(body), 'never toggles .open directly');
  assert.match(fnBody('closeExerciseDetail'), /MMSheet\.close\(/);
});

/* ══════════════════════════════════════════════════════════════════════════
 * Workout safety — the surface is read-only BY CONSTRUCTION
 * ══════════════════════════════════════════════════════════════════════ */

test('no detail code path writes to the workout, the sets or the database', () => {
  const names = ['openExerciseDetail', 'renderExerciseDetail', 'closeExerciseDetail',
    'detailRefFor', 'cachedCatalogRow', 'openDetailForWorkoutExercise',
    'openDetailForPicker', 'openDetailForTemplateExercise'];
  // Mutating verbs that would indicate the surface can change workout state.
  const forbidden = [/\.insert\(/, /\.update\(/, /\.delete\(/, /\.upsert\(/,
    /startRest\(/, /stopRest\(/, /finishWorkout\(/, /addSet\(/, /toggleSet\(/,
    /updateSet\(/, /removeExercise\(/, /selectExercise\(/];
  names.forEach((n) => {
    const body = fnBody(n);
    assert.ok(body, n + ' exists');
    forbidden.forEach((re) => {
      assert.ok(!re.test(body), n + ' must not call ' + re + ' — the detail surface is read-only');
    });
  });
});

test('the detail sheet markup contains no control that can mutate a workout', () => {
  const m = PAGE.match(/<div class="overlay" id="exerciseDetailModal">([\s\S]*?)\n<\/div>\n/);
  assert.ok(m, 'detail modal markup located');
  const markup = m[1];
  const handlers = markup.match(/onclick="([^"]+)"/g) || [];
  // Phase 4.3.6I added a Swap action. The invariant is unchanged and is about
  // DIRECT mutation: the sheet may navigate to a guarded flow, but nothing in it
  // may alter the workout itself. Close dismisses; swapFromDetail() only re-opens
  // through openSwapForWorkoutExercise/openSwapForTemplateExercise, which apply
  // the completed-set guard and still require an explicit candidate tap.
  const ALLOWED = ['onclick="closeExerciseDetail()"', 'onclick="swapFromDetail()"'];
  handlers.forEach((h) => assert.ok(ALLOWED.includes(h),
    'unexpected action in the detail sheet: ' + h));
  assert.ok(!/<input|<form|contenteditable/i.test(markup), 'no editable control in a read-only sheet');
  // Whatever actions exist, none may write directly.
  assert.ok(!/supabaseClient|\.update\(|\.insert\(|\.delete\(/.test(markup));
});

test('the only network read is a single canonical exercise by id', () => {
  const body = fnBody('loadExerciseDetailProse');
  assert.ok(body, 'loadExerciseDetailProse exists');
  assert.match(body, /from\('exercises'\)/, 'reads the canonical library only');
  assert.ok(!/from\('user_exercises'\)/.test(body), 'never reads another user\'s customs');
  assert.match(body, /\.eq\('id',\s*ref\.exerciseId\)/, 'scoped to the referenced id');
  assert.match(body, /catch/, 'a failed fetch degrades instead of throwing');
});

/* ══════════════════════════════════════════════════════════════════════════
 * Picker — "choose this" and "learn about this" are distinct controls
 * ══════════════════════════════════════════════════════════════════════ */

test('a picker row has two separate buttons: select and details', () => {
  const body = fnBody('pickerRowHtml');
  assert.ok(body, 'pickerRowHtml exists');
  assert.match(body, /class="picker-row"/, 'the row is a container, not one button');
  assert.match(body, /onclick="selectExercise\(/, 'select action present');
  assert.match(body, /onclick="openDetailForPicker\(/, 'detail action present');
  // Nested buttons are invalid HTML and would make the row ambiguous.
  const selectIdx = body.indexOf('onclick="selectExercise(');
  const closeIdx = body.indexOf('</button>');
  assert.ok(closeIdx > selectIdx && closeIdx < body.indexOf('openDetailForPicker'),
    'the select button is CLOSED before the detail button opens — they are siblings, not nested');
});

test('the detail button never carries the select handler', () => {
  const body = fnBody('pickerRowHtml');
  const infoBtn = body.slice(body.indexOf('picker-item-info'));
  assert.ok(!/selectExercise/.test(infoBtn),
    'tapping details must be incapable of adding the exercise');
});

test('a custom picker row passes its id in the CUSTOM slot, never the canonical one', () => {
  const body = fnBody('filterPicker');
  assert.match(body, /r\.isCustom \? '' : r\.id[\s\S]*?r\.isCustom \? r\.id : ''/,
    'a user_exercises id is never presented as a canonical exercises.id');
});

test('openDetailForPicker refuses to treat a custom id as canonical', () => {
  const body = fnBody('openDetailForPicker');
  assert.match(body, /exerciseId:\s*id \|\| null/);
  assert.match(body, /customId:\s*\(!id && customId\)/,
    'the custom slot is only used when there is no canonical id — the two are mutually exclusive');
});

/* ══════════════════════════════════════════════════════════════════════════
 * Entry points
 * ══════════════════════════════════════════════════════════════════════ */

test('detail opens from the active workout card, the picker and the Routine editor', () => {
  assert.match(JS, /onclick="openDetailForWorkoutExercise\(/, 'active workout exercise card');
  assert.match(JS, /onclick="openDetailForPicker\(/, 'picker result row');
  assert.match(JS, /onclick="openDetailForTemplateExercise\(/, 'Routine/template editor row');
});

test('all three entry points build a reference from stored ids, never from a name lookup', () => {
  // Name-based resolution here would be exactly the identity guessing 4.3.6H forbids.
  ['detailRefFor', 'openDetailForPicker', 'openDetailForTemplateExercise'].forEach((n) => {
    const body = fnBody(n);
    assert.ok(!/libraryExerciseId\(|activeCustomIdByName\(|normalizeExerciseName\(/.test(body),
      n + ' must not resolve identity by name');
  });
});

test('the Routine editor keeps its reorder and remove actions alongside details', () => {
  const body = fnBody('buildTemplateExCard');
  assert.match(body, /openDetailForTemplateExercise\(/);
  assert.match(body, /moveTemplateExercise\(/, 'reordering is untouched');
  assert.match(body, /removeTemplateExercise\(/, 'removal is untouched');
});

/* ══════════════════════════════════════════════════════════════════════════
 * Performance — lazy, cached, and absent from the Train bootstrap
 * ══════════════════════════════════════════════════════════════════════ */

test('the Train bootstrap does NOT load exercise prose', () => {
  const body = fnBody('loadExerciseLibrary');
  assert.ok(body, 'loadExerciseLibrary exists');
  assert.ok(!/instructions/.test(body),
    'instructions must not be added to the bootstrap select — ~27KB for data almost nobody opens');
  assert.ok(!/\btips\b/.test(body), 'tips must not be added to the bootstrap select');
});

test('prose is fetched lazily, cached, and not refetched on reopen', () => {
  const open = fnBody('openExerciseDetail');
  assert.match(open, /hasOwnProperty\.call\(detailProseCache/,
    'a cached exercise reopens without a request');
  assert.match(open, /needsCatalogFetch\(ref\)/,
    'custom and legacy references never trigger a fetch at all');
  const load = fnBody('loadExerciseDetailProse');
  assert.match(load, /detailProseCache\[ref\.exerciseId\] = row/, 'result is cached');
  assert.match(load, /seq !== detailRequestSeq/, 'a stale response is discarded');
});

test('the sheet renders immediately from in-memory metadata rather than waiting on the network', () => {
  const body = fnBody('openExerciseDetail');
  const firstRender = body.indexOf('renderExerciseDetail(');
  const fetchCall = body.indexOf('loadExerciseDetailProse(');
  assert.ok(firstRender > 0 && firstRender < fetchCall, 'renders before it fetches');
});

/* ══════════════════════════════════════════════════════════════════════════
 * Mobile + accessibility
 * ══════════════════════════════════════════════════════════════════════ */

test('the detail sheet is height-bounded and clears the home indicator', () => {
  const sheet = rule('.detail-sheet');
  assert.ok(sheet, '.detail-sheet is defined');
  assert.match(sheet, /max-height:\s*min\(80vh,\s*100%\)/, 'bounded like the picker');
  assert.match(sheet, /env\(safe-area-inset-bottom/, 'last section is not hidden behind the safe area');
  assert.match(sheet, /flex-direction:\s*column/);
});

test('the detail body scrolls with containment, so a flick cannot scroll the workout behind it', () => {
  assert.match(PAGE, /class="detail-body mm-sheet-scroll"/,
    'carries the shared scroll-containment contract used by mm-sheet gesture handling');
  const body = rule('.detail-body');
  assert.match(body, /min-height:\s*0/, 'a flex child must be able to shrink for its scroll to work');
});

test('long exercise names wrap instead of overflowing 320px', () => {
  assert.match(rule('.detail-title'), /overflow-wrap:\s*anywhere/);
  assert.match(rule('.detail-class-value'), /overflow-wrap:\s*anywhere/);
  assert.match(rule('.detail-section p'), /overflow-wrap:\s*anywhere/);
  assert.match(rule('.picker-item-name'), /overflow-wrap:\s*anywhere/);
});

test('the explicit detail controls meet the 44px touch target', () => {
  assert.match(rule('.detail-close'), /min-width:\s*44px/);
  assert.match(rule('.detail-close'), /min-height:\s*44px/);
  assert.match(rule('.picker-item-info'), /min-width:\s*44px/);
  assert.match(rule('.picker-row'), /align-items:\s*stretch/,
    'the info button inherits the row height, making its target real');
  const actions = rule('.btn-detail, .exercise-card-actions .btn-icon');
  assert.match(actions, /min-width:\s*44px/);
  assert.match(actions, /min-height:\s*44px/);
});

test('icon-only controls carry text labels and the icons are hidden from assistive tech', () => {
  // Every detail affordance is an icon; none may be icon-only to a screen reader.
  const labels = JS.match(/aria-label="View exercise details for [^"]*"/g) || [];
  assert.ok(labels.length >= 3, 'all three entry points label their info control');
  assert.match(PAGE, /aria-label="Close exercise details"/);
  const infoIcons = JS.match(/data-lucide="info"[^>]*/g) || [];
  assert.ok(infoIcons.length >= 3);
  infoIcons.forEach((i) => assert.match(i, /aria-hidden="true"/, 'decorative icon hidden from AT'));
});

test('the sheet uses a real heading and moves focus to a control inside itself', () => {
  assert.match(PAGE, /<h2 class="detail-title" id="exerciseDetailTitle">/,
    'a semantic heading below the page h1, not a styled div');
  assert.match(PAGE, /<h3>/, 'section headings are real headings');
  assert.match(fnBody('openExerciseDetail'), /initialFocus:\s*'\.detail-close'/,
    'focus lands inside the dialog; mm-sheet.js restores it to the opener on close');
});

test('the detail palette uses existing tokens and introduces no new design system', () => {
  const decls = [rule('.detail-sheet'), rule('.detail-note'), rule('.detail-section h3'),
    rule('.detail-class-value'), rule('.picker-item-info')].join(' ');
  const literals = decls.match(/#[0-9a-fA-F]{3,8}/g) || [];
  assert.deepStrictEqual(literals, [], 'colour comes from tokens, never hardcoded hex');
  assert.match(rule('.detail-section h3'), /var\(--red\)/, 'red stays the accent');
  assert.ok(!/var\(--green/.test(decls), 'green remains a success state only');
});
