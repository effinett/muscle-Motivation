// exercise-prefs-ui.test.js — Phase 4.3.6J contract for Favorites & Recents as
// wired into workout.html.
//
// Same static-analysis style as workout-picker / exercise-detail-ui /
// exercise-substitution-ui. The critical assertions are the ISOLATION ones: the
// favorite control must never select, add, resolve or swap, and shortcut rows
// must reuse the single existing selection path so every picker mode keeps its
// semantics. RLS is proven live, not here.

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

// Comments describe intent — including intent to NOT do something — so a
// forbidden-token scan must read code only, or a comment saying "never ranked by
// frequency" would fail a test asserting there is no frequency ranking.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

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

test('the prefs core loads after exercise-log so identity never forks', () => {
  const prefs = PAGE.indexOf('src="exercise-prefs.js"');
  const log = PAGE.indexOf('src="exercise-log.js"');
  assert.ok(prefs > 0 && log > 0 && log < prefs);
});

/* ══════════════════════════════════════════════════════════════════════════
 * §19 — the favorite control is ISOLATED from every other picker action
 * ══════════════════════════════════════════════════════════════════════ */

test('the favorite control stops the event so it can never reach the row', () => {
  const body = fnBody('toggleFavorite');
  assert.ok(body, 'toggleFavorite exists');
  assert.match(body, /ev\.stopPropagation\(\)/, 'must not bubble to the select handler');
  assert.match(body, /ev\.preventDefault\(\)/);
});

test('favoriting never selects, adds, resolves or swaps', () => {
  ['toggleFavorite', 'favBtnHtml', 'detailFavHtml', 'repaintFavoriteControls'].forEach((n) => {
    const body = fnBody(n);
    assert.ok(body, n + ' exists');
    ['selectExercise(', 'applySwap(', 'applyReviewResolution(', 'addTemplateExercise(',
      'closePicker(', 'openExerciseSwap('].forEach((bad) => {
      assert.ok(!body.includes(bad), n + ' must not call ' + bad);
    });
  });
});

