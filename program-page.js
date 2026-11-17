/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — shared Program page logic (Phase 4.3.9-L)
 *
 * Pure: no DOM, fetch, DB, env or clock. Used by program.html, the one page
 * that renders the six 4.3.9-L catalog Programs (Bodyweight Foundations and the
 * three original Programs keep their own pages).
 *
 * Three things live here:
 *
 *   1. resolveWeek(expectedKeys, loadedRows) — the user's week, in schedule
 *      order. Unlike program-bodyweight.html's resolver, a schedule MAY repeat
 *      a session (Home Strength's Conditioning & Core, Advanced Fat Loss's
 *      Upper). Every expected key must still have exactly one linked, well-
 *      formed Routine, or the whole week fails closed — never a partial week.
 *
 *   2. weekPlan(slug, days, keys) — the static "How to plan your week" copy
 *      (owner-approved 2026-11-17, decision 1g): suggested weekdays from the
 *      Program Catalog Plan. When the list is exactly one week long each day
 *      gets its session; otherwise the sessions rotate across the days.
 *      Guidance only — the app never pins a session to a weekday.
 *
 *   3. restNote(slug, key) — static session notes (decision 1g). Today only
 *      Advanced Fat Loss Full Body carries one. equipmentNote(slug) — the
 *      approved equipment copy (decision 1h: copy only, never a check).
 *
 * Only the six catalog Programs are planned here; any other slug returns null,
 * so nothing changes for existing Programs.
 *
 * Browser: global `ProgramPage`.  Node: guarded module.exports.
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  var CATALOG_SLUGS = Object.freeze({
    home_strength: true, home_fat_loss: true, bodyweight_fat_loss: true,
    advanced_muscle: true, advanced_fat_loss: true, advanced_home_strength: true
  });

  // Suggested weekdays (Program Catalog Plan, scheduling section).
  var DEFAULT_DAYS = Object.freeze({
    2: ['Mon', 'Thu'],
    3: ['Mon', 'Wed', 'Fri'],
    4: ['Mon', 'Tue', 'Thu', 'Fri'],
    5: ['Mon', 'Tue', 'Wed', 'Fri', 'Sat'],
    6: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  });
  // The two approved exceptions: a rest day in the right place.
  var DAY_OVERRIDES = Object.freeze({
    home_strength:     { 4: ['Mon', 'Wed', 'Fri', 'Sat'] },
    advanced_fat_loss: { 4: ['Mon', 'Tue', 'Thu', 'Sat'] }
  });

  var REST_NOTES = Object.freeze({
    advanced_fat_loss: {
      full_body: 'Don’t do this session the day after Lower. Leave at least one day in ' +
                 'between. An Upper day or a rest day both count.'
    }
  });

  // Equipment copy, from the approved plan's per-Program lists (decision 1h:
  // copy only — nothing here checks what a client owns).
  var EQUIPMENT_NOTES = Object.freeze({
    home_strength: 'A set of dumbbells (adjustable, or a few pairs) and a long resistance band. ' +
      'A door anchor is optional: for Band Chest Press you can wrap the band behind your upper back. ' +
      'No bench or furniture needed.',
    home_fat_loss: 'A set of dumbbells (adjustable, or a few pairs), a long resistance band and a mini band. ' +
      'A door anchor is optional: for Band Chest Press you can wrap the band behind your upper back. ' +
      'No bench or furniture needed.',
    advanced_home_strength: 'A set of dumbbells (adjustable, or a few pairs), a long resistance band and a mini band. ' +
      'A door anchor is optional: for Band Chest Press you can wrap the band behind your upper back. ' +
      'No bench or furniture needed.',
    bodyweight_fat_loss: 'No equipment needed, just floor space. No-equipment training cannot fully train ' +
      'pulling muscles; add rows, pulldowns or chin-ups when equipment is available.',
    advanced_muscle: 'A full gym: barbell, squat rack, benches, dumbbells, a cable station, leg press, leg curl, ' +
      'leg extension and calf raise machines, and a pull-up bar.',
    advanced_fat_loss: 'A full gym: barbell, squat rack, benches, dumbbells, a trap bar, a kettlebell, a cable ' +
      'station, leg curl and calf raise machines, and a pull-up bar.'
  });

  function isCatalogProgram(slug) {
    return typeof slug === 'string' && CATALOG_SLUGS[slug] === true;
  }

  // The canonical page for a catalog Program. Migrations set page_path to this.
  function pagePathFor(slug) {
    return isCatalogProgram(slug) ? 'program.html?slug=' + slug : null;
  }

  /* → { ok: true, sessions: [{ session_key, name, position }] }
   * → { ok: false, reason: 'invalid_expected'|'invalid_loaded'|'duplicate'|'missing' } */
  function resolveWeek(expectedKeys, loadedRows) {
    if (!Array.isArray(expectedKeys) || !expectedKeys.length) return { ok: false, reason: 'invalid_expected' };
    var wanted = {};
    for (var i = 0; i < expectedKeys.length; i++) {
      var key = expectedKeys[i];
      if (typeof key !== 'string' || !key) return { ok: false, reason: 'invalid_expected' };
      wanted[key] = true;                       // repeats are allowed in the schedule
    }
    if (!Array.isArray(loadedRows)) return { ok: false, reason: 'invalid_loaded' };

    var byKey = {};
    for (var j = 0; j < loadedRows.length; j++) {
      var row = loadedRows[j];
      if (!row || typeof row !== 'object') continue;
      var k = row.session_key;
      if (typeof k !== 'string' || !k || !wanted[k]) continue;   // extras never render
      if (typeof row.name !== 'string' || !row.name) return { ok: false, reason: 'invalid_loaded' };
      if (byKey[k]) return { ok: false, reason: 'duplicate' };    // two Routines for one key
      byKey[k] = row;
    }

    var sessions = [];
    for (var m = 0; m < expectedKeys.length; m++) {
      var want = expectedKeys[m];
      if (!byKey[want]) return { ok: false, reason: 'missing' };
      sessions.push({ session_key: want, name: byKey[want].name, position: m + 1 });
    }
    return { ok: true, sessions: sessions };
  }

  function validDays(days) {
    return typeof days === 'number' && days >= 2 && days <= 6 && Math.floor(days) === days;
  }

  /* → null for a non-catalog slug, an invalid frequency or an empty list.
   * → { mode: 'fixed',  rows: [{ day, key }] }      list length === days
   * → { mode: 'rotate', days: [..], keys: [..] }    sessions rotate across the days */
  function weekPlan(slug, days, keys) {
    if (!isCatalogProgram(slug) || !validDays(days)) return null;
    if (!Array.isArray(keys) || !keys.length) return null;
    var override = DAY_OVERRIDES[slug] && DAY_OVERRIDES[slug][days];
    var layout = (override || DEFAULT_DAYS[days]).slice();
    if (keys.length === days) {
      return { mode: 'fixed', rows: layout.map(function (d, i) { return { day: d, key: keys[i] }; }) };
    }
    return { mode: 'rotate', days: layout, keys: keys.slice() };
  }

  function restNote(slug, key) {
    if (!isCatalogProgram(slug)) return null;
    var notes = REST_NOTES[slug];
    return (notes && typeof key === 'string' && notes[key]) || null;
  }

  function equipmentNote(slug) {
    return isCatalogProgram(slug) ? EQUIPMENT_NOTES[slug] : null;
  }

  var api = {
    CATALOG_SLUGS: Object.freeze(Object.keys(CATALOG_SLUGS)),
    isCatalogProgram: isCatalogProgram,
    pagePathFor: pagePathFor,
    resolveWeek: resolveWeek,
    weekPlan: weekPlan,
    restNote: restNote,
    equipmentNote: equipmentNote
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ProgramPage = api;
})(typeof window !== 'undefined' ? window : this);
