/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Routine Contract  ·  Phase 4.3.6 (CP3)
 *
 * ONE definition of a Routine exercise PRESCRIPTION — the JSONB element shape
 * shared by `workout_templates.exercises` and `program_workouts.exercises`.
 *
 * Those two arrays have always had to match, and the codebase said so in
 * comments ("A template is the user-owned twin of a program_workouts row: same
 * JSONB `exercises` shape", "Normalise each exercise so stored shape matches
 * program_workouts exactly") — but nothing enforced it. Two hand-synchronised
 * prescription formats is the duplication CP3 exists to pin down before the
 * Routine model evolves in CP4.
 *
 * SCOPE — this module owns the prescription element ONLY:
 *   name · exercise_id · sets · reps_low · reps_high · notes · rest_sec
 *
 * It deliberately does NOT own, and CP3 does not add:
 *   description · goal · difficulty · tags · visibility · platform author
 *   state · versioning · tempo · load guidance · publishing status · history
 *   provenance · Program relationship fields  (CP4 and later)
 *
 * IDENTITY IS PRESERVED, NEVER REPAIRED. A canonical `exercise_id` is carried
 * through when present; a name-only entry stays name-only. This module never
 * looks a name up, because `program_workouts` is entirely name-keyed (all 325
 * entries) and inventing ids for it would silently "fix" protected identity
 * debt. Resolution belongs to the caller via exercise-core, which is how
 * workout.html has always done it on the template-save path.
 *
 * PURE: no DOM, no fetch, no Supabase, deterministic, inputs never mutated.
 * Browser: globals below. Node: guarded module.exports.
 * ──────────────────────────────────────────────────────────────────────── */

/* ── defaults ───────────────────────────────────────────────────────────────
 * Every value here already existed in production; nothing new is invented.
 *   sets     3  — workout.html TEMPLATE_DEFAULT_SETS (saveTemplate,
 *                 addTemplateExercise)
 *   repsLow  8  — saveTemplate `if (isNaN(lo)) lo = 8`, addTemplateExercise
 *   repsHigh 12 — saveTemplate `if (isNaN(hi)) hi = 12`, addTemplateExercise
 *   restSec  90 — saveTemplate `ex.rest_sec || 90`, addTemplateExercise
 * Read paths (program launch, template launch, applyTemplateRanges) apply no
 * defaults of their own — they consume stored values directly. */
var RT_DEFAULTS = { sets: 3, repsLow: 8, repsHigh: 12, restSec: 90 };

/* ── helpers ────────────────────────────────────────────────────────────── */

// parseInt with a fallback, matching saveTemplate's isNaN handling.
function rtInt(value, fallback) {
  var n = parseInt(value, 10);
  return isFinite(n) ? n : fallback;
}

// A canonical id is a non-empty string (a uuid in practice). Anything else —
// null, undefined, an absent key, '' — means "no canonical identity", which is
// exactly the `ex.exercise_id != null` test every consumer already uses.
function rtReadIdentity(value) {
  return (typeof value === 'string' && value !== '') ? value : null;
}

function rtName(value) {
  return (typeof value === 'string') ? value.trim() : '';
}

/* ── normalization ──────────────────────────────────────────────────────── */

// One prescription in canonical form, or null when there is no usable name.
//
// Key order matches what saveTemplate has always written, so the serialized
// output of the write path is unchanged.
function rtNormalizeExercise(input) {
  if (!input || typeof input !== 'object') return null;
  var name = rtName(input.name);
  if (!name) return null;

  var lo = rtInt(input.reps_low, RT_DEFAULTS.repsLow);
  var hi = rtInt(input.reps_high, RT_DEFAULTS.repsHigh);
  if (hi < lo) hi = lo;                       // saveTemplate: `if (hi < lo) hi = lo`

  var sets = rtInt(input.sets, RT_DEFAULTS.sets);
  if (sets < 1) sets = RT_DEFAULTS.sets;      // saveTemplate: `|| sets < 1`

  // `ex.rest_sec || 90` — 0 has always fallen through to the default.
  var rest = rtInt(input.rest_sec, RT_DEFAULTS.restSec);
  if (!rest) rest = RT_DEFAULTS.restSec;

  return {
    name: name,
    sets: sets,
    reps_low: lo,
    reps_high: hi,
    notes: (typeof input.notes === 'string') ? input.notes.trim() : '',
    rest_sec: rest,
    exercise_id: rtReadIdentity(input.exercise_id),
  };
}

// Normalize a Routine's exercise array, PRESERVING ORDER. Unusable entries are
// dropped rather than throwing — a malformed element must not cost a user the
// rest of their workout.
function rtNormalizeExercises(list) {
  var out = [];
  if (!Array.isArray(list)) return out;
  for (var i = 0; i < list.length; i++) {
    var ex = rtNormalizeExercise(list[i]);
    if (ex) out.push(ex);
  }
  return out;
}

/* ── validation ─────────────────────────────────────────────────────────────
 * Narrow by design. Publish eligibility is CP6 and history candidacy is CP7;
 * this answers only "is this prescription structurally usable, and does it
 * carry canonical identity?". */

var RT_VALID = 'valid';                  // usable, canonical exercise_id present
var RT_LEGACY_IDENTITY = 'legacy_identity'; // usable, name-only
var RT_INVALID = 'invalid';              // not usable

function rtValidateExercise(input) {
  var normalized = rtNormalizeExercise(input);
  if (!normalized) {
    return { status: RT_INVALID, issues: ['missing_name'], normalized: null };
  }
  if (!normalized.exercise_id) {
    return { status: RT_LEGACY_IDENTITY, issues: ['no_canonical_identity'],
             normalized: normalized };
  }
  return { status: RT_VALID, issues: [], normalized: normalized };
}

// A Routine's overall status is its weakest entry: invalid if anything is
// unusable or the array is empty, legacy if any entry is name-only.
function rtValidateExercises(list) {
  if (!Array.isArray(list) || !list.length) {
    return { status: RT_INVALID, issues: ['empty'], entries: [] };
  }
  var entries = [];
  var issues = [];
  var anyInvalid = false;
  var anyLegacy = false;
  for (var i = 0; i < list.length; i++) {
    var r = rtValidateExercise(list[i]);
    entries.push(r);
    if (r.status === RT_INVALID) { anyInvalid = true; issues.push('entry_' + i + '_invalid'); }
    else if (r.status === RT_LEGACY_IDENTITY) { anyLegacy = true; }
  }
  if (anyLegacy) issues.push('legacy_identity_present');
  return {
    status: anyInvalid ? RT_INVALID : (anyLegacy ? RT_LEGACY_IDENTITY : RT_VALID),
    issues: issues,
    entries: entries,
  };
}

/* ── equivalence ────────────────────────────────────────────────────────────
 * Semantic comparison used by the CP3 round-trip gate. Compares MEANING, so an
 * absent `exercise_id` key and an explicit null are equal — which is precisely
 * how every consumer reads it (`ex.exercise_id != null`). */
function rtSameExercise(a, b) {
  var x = rtNormalizeExercise(a);
  var y = rtNormalizeExercise(b);
  if (!x || !y) return x === y;
  return x.name === y.name
    && x.sets === y.sets
    && x.reps_low === y.reps_low
    && x.reps_high === y.reps_high
    && x.notes === y.notes
    && x.rest_sec === y.rest_sec
    && x.exercise_id === y.exercise_id;
}

function rtSameExercises(a, b) {
  var x = Array.isArray(a) ? a : [];
  var y = Array.isArray(b) ? b : [];
  if (x.length !== y.length) return false;
  for (var i = 0; i < x.length; i++) {
    if (!rtSameExercise(x[i], y[i])) return false;
  }
  return true;
}

/* Node: guarded exports (browser uses the globals above). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RT_DEFAULTS: RT_DEFAULTS,
    RT_VALID: RT_VALID,
    RT_LEGACY_IDENTITY: RT_LEGACY_IDENTITY,
    RT_INVALID: RT_INVALID,
    rtNormalizeExercise: rtNormalizeExercise,
    rtNormalizeExercises: rtNormalizeExercises,
    rtValidateExercise: rtValidateExercise,
    rtValidateExercises: rtValidateExercises,
    rtSameExercise: rtSameExercise,
    rtSameExercises: rtSameExercises,
  };
}