test('the favorite button carries no select handler of its own', () => {
  const body = fnBody('favBtnHtml');
  assert.match(body, /onclick="toggleFavorite\(event,/);
  assert.ok(!/selectExercise|openDetailForPicker/.test(body),
    'the favorite control does exactly one thing');
});

test('a picker row now has three distinct controls, all siblings', () => {
  const body = fnBody('pickerRowHtml');
  assert.match(body, /onclick="selectExercise\(/);
  assert.match(body, /favBtnHtml\(name, id, customId\)/);
  assert.match(body, /onclick="openDetailForPicker\(/);
  // favBtnHtml is inserted BETWEEN the closed select button and the info button.
  const selectClose = body.indexOf('</button>');
  const fav = body.indexOf('favBtnHtml(');
  assert.ok(selectClose > -1 && selectClose < fav, 'the select button is closed before the favorite button');
});

/* ══════════════════════════════════════════════════════════════════════════
 * §7 + §9 — identity, never names; legacy is not favoritable
 * ══════════════════════════════════════════════════════════════════════ */

test('no favorite control is rendered for a reference without a stable identity', () => {
  const body = fnBody('favBtnHtml');
  assert.match(body, /if \(!ExercisePrefs\.canFavorite\(ref\)\) return '';/,
    'legacy/free-typed rows get no control at all');
  const detail = fnBody('detailFavHtml');
  assert.match(detail, /canFavorite\(ref\)/);
});

test('the favorite write is built by the shared core, never assembled ad hoc', () => {
  const body = fnBody('toggleFavorite');
  assert.match(body, /ExercisePrefs\.favoriteRow\(ref, currentUser\.id\)/);
  assert.match(body, /ExercisePrefs\.favoriteMatch\(ref\)/);
  // The payload shape is owned by the core; assert there too, comment-free.
  const core = stripComments(read('exercise-prefs.js'));
  const rowFn = core.slice(core.indexOf('function favoriteRow'), core.indexOf('function favoriteMatch'));
  assert.ok(!/exercise_name|\bname\b\s*:/.test(rowFn), 'a favorite row must carry no name');
});

test('a custom id is only ever used in the custom slot', () => {
  const body = fnBody('toggleFavorite');
  assert.match(body, /customId: \(!id && customId\)/,
    'a custom id can never be written as a canonical exercise_id');
});

/* ══════════════════════════════════════════════════════════════════════════
 * §20 + §21 + §22 + §23 — picker modes reuse ONE selection path
 * ══════════════════════════════════════════════════════════════════════ */

test('shortcut rows are built by pickerRowHtml — no second selection path', () => {
  const body = fnBody('shortcutSectionHtml');
  assert.ok(body, 'shortcutSectionHtml exists');
  assert.match(body, /pickerRowHtml\(/, 'reuses the one row builder');
  assert.ok(!/onclick="(?!)/.test(body.replace(/pickerRowHtml\([^)]*\)/g, '')),
    'it adds no click handler of its own');
});

test('selection still routes through the single mode switch', () => {
  const sel = fnBody('selectExercise');
  ['template', 'resolve', 'swap'].forEach((m) => {
    assert.ok(sel.includes("pickerMode === '" + m + "'"), 'mode ' + m + ' still handled');
  });
  // Exactly one selectExercise definition — favorites did not fork it.
  const defs = (JS.match(/function selectExercise\s*\(/g) || []).length;
  assert.strictEqual(defs, 1);
});

test('no favorites/recents code branches on picker mode', () => {
  ['shortcutsHtml', 'shortcutSectionHtml', 'favBtnHtml', 'toggleFavorite', 'loadPickerPrefs']
    .forEach((n) => {
      const body = fnBody(n);
      assert.ok(!/pickerMode/.test(body), n + ' must be mode-agnostic');
    });
});

/* ══════════════════════════════════════════════════════════════════════════
 * §17 — information architecture
 * ══════════════════════════════════════════════════════════════════════ */

test('shortcuts show only while the query is empty', () => {
  const body = fnBody('filterPicker');
  assert.match(body, /ExercisePrefs\.shouldShowShortcuts\(q\)/,
    'a typed query must give the list to search results');
});

test('shortcuts render above the browse list, not interleaved with results', () => {
  const body = fnBody('filterPicker');
  assert.match(body, /var listHtml = shortcuts \+/);
});

/* ══════════════════════════════════════════════════════════════════════════
 * §21 + §31 + §46 — no ranking or AI contamination
 * ══════════════════════════════════════════════════════════════════════ */

test('favorites never influence substitution ranking or search order', () => {
  const subs = stripComments(read('exercise-substitution.js'));
  ['favorite', 'Favorite', 'recent', 'Recent', 'ExercisePrefs']
    .forEach((t) => assert.ok(!subs.includes(t), 'the substitution engine must not know about ' + t));
  const filters = stripComments(read('exercise-filters.js'));
  assert.ok(!/ExercisePrefs|favorite/i.test(filters), 'discovery ranking stays unaware of preference');
});

test('the prefs core contains no frequency, popularity or AI ranking', () => {
  const src = stripComments(read('exercise-prefs.js'));
  ['mostUsed', 'most_used', 'frequency', 'popular', 'trending', 'score', '/api/', 'anthropic']
    .forEach((t) => assert.ok(!src.toLowerCase().includes(t.toLowerCase()), 'found ' + t));
});

test('recents are derived, never persisted as a preference', () => {
  const src = stripComments(read('exercise-prefs.js'));
  assert.ok(!/user_exercise_recents|recents_table/i.test(src),
    'there is no recents table and no recents persistence');
  assert.ok(!/supabaseClient|fetch\(/.test(src), 'the core never persists anything itself');
  const load = fnBody('loadPickerPrefs');
  assert.ok(!/\.insert\(|\.upsert\(|\.update\(|\.delete\(/.test(load),
    'loading shortcuts must never write');
});

test('viewing a detail sheet is not "use" — it never feeds recents', () => {
  ['openExerciseDetail', 'renderExerciseDetail', 'openDetailForPicker'].forEach((n) => {
    const body = fnBody(n);
    assert.ok(!/recentUsages\s*=|loadPickerPrefs\(/.test(body),
      n + ' must not record or refresh recents');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * §26 + §25 — idempotence and optimistic rollback
 * ══════════════════════════════════════════════════════════════════════ */

test('a double tap cannot double-write', () => {
  const body = fnBody('toggleFavorite');
  assert.match(body, /beginAction\(lockKey\)/);
  assert.match(body, /endAction\(lockKey\)/);
  assert.match(body, /lockKey = 'fav:' \+ key/, 'the lock is per exercise, not global');
});

test('the insert is conflict-safe so a repeat favorite is a no-op', () => {
  const body = fnBody('toggleFavorite');
  assert.match(body, /\.upsert\(/);
  assert.match(body, /onConflict:/);
});

test('onConflict names the exact column pairs the DB constraints must carry', () => {
  // Regression, found in production validation: the migration first created
  // PARTIAL unique indexes (WHERE ... is not null). Postgres only matches a
  // partial index when the statement repeats its WHERE predicate, which
  // PostgREST's onConflict does not emit — so every favorite insert failed with
  // 42P10 and silently rolled back. Fixed by replacing them with plain uniques
  // (NULLs are distinct, so many custom favorites still coexist), the same shape
  // Phase 4.2.1K used on personal_records. This is the trap CLAUDE.md §9 records.
  const body = fnBody('toggleFavorite');
  assert.match(body, /onConflict: id \? 'user_id,exercise_id' : 'user_id,user_exercise_id'/,
    'the client targets these constraints by name — they must exist as PLAIN uniques');
});

test('a failed write rolls the optimistic state back and tells the user', () => {
  const body = fnBody('toggleFavorite');
  assert.match(body, /catch \(e\)/);
  assert.match(body, /if \(wasOn\) favoriteIndex\[key\] = 1; else delete favoriteIndex\[key\]/);
  assert.match(body, /showToast\(/);
});

test('toggling repaints in place rather than rebuilding the list under the finger', () => {
  const body = fnBody('toggleFavorite');
  assert.match(body, /repaintFavoriteControls\(\)/);
  assert.ok(!/filterPicker\(/.test(body), 'a full re-render would move rows mid-tap');
});

/* ══════════════════════════════════════════════════════════════════════════
 * §29 — performance
 * ══════════════════════════════════════════════════════════════════════ */

test('nothing is fetched during Train bootstrap', () => {
  const boot = fnBody('loadExerciseLibrary');
  assert.ok(!/user_exercise_favorites|loadPickerPrefs/.test(boot),
    'shortcuts must not be eagerly loaded on every Train navigation');
});

test('shortcuts load lazily on first picker open and are then cached', () => {
  const open = fnBody('openPickerFor');
  assert.match(open, /favoriteRows === null \|\| recentUsages === null/,
    'only loads when not already cached');
  assert.match(open, /loadPickerPrefs\(\)/);
  const load = fnBody('loadPickerPrefs');
  assert.match(load, /if \(prefsLoading\) return prefsLoading/, 'concurrent opens share one load');
  assert.match(load, /if \(favoriteRows !== null && recentUsages !== null\) return Promise\.resolve\(\)/);
});

test('the recents query is bounded and owner-scoped, never a full history scan', () => {
  const load = fnBody('loadPickerPrefs');
  assert.match(load, /\.eq\('user_id', currentUser\.id\)/, 'favorites are owner-scoped');
  assert.match(load, /\.limit\(15\)/, 'a bounded window of recent sessions');
  assert.match(load, /\.eq\('completed', true\)/);
  assert.match(load, /\.in\('workout_id',/, 'one batched read, not N+1 per workout');
});

test('a failed shortcut load degrades to a working picker', () => {
  const load = fnBody('loadPickerPrefs');
  assert.match(load, /catch \(e\)/);
  assert.match(load, /if \(recentUsages === null\) recentUsages = \[\]/);
});

/* ══════════════════════════════════════════════════════════════════════════
 * §32 + §33 — history and other data are untouched
 * ══════════════════════════════════════════════════════════════════════ */

test('favorites code writes to exactly one table', () => {
  const bodies = ['toggleFavorite', 'loadPickerPrefs'].map(fnBody).join('\n');
  const tables = Array.from(new Set((bodies.match(/from\('([a-z_]+)'\)/g) || [])
    .map((s) => s.slice(6, -2)))).sort();
  assert.deepStrictEqual(tables, ['user_exercise_favorites', 'workout_exercises', 'workouts']);
  // …and only the favorites table is ever written.
  const writes = bodies.match(/from\('([a-z_]+)'\)\s*\n?\s*\.(insert|upsert|update|delete)/g) || [];
  writes.forEach((w) => assert.ok(w.includes('user_exercise_favorites'),
    'unexpected write: ' + w));
});

test('unfavoriting removes only the preference row', () => {
  const body = fnBody('toggleFavorite');
  const del = body.slice(body.indexOf('if (wasOn)'), body.indexOf('} else {'));
  assert.match(del, /from\('user_exercise_favorites'\)\.delete\(\)/);
  ['exercises', 'user_exercises', 'workouts', 'workout_templates']
    .forEach((t) => assert.ok(!del.includes("'" + t + "'")));
});

/* ══════════════════════════════════════════════════════════════════════════
 * §42 + §43 + §44 — mobile, accessibility, visual
 * ══════════════════════════════════════════════════════════════════════ */

test('favorite controls meet the 44px touch target', () => {
  assert.match(rule('.picker-item-fav'), /min-width:\s*44px/);
  assert.match(rule('.detail-fav'), /min-width:\s*44px/);
  assert.match(rule('.detail-fav'), /min-height:\s*44px/);
  assert.match(rule('.picker-row'), /align-items:\s*stretch/,
    'the picker control inherits full row height');
});

test('favorite state is exposed to assistive tech, not implied by colour', () => {
  const body = fnBody('favBtnHtml');
  assert.match(body, /aria-pressed="/);
  assert.match(body, /aria-label="' \+ \(on \? 'Remove '/, 'the label changes with state');
  assert.match(body, /data-lucide="star"[^>]*aria-hidden="true"/);
  const detail = fnBody('detailFavHtml');
  assert.match(detail, /aria-pressed="/);
});

test('a repaint keeps aria state in step with the visual state', () => {
  const body = fnBody('repaintFavoriteControls');
  assert.match(body, /setAttribute\('aria-pressed'/);
  assert.match(body, /setAttribute\('aria-label'/);
  assert.match(body, /classList\.toggle\('is-on'/);
});

test('shortcut sections use real headings and readable empty copy', () => {
  const body = fnBody('shortcutSectionHtml');
  assert.match(body, /<h3 class="picker-shortcut-label">/);
  assert.match(body, /picker-shortcut-empty/);
  const src = read('exercise-prefs.js');
  assert.match(src, /favoritesEmpty: 'Favorite exercises to keep them handy\.'/);
  assert.match(src, /recentsEmpty: 'Exercises you use will appear here\.'/);
});

test('long names wrap in shortcut rows and empty states', () => {
  assert.match(rule('.picker-item-name'), /overflow-wrap:\s*anywhere/);
  assert.match(rule('.picker-shortcut-empty'), /overflow-wrap:\s*anywhere/);
});

test('the favorite state uses the brand accent, never the success green', () => {
  const decls = [rule('.picker-item-fav'), rule('.picker-item-fav.is-on'),
    rule('.detail-fav'), rule('.detail-fav.is-on'), rule('.picker-shortcut-label')].join(' ');
  assert.deepStrictEqual(decls.match(/#[0-9a-fA-F]{3,8}/g) || [], [],
    'colour comes from tokens');
  assert.ok(!/var\(--green/.test(decls), 'green means completed in this app, not preferred');
  assert.match(rule('.picker-item-fav.is-on'), /var\(--red\)/);
});

/* ══════════════════════════════════════════════════════════════════════════
 * §45 — no scope creep
 * ══════════════════════════════════════════════════════════════════════ */

test('no exercise reordering was pulled forward', () => {
  const src = stripComments(read('exercise-prefs.js'));
  ['draggable', 'dragstart', 'reorder', 'sortable']
    .forEach((t) => assert.ok(!src.toLowerCase().includes(t), 'found ' + t));
});
