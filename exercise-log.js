/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Exercise Logging Reliability Core (Phase 4.2.1J)
 *
 * The logging-reliability sibling of `exercise-core.js` (identity/resolution),
 * `exercise-custom.js` (lifecycle), and `exercise-filters.js` (discovery). One
 * pure, DOM-free, fetch-free, DB-free layer owning three reliability concerns
 * for the workout logger:
 *
 *   1. ID-FIRST logged-exercise IDENTITY — which prior logged rows are the SAME
 *      exercise as the one being logged now (so previous-performance, history,
 *      and progression compare only genuinely comparable performances).
 *   2. Chronological PREVIOUS-SESSION selection — exclude the current session,
 *      incomplete sessions, and future-dated rows; order deterministically.
 *   3. Set-value SANITIZATION — never let NaN / Infinity / negative / malformed
 *      values reach the database, without destroying legitimate blank / zero /
 *      decimal entries.
 *
 * Exposed as `ExerciseLog` on window (browser) and module.exports (Node tests).
 * Reuses `exercise-core.js` `normalizeExerciseName` so logged identity NEVER
 * drifts from resolution / lifecycle / custom identity (fallback mirrors it).
 *
 * IDENTITY MODEL (why it is safe):
 *   • A canonical exercise carries a stable `exercises.id` (`exercise_id`),
 *     stamped since Phase 4.2.1F. Two canonicals are the same ONLY when their
 *     ids are equal — so Smith-machine bench ≠ barbell bench, pull-up ≠
 *     assisted pull-up, seated ≠ lying leg curl, machine chest press ≠ dumbbell
 *     bench, regardless of name similarity.
 *   • Per Phase 4.2.1H `classifyCreateIntent`, a custom exercise can NEVER take
 *     a canonical name (use-canonical precedence). Therefore a logged row with
 *     `exercise_id = NULL` whose name normalizes to a CANONICAL name must be a
 *     legacy (pre-4.2.1F) canonical log — safe to fold into that canonical's
 *     history. A NULL row whose name is NOT canonical is a custom/free-typed
 *     entry and is matched by name only among other customs — never merged into
 *     a canonical, and never merged across two customs when their owner-scoped
 *     custom ids are both known and differ.
 * ────────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  // ── Shared normalizer (reuse exercise-core; never fork identity) ───────────
  var _EI = (function () {
    if (root && root.ExerciseIntelligence) return root.ExerciseIntelligence;
    if (typeof module !== 'undefined' && module.exports) {
      try { return require('./exercise-core'); } catch (e) { return null; }
    }
    return null;
  })();

  // Fallback mirrors exercise-core.normalizeExerciseName EXACTLY (and the
  // user_exercises.normalized_name generated column) so behavior is identical
  // whether or not exercise-core is present.
  function fallbackNormalize(name) {
    if (typeof name !== 'string' && typeof name !== 'number') return '';
    var s = String(name).toLowerCase();
    s = s.replace(/[‘’'`]/g, '');
    s = s.replace(/[^a-z0-9]+/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }
  function normalizeName(name) {
    if (_EI && typeof _EI.normalizeExerciseName === 'function') {
      return _EI.normalizeExerciseName(name);
    }
    return fallbackNormalize(name);
  }

  // ── Identity ───────────────────────────────────────────────────────────────
  // A "reference" describes the exercise being logged now (from the active
  // workout): { exerciseId, customId, name }. `exerciseId` is a canonical
  // exercises.id or null; `customId` is a user_exercises.id or null (known only
  // when the caller persists it — future-proofing; today usually null).
  // A "row" describes a candidate logged workout_exercises row:
  // { exercise_id, exercise_name, user_exercise_id }.
  function refCanonical(ref) {
    var id = ref && ref.exerciseId != null ? ref.exerciseId : null;
    return id;
  }
  function rowCanonical(row) {
    return row && row.exercise_id != null ? row.exercise_id : null;
  }
  function refCustom(ref) {
    return ref && ref.customId != null ? ref.customId : null;
  }
  function rowCustom(row) {
    return row && row.user_exercise_id != null ? row.user_exercise_id : null;
  }

  // Is `row` the SAME exercise as reference `ref`? ID-first, name only as a
  // conservative fallback for legacy/custom rows. Never merges a canonical with
  // a custom, never merges two distinct-id canonicals, never merges two
  // distinct-id customs.
  function sameLoggedExercise(ref, row) {
    if (!ref || !row) return false;
    var rCanon = refCanonical(ref);
    var oCanon = rowCanonical(row);
    var rNorm = normalizeName(ref.name);
    var oNorm = normalizeName(row.exercise_name);

    // ── Reference is a canonical exercise ──────────────────────────────────
    if (rCanon != null) {
      if (oCanon != null) return oCanon === rCanon;         // canonical vs canonical → id equality
      // Row has no canonical id. A row carrying a KNOWN custom id is definitively
      // a custom entry — a canonical never inherits it, even on a name tie.
      if (rowCustom(row) != null) return false;
      // Otherwise it is a legacy (pre-4.2.1F) NULL row: fold in only on a name
      // match. A custom can never carry a canonical name (4.2.1H), so a
      // name-equal NULL row with no custom id is a legacy canonical log — safe.
      return oNorm !== '' && oNorm === rNorm;
    }

    // ── Reference is a custom / free-typed exercise (no canonical id) ───────
    if (oCanon != null) return false;                       // never inherit a canonical's history
    var rCust = refCustom(ref);
    var oCust = rowCustom(row);
    if (rCust != null && oCust != null) return rCust === oCust;  // both custom ids known → id equality
    return oNorm !== '' && oNorm === rNorm;                 // fall back to name equality
  }

  // Filter a set of candidate logged rows to those that are the same exercise.
  function filterLoggedMatches(ref, rows) {
    if (!Array.isArray(rows)) return [];
    return rows.filter(function (row) { return sameLoggedExercise(ref, row); });
  }

  // Symmetric progression comparability: are two exercise references the same
  // exercise for the purpose of comparing performances? (e.g. current session's
  // exercise vs a prior session's exercise.)
  function isComparableForProgression(a, b) {
    if (!a || !b) return false;
    return sameLoggedExercise(a, {
      exercise_id: b.exerciseId != null ? b.exerciseId : null,
      exercise_name: b.name,
      user_exercise_id: b.customId != null ? b.customId : null
    });
  }

  // ── Stable identity model (Phase 4.2.1K) ─────────────────────────────────────
  // A single, shared classification of an exercise reference so previous-
  // performance, history, progression AND personal_records all key off the SAME
  // rules. Priority is explicit: canonical id > custom id > conservative legacy
  // name. A reference is one of:
  //   'canonical' — has a stable exercises.id (exerciseId), no custom id.
  //   'custom'    — has a stable user_exercises.id (customId), no canonical id.
  //   'legacy'    — neither stable id; identity is the normalized name only.
  //   'invalid'   — BOTH ids present (an impossible dual-identity state). The DB
  //                 mutual-exclusivity CHECK is the backstop; app code should
  //                 never construct one, and never persists an 'invalid' row.
  function identityType(ref) {
    if (!ref) return 'legacy';
    var hasCanon = ref.exerciseId != null;
    var hasCustom = ref.customId != null;
    if (hasCanon && hasCustom) return 'invalid';
    if (hasCanon) return 'canonical';
    if (hasCustom) return 'custom';
    return 'legacy';
  }
  function isValidIdentity(ref) { return identityType(ref) !== 'invalid'; }

  // A deterministic, debug-safe identity key. Two references with the same key
  // are the SAME exercise; a legacy key can never equal a canonical/custom key
  // (distinct prefixes), so a name-only reference is never conflated with an
  // id-backed one. Used to key per-session maps (e.g. live-PR state).
  function identityKey(ref) {
    var t = identityType(ref);
    if (t === 'canonical') return 'canon:' + String(ref.exerciseId);
    if (t === 'custom') return 'custom:' + String(ref.customId);
    if (t === 'invalid') return 'invalid';
    return 'legacy:' + normalizeName(ref && ref.name);
  }

  // The personal_records identity columns to persist for this reference. Exactly
  // one stable id is ever set (or neither, for a legacy write); exercise_name is
  // ALWAYS carried as the human snapshot. An 'invalid' ref is normalized to
  // canonical-wins (defensive — should never occur).
  function prIdentityColumns(ref) {
    var t = identityType(ref);
    var canon = (t === 'canonical' || t === 'invalid') ? ref.exerciseId : null;
    var cust  = (t === 'custom') ? ref.customId : null;
    return {
      exercise_id: canon != null ? canon : null,
      user_exercise_id: cust != null ? cust : null,
      exercise_name: (ref && ref.name != null) ? String(ref.name) : ''
    };
  }

  // The Supabase upsert onConflict target for a PR write, or null for a legacy
  // reference (no modern arbiter — the caller must read-then-write by row id so a
  // NEW legacy row is never created when a stable identity is available). Only
  // 'canonical'/'custom' produce a modern arbiter, matching the identity-aware
  // unique constraints.
  function prConflictTarget(ref) {
    var t = identityType(ref);
    if (t === 'canonical' || t === 'invalid') return 'user_id,exercise_id';
    if (t === 'custom') return 'user_id,user_exercise_id';
    return null;
  }

  // Human-readable identity label for logs/diagnostics — never used for matching.
  function identityLabel(ref) {
    var t = identityType(ref);
    if (t === 'canonical') return 'canonical#' + ref.exerciseId;
    if (t === 'custom') return 'custom#' + ref.customId;
    if (t === 'invalid') return 'INVALID(dual-id)';
    return 'legacy(' + normalizeName(ref && ref.name) + ')';
  }

  // ── Chronology ─────────────────────────────────────────────────────────────
  // Newest-first comparator over sessions { workoutId, date, createdAt }.
  // Primary: workout `date` (user-facing, editable in principle); secondary:
  // createdAt (insertion tie-breaker); tertiary: workoutId (fully stable order).
  function _time(v) {
    if (v == null) return 0;
    var t = (v instanceof Date) ? v.getTime() : Date.parse(v);
    return isNaN(t) ? 0 : t;
  }
  function recencyCompare(a, b) {
    var da = _time(a && a.date), db = _time(b && b.date);
    if (da !== db) return db - da;
    var ca = _time(a && a.createdAt), cb = _time(b && b.createdAt);
    if (ca !== cb) return cb - ca;
    var ia = String(a && a.workoutId || ''), ib = String(b && b.workoutId || '');
    return ia < ib ? 1 : (ia > ib ? -1 : 0);
  }
  function orderByRecency(sessions) {
    return (Array.isArray(sessions) ? sessions.slice() : []).sort(recencyCompare);
  }

  // Select the valid PREVIOUS sessions for a comparison, newest-first.
  // opts: { excludeWorkoutId, now, requireCompleted (default true) }.
  //   • excludeWorkoutId — the in-progress / current workout is never its own
  //     baseline.
  //   • requireCompleted — draft / abandoned sessions never become a baseline.
  //   • future-dated rows (date OR createdAt strictly after `now`) are excluded
  //     so a mis-dated future record can't masquerade as "previous".
  function selectPreviousSessions(sessions, opts) {
    opts = opts || {};
    var exclude = opts.excludeWorkoutId != null ? String(opts.excludeWorkoutId) : null;
    var requireCompleted = opts.requireCompleted !== false;
    var nowT = opts.now != null ? _time(opts.now) : Date.now();
    var out = (Array.isArray(sessions) ? sessions : []).filter(function (s) {
      if (!s) return false;
      if (exclude != null && String(s.workoutId) === exclude) return false;
      if (requireCompleted && s.completed !== true) return false;
      // Future-dated guard: compare whichever timestamps exist.
      var dt = _time(s.date), ct = _time(s.createdAt);
      var stamp = Math.max(dt, ct);
      if (stamp && stamp > nowT) return false;
      return true;
    });
    return orderByRecency(out);
  }

  // ── Set-value sanitization ─────────────────────────────────────────────────
  // Guards the persistence layer against corruption WITHOUT punishing normal
  // logging. Blank stays blank (null). Zero stays zero. Decimals are preserved.
  // NaN / Infinity / non-numeric / negative are rejected (value null, valid
  // false) so the caller can surface a gentle hint instead of writing garbage.
  var MAX_REPS = 10000;      // generous upper guard; blocks Infinity-like corruption
  var MAX_WEIGHT = 100000;   // lbs; blocks corrupt/absurd loads

  function _isBlank(raw) {
    return raw === '' || raw === null || raw === undefined;
  }

  // Reps: whole-number count, 0..MAX_REPS. Non-integer input is rounded (users
  // occasionally fat-finger a decimal); anything non-finite or negative or over
  // the guard is rejected.
  function sanitizeReps(raw) {
    if (_isBlank(raw)) return { value: null, valid: true };
    var n = typeof raw === 'number' ? raw : Number(raw);
    if (!isFinite(n)) return { value: null, valid: false };
    if (n < 0) return { value: null, valid: false };
    if (n > MAX_REPS) return { value: null, valid: false };
    return { value: Math.round(n), valid: true };
  }

  // Weight: non-negative real, decimals preserved (137.5 stays), 0..MAX_WEIGHT.
  // Blank means "no external load" (bodyweight) and is preserved as null.
  function sanitizeWeight(raw) {
    if (_isBlank(raw)) return { value: null, valid: true };
    var n = typeof raw === 'number' ? raw : Number(raw);
    if (!isFinite(n)) return { value: null, valid: false };
    if (n < 0) return { value: null, valid: false };
    if (n > MAX_WEIGHT) return { value: null, valid: false };
    return { value: n, valid: true };
  }

  // Dispatch by set field name (the two persisted numeric fields).
  function sanitizeSetField(field, raw) {
    if (field === 'reps') return sanitizeReps(raw);
    if (field === 'weight_lbs' || field === 'weight') return sanitizeWeight(raw);
    return { value: raw, valid: true };
  }

  var ExerciseLog = {
    // identity
    sameLoggedExercise: sameLoggedExercise,
    filterLoggedMatches: filterLoggedMatches,
    isComparableForProgression: isComparableForProgression,
    normalizeName: normalizeName,
    // stable identity model (Phase 4.2.1K)
    identityType: identityType,
    isValidIdentity: isValidIdentity,
    identityKey: identityKey,
    prIdentityColumns: prIdentityColumns,
    prConflictTarget: prConflictTarget,
    identityLabel: identityLabel,
    // chronology
    selectPreviousSessions: selectPreviousSessions,
    orderByRecency: orderByRecency,
    recencyCompare: recencyCompare,
    // set-value sanitization
    sanitizeReps: sanitizeReps,
    sanitizeWeight: sanitizeWeight,
    sanitizeSetField: sanitizeSetField,
    MAX_REPS: MAX_REPS,
    MAX_WEIGHT: MAX_WEIGHT
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ExerciseLog;
  root.ExerciseLog = ExerciseLog;
})(typeof window !== 'undefined' ? window : this);
