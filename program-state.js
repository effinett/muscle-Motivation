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

var PROGRAM_META = {
  fat_loss_blueprint: { name: '90 Day Fat Loss Blueprint', price: '$49', desc: '12-week fat loss system' },
  muscle_gain:        { name: 'Muscle Gain',               price: '$59', desc: '8-week hypertrophy program' },
  glute_builder:      { name: 'Glute Builder',             price: '$39', desc: "Women's lower-body program" },
};

var PROGRAM_URLS = {
  fat_loss_blueprint: 'program-fat-loss.html',
  muscle_gain:        'program-muscle-gain.html',
  glute_builder:      'program-glute-builder.html',
};

var GOAL_LABELS = { fatloss: 'Fat Loss', recomp: 'Recomposition', muscle: 'Muscle Gain' };
var GOAL_PROGRAM_MAP = { fatloss: 'fat_loss_blueprint', muscle: 'muscle_gain' };

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
function pgGoalMismatch(goal, activeSlug, ownedSlugs) {
  var expected = GOAL_PROGRAM_MAP[goal];
  if (!expected || expected === activeSlug) return null;
  if (!PROGRAM_META[expected]) return null;
  if (!ownedSlugs || ownedSlugs.indexOf(expected) < 0) return null;
  return { slug: expected, name: PROGRAM_META[expected].name, goalLabel: GOAL_LABELS[goal] || goal };
}

/* ── data access (browser) ──────────────────────────────────────────────── */

async function pgLoadOwnedPrograms(userId) {
  try {
    var res = await supabaseClient
      .from('purchases').select('product, status')
      .eq('user_id', userId).eq('status', 'active');
    if (res.error) throw res.error;
    var owned = [];
    (res.data || []).forEach(function (p) {
      if (PROGRAM_META[p.product] && owned.indexOf(p.product) < 0) owned.push(p.product);
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
  var meta = PROGRAM_META[activeSlug];
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
    PROGRAM_META: PROGRAM_META,
    PROGRAM_URLS: PROGRAM_URLS,
    GOAL_LABELS: GOAL_LABELS,
    GOAL_PROGRAM_MAP: GOAL_PROGRAM_MAP,
    pgSessionHref: pgSessionHref,
    pgSessionIndex: pgSessionIndex,
    pgGoalMismatch: pgGoalMismatch,
  };
}
