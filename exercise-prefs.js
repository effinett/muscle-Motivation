/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Shared Exercise Favorites & Recents Core (Phase 4.3.6J)
 *
 * The personalization sibling of exercise-core.js (identity), exercise-custom.js
 * (lifecycle), exercise-filters.js (discovery), exercise-log.js (logging),
 * exercise-detail.js (presentation) and exercise-substitution.js (swap).
 *
 * It owns two shortcuts that make the picker faster, and nothing else:
 *
 *   FAVORITES — what the user EXPLICITLY marked. Never inferred, never implied
 *               by frequency, never written without a deliberate tap.
 *   RECENTS   — what the user ACTUALLY TRAINED, derived from workout history.
 *               Never a stored preference, never manually curated, and never
 *               fed by browsing: opening a picker, viewing a detail sheet or
 *               seeing a substitution suggestion is NOT use.
 *
 * Pure by contract: DOM-free, fetch-free, DB-free, deterministic. The caller
 * fetches rows; this module decides what they MEAN and in what order they show.
 *
 * ── IDENTITY, NEVER NAMES ─────────────────────────────────────────────────
 * Every favorite and every recent is keyed by a STABLE ID — canonical
 * `exercises.id` or the user's own `user_exercises.id` — reusing
 * ExerciseLog.identityType so this never forks from logged identity. There is
 * no name matching and no alias resolution anywhere in this module, so:
 *   • renaming an exercise cannot break a favorite;
 *   • a legacy name-only history row can NEVER become a favorite or a canonical
 *     recent, because it has no id to key on. It is dropped, never guessed.
 *
 * ── DELIBERATELY NOT BUILT ────────────────────────────────────────────────
 * No frequency ranking, no "most used", no popularity, no trending, no cross-
 * user aggregate, no AI ordering, no blending of favorites into substitution
 * scoring. Recent means recent; favorite means the user said so.
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  /* ── Shared identity classifier (reuse; never fork) ─────────────────────── */
  var _EL = (function () {
    if (root && root.ExerciseLog) return root.ExerciseLog;
    if (typeof module !== 'undefined' && module.exports) {
      try { return require('./exercise-log'); } catch (e) { return null; }
    }
    return null;
  })();

  function identityType(ref) {
    if (_EL && typeof _EL.identityType === 'function') return _EL.identityType(ref);
    if (!ref) return 'legacy';
    var hasCanon = ref.exerciseId != null, hasCustom = ref.customId != null;
    if (hasCanon && hasCustom) return 'invalid';
    if (hasCanon) return 'canonical';
    if (hasCustom) return 'custom';
    return 'legacy';
  }

  var LIMITS = {
    recents: 8,        // short by design — a shortcut, not a history browser
    favorites: 20      // a guard against an unbounded list, not a cap users hit
  };

  var COPY = {
    favoritesEmpty: 'Favorite exercises to keep them handy.',
    recentsEmpty: 'Exercises you use will appear here.'
  };

  /* ── Identity keys ────────────────────────────────────────────────────────
   * The one string that says "this exact exercise". Distinct prefixes mean a
   * canonical key can never collide with a custom key, and a legacy reference
   * yields null — which is what makes "legacy is not favoritable" a property of
   * the data model rather than a UI rule someone could forget. */
  function identityKey(ref) {
    var t = identityType(ref);
    if (t === 'canonical') return 'canon:' + String(ref.exerciseId);
    if (t === 'custom') return 'custom:' + String(ref.customId);
    return null;                       // legacy + invalid: no stable identity
  }

  function canFavorite(ref) { return identityKey(ref) !== null; }

  /* The row a favorite INSERT should carry. Returns null when the reference has
   * no stable identity, so an un-favoritable thing cannot reach the DB. */
  function favoriteRow(ref, userId) {
    var t = identityType(ref);
    if (!userId) return null;
    if (t === 'canonical') return { user_id: userId, exercise_id: ref.exerciseId, user_exercise_id: null };
    if (t === 'custom') return { user_id: userId, exercise_id: null, user_exercise_id: ref.customId };
    return null;
  }

  /* Match filter for deleting a favorite — the mirror of favoriteRow. */
  function favoriteMatch(ref) {
    var t = identityType(ref);
    if (t === 'canonical') return { column: 'exercise_id', value: ref.exerciseId };
    if (t === 'custom') return { column: 'user_exercise_id', value: ref.customId };
    return null;
  }

  /* ── Favorites ────────────────────────────────────────────────────────────
   * `rows` are user_exercise_favorites records. Produces both a membership set
   * (for rendering toggle state cheaply) and an ordered display list. */
  // `|| []` is not enough: a string or number would pass through it and then
  // fail on .forEach/.filter. Every public entry point takes this guard.
  function asArray(v) { return Array.isArray(v) ? v : []; }

  function indexFavorites(rows) {
    var set = {};
    asArray(rows).forEach(function (r) {
      if (!r) return;
      if (r.exercise_id != null) set['canon:' + String(r.exercise_id)] = 1;
      else if (r.user_exercise_id != null) set['custom:' + String(r.user_exercise_id)] = 1;
    });
    return set;
  }

  function isFavorited(favIndex, ref) {
    var k = identityKey(ref);
    return !!(k && favIndex && favIndex[k]);
  }

  /* Ordering: MOST RECENTLY FAVORITED FIRST — the documented choice (§16).
   * Deliberately not frequency, not alphabetical: a just-favorited exercise
   * appearing at the top is the immediate feedback the action deserves.
   * created_at desc, then key, so equal timestamps never reorder run to run. */
  function sortFavorites(rows) {
    return asArray(rows).filter(Boolean).slice().sort(function (a, b) {
      var at = String(a.created_at || ''), bt = String(b.created_at || '');
      if (at !== bt) return at < bt ? 1 : -1;
      var ak = a.exercise_id != null ? 'canon:' + a.exercise_id : 'custom:' + a.user_exercise_id;
      var bk = b.exercise_id != null ? 'canon:' + b.exercise_id : 'custom:' + b.user_exercise_id;
      return ak < bk ? -1 : (ak > bk ? 1 : 0);
    });
  }

  /* Resolve favorite rows to displayable entries against the catalogs the page
   * already holds. An entry that cannot be resolved is DROPPED, never rendered
   * from a stored name — the table stores no name precisely so this cannot
   * drift. Drops cover: a canonical row gone inactive (§34 — the preference
   * survives in the DB, the picker just doesn't offer it) and a custom that was
   * archived or is no longer visible to this user. */
  function buildFavorites(rows, catalogs, opts) {
    var o = opts || {};
    var limit = o.limit != null ? o.limit : LIMITS.favorites;
    var canonById = (catalogs && catalogs.canonicalById) || {};
    var customById = (catalogs && catalogs.customById) || {};
    var out = [];
    sortFavorites(rows).forEach(function (r) {
      if (out.length >= limit) return;
      if (r.exercise_id != null) {
        var c = canonById[String(r.exercise_id)];
        if (!c || c.is_active === false) return;          // inactive: omit, don't remap
        out.push({
          key: 'canon:' + String(r.exercise_id), kind: 'canonical',
          id: c.id, name: c.name, category: c.category || null,
          equipment: c.equipment || null, exerciseId: c.id, customId: null
        });
      } else if (r.user_exercise_id != null) {
        var u = customById[String(r.user_exercise_id)];
        if (!u || u.archived_at) return;                   // archived/deleted: omit
        out.push({
          key: 'custom:' + String(r.user_exercise_id), kind: 'custom',
          id: u.id, name: u.name, category: u.category || 'Custom',
          equipment: null, exerciseId: null, customId: u.id
        });
      }
    });
    return out;
  }

  /* ── Recents ──────────────────────────────────────────────────────────────
   * `usages` are history rows already ordered NEWEST FIRST by the caller, each
   * { exerciseId, customId, name }. This function does the meaning-bearing part:
   * drop what has no stable identity, dedupe so the newest occurrence wins, and
   * cut to a short list.
   *
   * A legacy row (neither id) is DROPPED. It is never matched to a canonical
   * exercise by name — that guess is exactly what 4.3.6H and 4.3.6I refused, and
   * refusing it here keeps the whole exercise layer consistent. */
  function buildRecents(usages, catalogs, opts) {
    var o = opts || {};
    var limit = o.limit != null ? o.limit : LIMITS.recents;
    var canonById = (catalogs && catalogs.canonicalById) || {};
    var customById = (catalogs && catalogs.customById) || {};
    var seen = {}, out = [];

    var list = asArray(usages);
    for (var i = 0; i < list.length; i++) {
      if (out.length >= limit) break;
      var u = list[i];
      if (!u) continue;
      var key = identityKey({ exerciseId: u.exerciseId, customId: u.customId });
      if (!key) continue;                    // legacy / dual-id: never guessed
      if (seen[key]) continue;               // newest occurrence already taken
      seen[key] = 1;

      if (u.exerciseId != null) {
        var c = canonById[String(u.exerciseId)];
        if (!c || c.is_active === false) continue;
        out.push({
          key: key, kind: 'canonical', id: c.id, name: c.name,
          category: c.category || null, equipment: c.equipment || null,
          exerciseId: c.id, customId: null
        });
      } else {
        var x = customById[String(u.customId)];
        // A deleted or archived custom must not become selectable again just
        // because history remembers its name.
        if (!x || x.archived_at) continue;
        out.push({
          key: key, kind: 'custom', id: x.id, name: x.name,
          category: x.category || 'Custom', equipment: null,
          exerciseId: null, customId: x.id
        });
      }
    }
    return out;
  }

  /* Build the id→row lookups the two builders need, from the catalogs the page
   * already has in memory. No fetching, no copying of metadata. */
  function buildCatalogs(canonicalList, customList) {
    var canonicalById = {}, customById = {};
    asArray(canonicalList).forEach(function (e) { if (e && e.id != null) canonicalById[String(e.id)] = e; });
    asArray(customList).forEach(function (e) { if (e && e.id != null) customById[String(e.id)] = e; });
    return { canonicalById: canonicalById, customById: customById };
  }

  /* Whether the picker should show the shortcut sections at all. They are an
   * empty-query convenience: once the user types, search results own the list
   * (§17) rather than being pushed below two standing sections. */
  function shouldShowShortcuts(query) {
    return !String(query == null ? '' : query).trim();
  }

  var ExercisePrefs = {
    LIMITS: LIMITS,
    COPY: COPY,
    identityType: identityType,
    identityKey: identityKey,
    canFavorite: canFavorite,
    favoriteRow: favoriteRow,
    favoriteMatch: favoriteMatch,
    indexFavorites: indexFavorites,
    isFavorited: isFavorited,
    sortFavorites: sortFavorites,
    buildFavorites: buildFavorites,
    buildRecents: buildRecents,
    buildCatalogs: buildCatalogs,
    shouldShowShortcuts: shouldShowShortcuts
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ExercisePrefs;
  root.ExercisePrefs = ExercisePrefs;
})(typeof window !== 'undefined' ? window : this);
