/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Program / Session State  ·  Phase 4.3.4 (CP3)
 *
 * The shared answer to "which program is active, and which session is next?".
 * Moved VERBATIM in behaviour out of app.html so Home and Profile consume one
 * implementation instead of two. Same split as weight.js: pure helpers that
 * Node can test, plus thin data access for the browser.
 *
 * Schedules themselves stay owned by schedules.js (getScheduleForDays /
 * SESSION_LABELS) — this module resolves STATE, it does not define schedules.
 *
 * Browser: globals below. Node: guarded module.exports of the pure parts.
 * ──────────────────────────────────────────────────────────────────────── */

/* Catalog access. Browser: program-catalog.js defines these globals and must
 * load first. Node: required directly, the same dual-runtime bridge
 * food-memory.js uses for food-ranking/food-core. */
var _cat = (typeof require === 'function') ? require('./program-catalog.js') : null;

function _pcByGoal(list, g)  { return _cat ? _cat.pcByGoal(list, g)  : pcByGoal(list, g); }
function _pcBySlug(list, s)  { return _cat ? _cat.pcBySlug(list, s)  : pcBySlug(list, s); }
function _pcIsProgram(l, p)  { return _cat ? _cat.pcIsProgramProduct(l, p) : pcIsProgramProduct(l, p); }

/* Program identity and catalog metadata moved to the canonical catalog in
 * Phase 4.3.6 CP1b. PROGRAM_META, PROGRAM_URLS and GOAL_PROGRAM_MAP were
 * retired — program-catalog.js reads public.programs instead, so name,
 * description, page path and goal→program all have one source.
 *
 * GOAL_LABELS stays here on purpose: it is the USER's goal vocabulary
 * (profiles.goal), not Program catalog metadata. profile.html renders the
 * user's own goal with it. Programs merely reuse the same vocabulary. */
var GOAL_LABELS = { fatloss: 'Fat Loss', recomp: 'Recomposition', muscle: 'Muscle Gain' };

/* ── pure ───────────────────────────────────────────────────────────────── */

// The launch URL for a program session. Dashboard launches are the progression
// driver (mode=progression); any other session the user picks is a one-off
// (mode=optional) and must never advance current_index.
function pgSessionHref(slug, sessionKey, isRecommended) {
  return 'workout.html?program=' + encodeURIComponent(slug) +
    '&session=' + encodeURIComponent(sessionKey) +
    '&mode=' + (isRecommended ? 'progression' : 'optional');
}

// Which index in `keys` the user is on, tolerating a schedule that changed
// under them (training_days edits remap the schedule).
function pgSessionIndex(keys, currentIndex) {
  if (!keys || !keys.length) return 0;
  var i = parseInt(currentIndex, 10);
  if (!isFinite(i) || i < 0) i = 0;
  return i % keys.length;
}

// Suggest the program that matches the user's stated goal, when they own it
// and it is not already active. Returns null when there is nothing to suggest.
// `catalog` is the loaded Program catalog; goal→program resolution comes from
// it (lowest sort_order wins) rather than the retired GOAL_PROGRAM_MAP.
function pgGoalMismatch(goal, activeSlug, ownedSlugs, catalog) {
  var match = _pcByGoal(catalog || [], goal);
  if (!match || match.slug === activeSlug) return null;
  if (!ownedSlugs || ownedSlugs.indexOf(match.slug) < 0) return null;
  return { slug: match.slug, name: match.name, goalLabel: GOAL_LABELS[goal] || goal };
}

/* ── data access (browser) ──────────────────────────────────────────────── */

// The catalog fetch runs IN PARALLEL with the purchases query, not before it,
// so routing this through the canonical catalog costs no extra round trip on
// the critical path. After the first page load in a session the catalog is
// cached and pcLoadCatalog() resolves without any network at all.
async function pgLoadOwnedPrograms(userId) {
  try {
    var both = await Promise.all([
      pcLoadCatalog(),
      supabaseClient.from('purchases').select('product, status')
        .eq('user_id', userId).eq('status', 'active'),
    ]);
    var catalog = both[0];
    var res = both[1];
    if (res.error) throw res.error;
    var owned = [];
    (res.data || []).forEach(function (p) {
      if (_pcIsProgram(catalog, p.product) && owned.indexOf(p.product) < 0) {
        owned.push(p.product);
      }
    });
    return owned;
  } catch (e) {
    console.error('pgLoadOwnedPrograms:', e);
    return [];
  }
}

