/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — History → Routine candidacy  ·  Phase 4.3.6 (CP7)
 *
 * Deterministic analysis of whether a COMPLETED workout can be safely
 * represented as a reusable private Routine draft, and what that draft would
 * contain. Pure: no DOM, no Supabase, no fetch, no navigation.
 *
 * THE GOVERNING IDEA: workout history is EVIDENCE, not a Routine. Conversion
 * is a COPY. Nothing here mutates, reclassifies or reinterprets a history row,
 * and a Routine is only ever created after the user explicitly confirms.
 *
 * WHAT THIS DOES NOT DO — deliberately:
 *   - no fuzzy name matching, no id guessing, no bulk backfill
 *   - no quality scoring, ranking, or "was this a good workout"
 *   - no AI, no progression inference, no prescription invention
 *   - no load/weight carried into the Routine: the CP3 contract has no load
 *     field and CP7 does not invent one. Performed weights stay in history.
 *
 * Measured against live data before these rules were written: 121 completed
 * workouts, 645 exercise entries (53% canonical, 11% custom, 36% name-only),
 * 1899 sets of which 1838 qualify. `is_warmup` is unused (0 rows) and every
 * notes field is empty, so the rules below reflect the data as it actually is.
 *
 * Browser globals + guarded module.exports.
 * ──────────────────────────────────────────────────────────────────────── */

var _rtc = (typeof require === 'function') ? require('./routine-core.js') : null;
function _normalizeList(list) {
  return _rtc ? _rtc.rtNormalizeExercises(list) : rtNormalizeExercises(list);
}
function _defaults() { return _rtc ? _rtc.RT_DEFAULTS : RT_DEFAULTS; }

/* ── statuses and issue codes ───────────────────────────────────────────── */

var RH_READY = 'ready';                 // can be created as-is
var RH_NEEDS_REVIEW = 'needs_review';   // user must resolve something first
var RH_BLOCKED = 'blocked';             // structurally not convertible

// Stable codes; UI copy lives with the UI.
var RH_NOT_OWNED = 'not_owned';
var RH_WORKOUT_IN_PROGRESS = 'workout_in_progress';
var RH_EMPTY_WORKOUT = 'empty_workout';
var RH_NO_COMPLETED_SETS = 'no_completed_sets';
var RH_MISSING_EXERCISE_IDENTITY = 'missing_exercise_identity';
var RH_CUSTOM_IDENTITY_UNSUPPORTED = 'custom_identity_unsupported';
var RH_INVALID_SET_DATA = 'invalid_set_data';
var RH_MISSING_NAME = 'missing_name';

/* ── identity ───────────────────────────────────────────────────────────────
 * Three classes, decided from stored columns ONLY. Never from the name.
 *
 * `custom` is a real, stable identity — but the CP3 Routine contract carries
 * only `exercise_id`, so it cannot be represented in a Routine today. CP7
 * deliberately does NOT widen that contract: it surfaces the exercise for the
 * user to replace with a canonical one. Silently dropping it, or guessing a
 * canonical match from the name, would both be worse. */

var RH_CANONICAL = 'canonical';
var RH_CUSTOM = 'custom';
var RH_LEGACY = 'legacy';

function rhClassifyExerciseIdentity(row) {
  if (!row || typeof row !== 'object') return RH_LEGACY;
  if (typeof row.exercise_id === 'string' && row.exercise_id) return RH_CANONICAL;
  if (typeof row.user_exercise_id === 'string' && row.user_exercise_id) return RH_CUSTOM;
  return RH_LEGACY;
}

/* ── sets ───────────────────────────────────────────────────────────────────
 * A set counts toward the prescription only if it was actually completed, was
 * not a warm-up, and carries a positive whole-number rep count. Everything
 * else is evidence of what happened, not of what to prescribe. */

function rhIsQualifyingSet(set) {
  if (!set || typeof set !== 'object') return false;
  if (set.completed !== true) return false;
  if (set.is_warmup === true) return false;
  var reps = set.reps;
  return typeof reps === 'number' && isFinite(reps) && reps > 0 && reps === Math.floor(reps);
}

