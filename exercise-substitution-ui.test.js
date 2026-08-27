// exercise-substitution-ui.test.js — Phase 4.3.6I contract for the Swap surface
// as it is wired into workout.html.
//
// Static-analysis style, matching workout-picker.test.js and
// exercise-detail-ui.test.js. These pin the STRUCTURAL guarantees that make a
// swap safe: it cannot reattribute completed work, it cannot mutate a platform
// Routine or Program, it cannot reprogram a prescription, and it cannot spawn a
// second workout. Behaviour that only the database can prove (row-level effects)
// is validated live against production, not asserted here.

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
const JS = PAGE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function rule(selector) {
  const re = new RegExp('(^|[};])\\s*' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^{}]*)\\}');
  const m = CODE.match(re);
  return m ? m[2] : null;
}
function fnBody(name) {
  const start = JS.search(new RegExp('(async\\s+)?function\\s+' + name + '\\s*\\('));
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

test('the engine is loaded after the cores it reuses', () => {
  const subs = PAGE.indexOf('src="exercise-substitution.js"');
  const core = PAGE.indexOf('src="exercise-core.js"');
  const log = PAGE.indexOf('src="exercise-log.js"');
  assert.ok(subs > 0, 'exercise-substitution.js is loaded');
  assert.ok(core > 0 && core < subs, 'loads after exercise-core.js');
  assert.ok(log > 0 && log < subs, 'loads after exercise-log.js');
});

test('the swap sheet is a labelled modal dialog opened through the shared primitive', () => {
  assert.match(PAGE, /id="exerciseSwapModal"/);
  assert.match(PAGE, /class="swap-sheet"[^>]*role="dialog"/);
  assert.match(PAGE, /aria-labelledby="exerciseSwapTitle"/);
  const body = fnBody('openExerciseSwap');
  assert.ok(body, 'openExerciseSwap exists');
  assert.match(body, /MMSheet\.open\(/);
  assert.ok(!/classList\.add\(\s*'open'\s*\)/.test(body), 'never toggles .open directly');
});

/* ══════════════════════════════════════════════════════════════════════════
 * §16 — completed work is never reattributed
 * ══════════════════════════════════════════════════════════════════════ */

test('a swap is blocked once the exercise has completed sets', () => {
  const open = fnBody('openSwapForWorkoutExercise');
  assert.ok(open, 'openSwapForWorkoutExercise exists');
  assert.match(open, /completedSetCount\(ex\)\s*>\s*0/, 'guards on completed sets');
  // It must RETURN rather than fall through to opening the sheet.
  const guardIdx = open.indexOf('completedSetCount(ex) > 0');
  const openIdx = open.indexOf('openExerciseSwap(');
  assert.ok(guardIdx > -1 && guardIdx < openIdx, 'the guard precedes the open');
  assert.match(open.slice(guardIdx, openIdx), /return;/, 'the guard returns');
});

test('the guard is re-checked at the commit boundary, not only when the sheet opens', () => {
  const apply = fnBody('applySwap');
  assert.ok(apply, 'applySwap exists');
  assert.match(apply, /completedSetCount\(ex\)\s*>\s*0/,
    'a set completed while the sheet was open must still cancel the swap');
});

test('completedSetCount counts only genuinely completed sets', () => {
  const body = fnBody('completedSetCount');
  assert.match(body, /s\.completed/);
});

/* ══════════════════════════════════════════════════════════════════════════
 * §15 — active-workout swap semantics
 * ══════════════════════════════════════════════════════════════════════ */

test('the swap UPDATES the exercise row in place — never delete + insert', () => {
  const apply = fnBody('applySwap');
  assert.match(apply, /from\('workout_exercises'\)\s*\n?\s*\.update\(/,
    'the row id is preserved so its sets and order survive');
  assert.ok(!/from\('workout_exercises'\)[\s\S]{0,80}\.delete\(/.test(apply),
    'deleting the row would orphan or destroy its sets');
  assert.ok(!/from\('workout_exercises'\)[\s\S]{0,80}\.insert\(/.test(apply),
    'inserting a new row would change order_index and identity');
});

test('a swap never creates a workout', () => {
  const apply = fnBody('applySwap');
  assert.ok(!/from\('workouts'\)/.test(apply), 'the swap path never touches the workouts table');
  assert.ok(!/startWorkout\(|createWorkout\(/.test(apply));
});

test('the swap never touches the rest timer or the workout timer', () => {
  const apply = fnBody('applySwap');
  ['startRest(', 'stopRest(', 'resetTimer(', 'startTimer('].forEach((fn) => {
    assert.ok(!apply.includes(fn), 'applySwap must not call ' + fn);
  });
});

test('order and other exercises are untouched — only the addressed exercise changes', () => {
  const apply = fnBody('applySwap');
  assert.match(apply, /var ex = exercises\[ctx\.exIdx\]/, 'addresses exactly one exercise');
  assert.ok(!/exercises\.splice|exercises\.push|order_index/.test(apply),
    'the swap must not reorder, add or remove exercises');
});

test('identity is replaced with mutually-exclusive canonical/custom columns', () => {
  const apply = fnBody('applySwap');
  assert.match(apply, /exerciseIdentityColumns\(/, 'reuses the Phase 4.2.1K identity rule');
  assert.match(apply, /exercise_id: ids\.exercise_id, user_exercise_id: ids\.user_exercise_id/);
  assert.match(apply, /ex\.exercise_id = ids\.exercise_id/, 'in-memory identity updated too');
  assert.match(apply, /ex\.customId = ids\.user_exercise_id/);
});

test('stale previous-performance and history are dropped and reloaded for the new identity', () => {
  const apply = fnBody('applySwap');
  assert.match(apply, /ex\.last_perf = null/);
  assert.match(apply, /ex\.history = \[\]/);
  assert.match(apply, /loadLastPerf\(ex\)[\s\S]{0,40}loadExerciseHistory\(ex\)/,
    'ID-first reload (Phase 4.2.1J) for the replacement');
});

/* ══════════════════════════════════════════════════════════════════════════
 * §12 + §14 + §17 — prescription preserved, loads NOT carried across
 * ══════════════════════════════════════════════════════════════════════ */

test('the old exercise’s loads are re-seeded, never inherited as an equivalence', () => {
  const apply = fnBody('applySwap');
  assert.match(apply, /recForExercise\(ex\)/, 'the NEW exercise supplies the seed weight');
  assert.match(apply, /weight_lbs: seed, reps: null/, 'typed reps are cleared with the weight');
  assert.ok(!/weight_lbs: ex\.sets\[|s\.weight_lbs\s*\)/.test(apply),
    'the previous exercise’s entered weight must never be written back');
});

test('the set COUNT is preserved — the prescription is not reprogrammed', () => {
  const apply = fnBody('applySwap');
  assert.ok(!/addSet\(|deleteSet\(|\.from\('workout_sets'\)[\s\S]{0,60}\.(insert|delete)\(/.test(apply),
    'swapping must not add or remove sets');
  assert.match(apply, /ex\.sets\.map\(/, 'it maps over the existing sets, keeping their number');
});

test('no progression or deload logic runs as part of a swap', () => {
  const apply = fnBody('applySwap');
  ['applyDeload(', 'detectAndRecordPRs(', 'Progression.analyze('].forEach((fn) => {
    assert.ok(!apply.includes(fn), 'applySwap must not call ' + fn);
  });
});

test('a Routine swap preserves every prescription field and changes only identity', () => {
  const apply = fnBody('applySwap');
  const tpl = apply.slice(apply.indexOf("ctx.mode === 'template'"), apply.indexOf("var ex = exercises["));
  assert.match(tpl, /t\.name = name/);
  assert.match(tpl, /t\.exercise_id = /);
  ['sets', 'reps_low', 'reps_high', 'rest_sec', 'notes'].forEach((f) => {
    assert.ok(!new RegExp('t\\.' + f + '\\s*=').test(tpl),
      'the Routine swap must not write ' + f);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * §20 + §21 — the Program / platform Routine source is immutable
 * ══════════════════════════════════════════════════════════════════════ */

test('no swap code path writes to a platform Routine, Program or program linkage', () => {
  const fns = ['applySwap', 'openExerciseSwap', 'openSwapForWorkoutExercise',
    'openSwapForTemplateExercise', 'chooseSwapCandidate', 'openSwapManualPicker',
    'renderExerciseSwap', 'swapFromDetail'];
  const protectedTables = ['workout_templates', 'program_routines', 'programs', 'program_workouts'];
  fns.forEach((n) => {
    const body = fnBody(n);
    assert.ok(body, n + ' exists');
    protectedTables.forEach((t) => {
      assert.ok(!body.includes("'" + t + "'"),
        n + ' must never reference ' + t + ' — a session swap is an override, not an edit');
    });
  });
});

test('the only tables a swap writes are the session snapshot rows', () => {
  const apply = fnBody('applySwap');
  const writes = (apply.match(/from\('([a-z_]+)'\)/g) || []).map((s) => s.slice(6, -2));
  const unique = Array.from(new Set(writes)).sort();
  assert.deepStrictEqual(unique, ['workout_exercises', 'workout_sets'],
    'a swap touches only this session’s own rows, got: ' + unique.join(','));
});

test('a Routine swap edits the in-memory draft and saves through the existing path', () => {
  const apply = fnBody('applySwap');
  const tpl = apply.slice(apply.indexOf("ctx.mode === 'template'"), apply.indexOf("var ex = exercises["));
  assert.match(tpl, /editingTemplate\.exercises\[ctx\.exIdx\]/, 'edits the user’s own draft');
  assert.match(tpl, /renderBuilderExercises\(\)/, 'reuses the existing builder render');
  assert.ok(!/supabaseClient/.test(tpl), 'no direct write — the existing save path owns persistence');
});

/* ══════════════════════════════════════════════════════════════════════════
 * §26 + §27 — manual fallback reuses the one picker
 * ══════════════════════════════════════════════════════════════════════ */

test('the manual fallback reuses the existing picker rather than a second search', () => {
  const body = fnBody('openSwapManualPicker');
  assert.match(body, /openPickerFor\('swap'\)/, 'one picker, a new mode');
  assert.ok(!/pickerList|filterPicker\(|runDiscovery/.test(body), 'it builds no search of its own');
});

test('a manual pick routes through the SAME applySwap path as a ranked candidate', () => {
  const sel = fnBody('selectExercise');
  assert.match(sel, /pickerMode === 'swap'[\s\S]{0,120}applySwap\(/,
    'swap mode replaces instead of adding');
  // The context must be captured BEFORE closePicker(), whose onClose clears it.
  const capture = sel.indexOf('pendingSwap');
  const close = sel.indexOf('closePicker()');
  assert.ok(capture > -1 && capture < close,
    'reading swapCtx after closePicker() would always be null — a silent no-op');
});

test('an abandoned manual swap does not stay armed for the next unrelated pick', () => {
  const open = fnBody('openPickerFor');
  assert.match(open, /pickerMode === 'swap'[\s\S]{0,40}swapCtx = null/);
});

/* ══════════════════════════════════════════════════════════════════════════
 * §2 — the user chooses; nothing swaps implicitly
 * ══════════════════════════════════════════════════════════════════════ */

test('opening the swap sheet performs no mutation and preselects nothing', () => {
  const open = fnBody('openExerciseSwap');
  assert.ok(!/supabaseClient|\.update\(|\.insert\(|\.delete\(/.test(open),
    'opening the sheet must be side-effect free');
  const render = fnBody('renderExerciseSwap');
  assert.ok(!/selected|checked|autofocus/.test(render), 'no candidate is preselected');
  assert.match(render, /onclick="chooseSwapCandidate\(/, 'replacement needs an explicit tap');
});

test('the engine is only ever asked to propose — the page performs the change', () => {
  const open = fnBody('openExerciseSwap');
  assert.match(open, /ExerciseSubstitution\.findSubstitutions\(/);
  const subsSrc = read('exercise-substitution.js');
  ['supabaseClient', 'fetch(', 'document.', 'window.localStorage']
    .forEach((bad) => assert.ok(!subsSrc.includes(bad), 'the engine must stay pure: found ' + bad));
});

/* ══════════════════════════════════════════════════════════════════════════
 * §31 + §44 — no AI, no network, no bootstrap cost
 * ══════════════════════════════════════════════════════════════════════ */

test('substitution adds no network request and no AI call', () => {
  const open = fnBody('openExerciseSwap');
  assert.match(open, /canonicalCatalog\(\)/, 'reuses the already-loaded picker catalog');
  assert.ok(!/await/.test(open), 'candidate computation is synchronous — no request on open');
  const subsSrc = read('exercise-substitution.js');
  ['/api/', 'anthropic', 'openai', 'ai-food-parse']
    .forEach((bad) => assert.ok(!subsSrc.toLowerCase().includes(bad), 'found ' + bad));
});

test('the Train bootstrap gains nothing — the catalog is the one already fetched', () => {
  const cat = fnBody('canonicalCatalog');
  assert.match(cat, /exerciseLibrary\.filter/, 'derived from memory, not refetched');
  assert.ok(!/supabaseClient/.test(cat));
});

/* ══════════════════════════════════════════════════════════════════════════
 * §24 — detail-surface integration
 * ══════════════════════════════════════════════════════════════════════ */

test('the detail sheet offers Swap only in editable contexts', () => {
  assert.match(PAGE, /id="detailSwapBtn" hidden/, 'hidden by default');
  const open = fnBody('openExerciseDetail');
  assert.match(open, /swapBtn\.hidden = !\(detailEditCtx/, 'shown only with an edit context');
  // The picker's detail call passes no edit context, so it stays read-only.
  const picker = fnBody('openDetailForPicker');
  assert.ok(!/mode:\s*'(workout|template)'/.test(picker),
    'picker detail must not offer a swap action');
});

test('detail → swap re-enters through the guarded entry points', () => {
  const body = fnBody('swapFromDetail');
  assert.match(body, /openSwapForWorkoutExercise\(/);
  assert.match(body, /openSwapForTemplateExercise\(/);
  assert.ok(!/applySwap\(/.test(body), 'it must not bypass the completed-set guard');
});

/* ══════════════════════════════════════════════════════════════════════════
 * §42 + §43 — mobile and accessibility
 * ══════════════════════════════════════════════════════════════════════ */

test('the swap sheet is height-bounded and clears the home indicator', () => {
  const sheet = rule('.swap-sheet');
  assert.ok(sheet, '.swap-sheet is defined');
  assert.match(sheet, /max-height:\s*min\(80vh,\s*100%\)/);
  assert.match(sheet, /env\(safe-area-inset-bottom/);
});

test('the candidate list scrolls with containment', () => {
  assert.match(PAGE, /class="swap-body mm-sheet-scroll"/);
  assert.match(rule('.swap-body'), /min-height:\s*0/);
});

test('long names and reason labels wrap rather than overflow', () => {
  assert.match(rule('.swap-item-name'), /overflow-wrap:\s*anywhere/);
  assert.match(rule('.swap-item-why'), /overflow-wrap:\s*anywhere/);
  assert.match(rule('.swap-source'), /overflow-wrap:\s*anywhere/);
});

test('every actionable swap control meets the 44px touch target', () => {
  assert.match(rule('.swap-item'), /min-height:\s*44px/);
  assert.match(rule('.btn-swap-manual'), /min-height:\s*44px/);
});

test('the reason is text, never colour or icon alone', () => {
  const render = fnBody('renderExerciseSwap');
  assert.match(render, /class="swap-item-why">' \+ esc\(c\.reason\)/,
    'the reason renders as escaped text content');
  assert.match(render, /data-lucide="arrow-right"[^>]*aria-hidden="true"/,
    'the chevron is decorative and hidden from assistive tech');
});

test('swap controls carry accessible names and the sheet has a real heading', () => {
  const labels = JS.match(/aria-label="Swap [^"]*for another exercise"/g) || [];
  assert.ok(labels.length >= 1, 'the swap control names the exercise it replaces');
  assert.match(PAGE, /<h2 class="detail-title" id="exerciseSwapTitle">/);
  assert.match(PAGE, /class="swap-group-label"/);
  assert.match(PAGE, /aria-label="Close swap options"/);
  assert.match(fnBody('openExerciseSwap'), /initialFocus:/, 'focus moves into the sheet');
});

test('the swap palette uses existing tokens and adds no new design system', () => {
  const decls = [rule('.swap-sheet'), rule('.swap-item'), rule('.swap-note'),
    rule('.swap-group-label'), rule('.btn-swap-manual')].join(' ');
  assert.deepStrictEqual(decls.match(/#[0-9a-fA-F]{3,8}/g) || [], [],
    'colour comes from tokens, never hardcoded hex');
  assert.ok(!/var\(--green/.test(decls), 'green remains a success state only');
});