// Resolves the active program, clearing a stale one and auto-selecting when the
// user owns exactly one. Mutates `profile.active_program` to stay in sync.
async function pgResolveActive(userId, profile, owned) {
  var activeSlug = (profile && profile.active_program) || null;
  if (activeSlug && owned.indexOf(activeSlug) < 0) {
    activeSlug = null;
    await supabaseClient.from('profiles').update({ active_program: null }).eq('id', userId);
    if (profile) profile.active_program = null;
  }
  if (!activeSlug && owned.length === 1) {
    activeSlug = owned[0];
    await supabaseClient.from('profiles').update({ active_program: activeSlug }).eq('id', userId);
    if (profile) profile.active_program = activeSlug;
  }
  return activeSlug;
}

// The next session for the active program. Auto-remaps a stored schedule that
// no longer matches the user's training_days, preserving their place.
async function pgResolveSession(userId, activeSlug, trainingDays) {
  // Cache-only read: pgLoadOwnedPrograms already warmed the catalog earlier in
  // this same flow, so this adds no request. Returning null when the Program is
  // unknown reproduces the retired `if (!PROGRAM_META[activeSlug]) return null`.
  var meta = _pcBySlug(pcCached() || [], activeSlug);
  if (!meta) return null;

  var correctKeys = getScheduleForDays(activeSlug, trainingDays);
  var up = null;
  try {
    var res = await supabaseClient
      .from('user_programs').select('id, schedule_keys, current_index')
      .eq('user_id', userId).eq('program_slug', activeSlug).maybeSingle();
    up = res.data || null;
  } catch (e) { /* degrade to the correct default schedule */ }

  var keys, idx;
  if (!up || !(up.schedule_keys || []).length) {
    keys = correctKeys;
    idx = 0;
  } else {
    keys = up.schedule_keys;
    idx = pgSessionIndex(keys, up.current_index);
    if (keys.join(',') !== correctKeys.join(',')) {
      var curKey = keys[idx];
      var newIdx = correctKeys.indexOf(curKey);
      if (newIdx < 0) newIdx = idx % correctKeys.length;
      supabaseClient.from('user_programs')
        .update({ schedule_keys: correctKeys, current_index: newIdx })
        .eq('id', up.id).then(function () {});
      keys = correctKeys;
      idx = newIdx;
    }
  }

  var sessionKey = keys[pgSessionIndex(keys, idx)];
  return {
    slug: activeSlug,
    name: meta.name,
    keys: keys,
    sessionKey: sessionKey,
    sessionLabel: (typeof SESSION_LABELS !== 'undefined' && SESSION_LABELS[sessionKey]) || sessionKey,
    href: pgSessionHref(activeSlug, sessionKey, true),
  };
}

async function pgSetActive(userId, slug) {
  await supabaseClient.from('profiles').update({ active_program: slug }).eq('id', userId);
}

// training_days is a GLOBAL profile setting — one source of truth, no per-program
// frequency. Remaps every owned program at once when it changes.
async function pgRemapAllSchedules(userId, ownedSlugs, newTrainingDays) {
  if (!ownedSlugs || !ownedSlugs.length) return;
  var res = await supabaseClient
    .from('user_programs').select('*')
    .eq('user_id', userId).in('program_slug', ownedSlugs);
  var rowMap = {};
  (res.data || []).forEach(function (r) { rowMap[r.program_slug] = r; });
  var days = parseInt(newTrainingDays, 10) || 3;

  await Promise.all(ownedSlugs.map(async function (slug) {
    var up = rowMap[slug];
    if (!up) return; // no row yet — bootstrapped on first workout finish
    var newKeys = getScheduleForDays(slug, days);
    var oldKeys = up.schedule_keys || [];
    if (oldKeys.join(',') === newKeys.join(',')) return;
    var curKey = oldKeys[pgSessionIndex(oldKeys, up.current_index)];
    var newIdx = newKeys.indexOf(curKey);
    if (newIdx < 0) newIdx = pgSessionIndex(newKeys, up.current_index);
    await supabaseClient.from('user_programs')
      .update({ schedule_keys: newKeys, current_index: newIdx })
      .eq('id', up.id);
  }));
}

/* Node: export the PURE parts only (no fetchers — they need supabaseClient). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GOAL_LABELS: GOAL_LABELS,
    pgSessionHref: pgSessionHref,
    pgSessionIndex: pgSessionIndex,
    pgGoalMismatch: pgGoalMismatch,
  };
}