/* ── prescription derivation ────────────────────────────────────────────────
 * sets      = number of qualifying sets
 * reps_low  = fewest reps performed across them
 * reps_high = most reps performed across them
 * rest_sec  = the CP3 default; history stores no rest, and the review screen
 *             presents it as editable. Flagged so the UI can say so.
 * notes     = empty. Performance logs are not reusable coaching notes.
 * load      = absent by design. */

function rhDerivePrescription(exerciseRow, sets) {
  var identity = rhClassifyExerciseIdentity(exerciseRow);
  var name = (exerciseRow && typeof exerciseRow.exercise_name === 'string')
    ? exerciseRow.exercise_name.trim() : '';

  var qualifying = (Array.isArray(sets) ? sets : []).filter(rhIsQualifyingSet);
  var issues = [];

  if (!name) issues.push(RH_MISSING_NAME);
  if (identity === RH_CUSTOM) issues.push(RH_CUSTOM_IDENTITY_UNSUPPORTED);
  if (identity === RH_LEGACY) issues.push(RH_MISSING_EXERCISE_IDENTITY);
  if (!qualifying.length) issues.push(RH_NO_COMPLETED_SETS);

  var reps = qualifying.map(function (s) { return s.reps; });
  var low = reps.length ? Math.min.apply(null, reps) : null;
  var high = reps.length ? Math.max.apply(null, reps) : null;

  return {
    // What the user sees and can act on.
    identity: identity,
    issues: issues,
    resolved: identity === RH_CANONICAL,
    sourceExerciseId: (exerciseRow && exerciseRow.id) || null,
    restDefaulted: true,
    // The CP3-shaped prescription, or null when nothing can be derived.
    prescription: qualifying.length ? {
      name: name,
      exercise_id: identity === RH_CANONICAL ? exerciseRow.exercise_id : null,
      sets: qualifying.length,
      reps_low: low,
      reps_high: high,
      notes: '',
      rest_sec: _defaults().restSec,
    } : null,
  };
}

/* ── workout analysis ───────────────────────────────────────────────────────
 * `exercises` are workout_exercises rows in order; `setsFor(exerciseId)`
 * returns that exercise's workout_sets rows. `ownerId` is the id the caller
 * has already authenticated as — ownership is re-checked here so a candidate
 * can never be produced for someone else's workout even if a query slipped. */

function rhAnalyzeWorkout(workout, exercises, setsFor, ownerId) {
  var issues = [];

  if (!workout || typeof workout !== 'object') {
    return rhResult(RH_BLOCKED, [RH_EMPTY_WORKOUT], null, []);
  }
  if (ownerId && workout.user_id && workout.user_id !== ownerId) {
    return rhResult(RH_BLOCKED, [RH_NOT_OWNED], null, []);
  }
  // History means COMPLETED. An in-progress session is still being written.
  if (workout.completed !== true) {
    return rhResult(RH_BLOCKED, [RH_WORKOUT_IN_PROGRESS], null, []);
  }

  var rows = Array.isArray(exercises) ? exercises : [];
  if (!rows.length) return rhResult(RH_BLOCKED, [RH_EMPTY_WORKOUT], null, []);

  // Order is preserved exactly as logged.
  var entries = rows.map(function (row) {
    var sets = typeof setsFor === 'function' ? setsFor(row && row.id) : [];
    return rhDerivePrescription(row, sets);
  });

  var usable = entries.filter(function (e) { return e.prescription; });
  if (!usable.length) return rhResult(RH_BLOCKED, [RH_NO_COMPLETED_SETS], null, entries);

  // Anything the user must act on before this can become a Routine.
  var unresolved = entries.filter(function (e) { return e.issues.length; });
  unresolved.forEach(function (e) {
    e.issues.forEach(function (code) {
      if (issues.indexOf(code) < 0) issues.push(code);
    });
  });

  var name = (typeof workout.name === 'string') ? workout.name.trim() : '';
  if (!name && issues.indexOf(RH_MISSING_NAME) < 0) issues.push(RH_MISSING_NAME);

  var status = unresolved.length || !name ? RH_NEEDS_REVIEW : RH_READY;
  return rhResult(status, issues, {
    name: name,
    sourceWorkoutId: workout.id || null,
    exercises: usable.map(function (e) { return e.prescription; }),
  }, entries);
}

function rhResult(status, issues, candidate, entries) {
  return {
    // Only a fully resolved candidate may be created.
    eligible: status === RH_READY,
    status: status,
    issues: issues || [],
    candidate: candidate,
    entries: entries || [],
  };
}

