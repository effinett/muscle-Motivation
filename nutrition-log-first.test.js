// Nutrition page — log-first layout (roadmap 5.4 logging UI).
// Run via `npm test` (node --test). Static analysis of nutrition.html, the same
// style as nutrition-mobile.test.js: structure and wiring, no browser.

'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, 'nutrition.html'), 'utf8');
const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));

test('logging comes first: Quick Log sits above Daily Totals', () => {
  const ql = main.indexOf('<div class="section-label">Quick Log</div>');
  const totals = main.indexOf('<div class="section-label">Daily Totals</div>');
  assert.ok(ql > 0 && totals > 0, 'both sections exist');
  assert.ok(ql < totals, 'Quick Log is rendered before the totals');
  assert.strictEqual(main.split('id="aiLogInput"').length - 1, 1, 'exactly one Quick Log field');
});

test('the Quick Log form itself is unchanged (one field, same submit)', () => {
  assert.match(main, /<form class="ai-log-row" onsubmit="aiQuickLog\(event\)">\s*<input type="text" id="aiLogInput" maxlength="300" autocomplete="off"/);
  assert.match(main, /<button type="submit" class="ai-log-btn" id="aiLogBtn">Log<\/button>/);
  assert.match(html, /function focusQuickLogFromHash\(\)/, 'the Home deep link still lands on it');
});

test('search and barcode scan are one tap from the top, opening the existing modal', () => {
  assert.match(main, /class="log-action" onclick="openFoodSearch\(\)"/);
  assert.match(main, /class="log-action" onclick="openFoodScan\(\)"/);
  const search = html.match(/function openFoodSearch\(text\) \{([\s\S]*?)\n  \}/)[1];
  assert.match(search, /nuOpenModal\(\{ meal: suggestMeal\(\), date: currentDate \}\)/, 'same Add Food modal, suggested meal, current date');
  assert.match(search, /nuUsdaInputChanged\(\)/, 'carried text runs through the normal search input path');
  const scan = html.match(/function openFoodScan\(\) \{([\s\S]*?)\n  \}/)[1];
  assert.match(scan, /nuOpenModal\(/);
  assert.match(scan, /nuOpenScanner\(\)/);
});

test('as-you-type suggestions reuse the shared matcher and never bypass confirmation', () => {
  const fn = html.match(/function renderAiSuggest\(\) \{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /nuMatchOwnFoods\(nuOwnQueryText\(text\), pool, 3\)/, 'shared own-food matching, quantity words stripped');
  assert.match(fn, /text\.length < 2/, 'nothing is suggested for an empty field');
  assert.ok(!/fetch\(|supabaseClient/.test(fn), 'suggestions are local — no request per keystroke');
  const pick = html.match(/function pickAiSuggest\(i\) \{([\s\S]*?)\n  \}/)[1];
  assert.match(pick, /nuOpenModalWithFood\(item, \{ date: currentDate, meal: suggestMeal\(\) \}\)/,
    'a suggestion opens the same card a chip opens — the user still confirms');
  assert.ok(!/nuSave|nuSaveLog/.test(pick), 'tapping a suggestion logs nothing by itself');
});

test('typed text is cleared (and the dirty guard released) when it is handed to search', () => {
  const clear = html.match(/function clearQuickLogText\(\) \{([\s\S]*?)\n  \}/)[1];
  assert.match(clear, /input\.value = ''/);
  assert.match(clear, /MMDirty\.refresh\(\)/);
  assert.match(html, /function searchFromQuickLog\(\) \{[\s\S]*?clearQuickLogText\(\);\s*openFoodSearch\(text\);/);
});

test('new top-of-page controls clear the 44px touch floor and use no emoji', () => {
  for (const sel of ['.log-action', '.ai-suggest-row']) {
    const body = (html.match(new RegExp(sel.replace('.', '\\.') + '\\s*\\{([^}]*)\\}')) || [])[1] || '';
    assert.match(body, /min-height:\s*4[4-9]px/, sel + ' is at least 44px tall');
  }
  assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(main), 'no emoji in the page body');
});

test('favorites and recents share ONE "Your Foods" row fed by the shared pool', () => {
  assert.match(main, /<div class="section-label">Your Foods<\/div>\s*<div class="qa-chips" id="ownChips">/);
  assert.ok(!/id="favChips"|id="recentChips"/.test(html), 'the two separate rows are gone');
  assert.match(main, /<div class="section-label">Saved Meals<\/div>/, 'Saved Meals is untouched');
  const fn = html.match(/async function loadOwnChips\(force\) \{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /nuLoadOwnFoods\(!!force\)/, 'same pool as search and suggestions');
  assert.match(fn, /renderChips\('ownChips', ownItems, 'pickOwnChip'/);
  assert.match(html, /function pickOwnChip\(i\) \{\s*if \(ownItems\[i\]\) nuOpenModalWithFood\(ownItems\[i\], \{ date: currentDate, meal: suggestMeal\(\) \}\);/,
    'a chip opens the same card as before');
  // every existing refresh call site still refreshes the row
  assert.match(html, /function loadRecentChips\(\) \{ return loadOwnChips\(true\); \}/);
  assert.match(html, /function loadFavChips\(\) \{ return loadOwnChips\(true\); \}/);
  assert.match(html, /window\.onFavoritesChanged = loadFavChips;/);
  assert.match(html, /it\.own === 'favorite'/, 'favorites are marked on the chip');
});

test('page toast: optional action button, tracked timer, never tappable while hidden', () => {
  const fn = html.match(/function showToast\(msg, opts\) \{([\s\S]*?)\n  \}/)[1];
  assert.match(fn, /t\.textContent = msg;/, 'message is set as text, never HTML');
  assert.match(fn, /btn\.textContent = opts\.actionLabel;/, 'action label is text too');
  assert.match(fn, /if \(toastTimer\) clearTimeout\(toastTimer\);/, 'an older toast cannot cut a newer one short');
  assert.match(fn, /\(opts && opts\.duration\) \|\| 3000/, 'default duration unchanged for existing callers');
  const hide = html.match(/function hideToast\(\) \{([\s\S]*?)\n  \}/)[1];
  assert.match(hide, /btn\.remove\(\)/, 'the action is removed when the toast hides');
  assert.match(html, /\.toast:not\(\.show\) \{ pointer-events: none; \}/);
  assert.match(html, /\.toast-action \{[^}]*min-height:\s*44px/);
  assert.match(html, /<div class="toast" id="toast" role="status" aria-live="polite"><\/div>/);
});