/* ── applying a user's manual resolution ────────────────────────────────────
 * The ONLY way an unresolved entry becomes resolved. The user picks a
 * canonical exercise in the normal picker and the id is applied here — an
 * explicit human choice, never a match. Returns a NEW entry; the input and the
 * underlying history row are untouched. */

function rhResolveEntry(entry, canonicalExerciseId, canonicalName) {
  if (!entry || typeof entry !== 'object') return entry;
  if (typeof canonicalExerciseId !== 'string' || !canonicalExerciseId) return entry;

  var name = (typeof canonicalName === 'string' && canonicalName.trim())
    ? canonicalName.trim()
    : (entry.prescription ? entry.prescription.name : '');

  var keep = entry.issues.filter(function (c) {
    return c !== RH_MISSING_EXERCISE_IDENTITY
      && c !== RH_CUSTOM_IDENTITY_UNSUPPORTED
      && c !== RH_MISSING_NAME;
  });

  return {
    identity: RH_CANONICAL,
    issues: keep,
    resolved: keep.length === 0,
    sourceExerciseId: entry.sourceExerciseId,
    restDefaulted: entry.restDefaulted,
    prescription: entry.prescription ? {
      name: name,
      exercise_id: canonicalExerciseId,
      sets: entry.prescription.sets,
      reps_low: entry.prescription.reps_low,
      reps_high: entry.prescription.reps_high,
      notes: entry.prescription.notes,
      rest_sec: entry.prescription.rest_sec,
    } : null,
  };
}

// Re-evaluate a candidate after resolutions, without touching history again.
function rhRecheck(workoutName, entries) {
  var list = Array.isArray(entries) ? entries : [];
  var usable = list.filter(function (e) { return e.prescription; });
  var issues = [];
  list.forEach(function (e) {
    (e.issues || []).forEach(function (c) { if (issues.indexOf(c) < 0) issues.push(c); });
  });
  var name = (typeof workoutName === 'string') ? workoutName.trim() : '';
  if (!name && issues.indexOf(RH_MISSING_NAME) < 0) issues.push(RH_MISSING_NAME);

  if (!usable.length) return rhResult(RH_BLOCKED, [RH_NO_COMPLETED_SETS], null, list);
  var status = issues.length ? RH_NEEDS_REVIEW : RH_READY;
  return rhResult(status, issues, {
    name: name,
    exercises: usable.map(function (e) { return e.prescription; }),
  }, list);
}

/* ── final shaping ──────────────────────────────────────────────────────────
 * The prescription array is normalized by the CP3 contract — one definition of
 * the shape, never a second copy here. */
function rhCandidateExercises(candidate) {
  return _normalizeList(candidate && candidate.exercises ? candidate.exercises : []);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RH_READY: RH_READY, RH_NEEDS_REVIEW: RH_NEEDS_REVIEW, RH_BLOCKED: RH_BLOCKED,
    RH_CANONICAL: RH_CANONICAL, RH_CUSTOM: RH_CUSTOM, RH_LEGACY: RH_LEGACY,
    RH_NOT_OWNED: RH_NOT_OWNED, RH_WORKOUT_IN_PROGRESS: RH_WORKOUT_IN_PROGRESS,
    RH_EMPTY_WORKOUT: RH_EMPTY_WORKOUT, RH_NO_COMPLETED_SETS: RH_NO_COMPLETED_SETS,
    RH_MISSING_EXERCISE_IDENTITY: RH_MISSING_EXERCISE_IDENTITY,
    RH_CUSTOM_IDENTITY_UNSUPPORTED: RH_CUSTOM_IDENTITY_UNSUPPORTED,
    RH_INVALID_SET_DATA: RH_INVALID_SET_DATA, RH_MISSING_NAME: RH_MISSING_NAME,
    rhClassifyExerciseIdentity: rhClassifyExerciseIdentity,
    rhIsQualifyingSet: rhIsQualifyingSet,
    rhDerivePrescription: rhDerivePrescription,
    rhAnalyzeWorkout: rhAnalyzeWorkout,
    rhResolveEntry: rhResolveEntry,
    rhRecheck: rhRecheck,
    rhCandidateExercises: rhCandidateExercises,
  };
}
