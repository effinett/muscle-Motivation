/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Workout Schedule Source of Truth
 *
 * training_days is GLOBAL (profiles.training_days). This file is the ONE place
 * that maps a program + training_days into an ordered list of session keys.
 * Dashboard, workout logger, and all program pages load this file so the
 * displayed split label and the launched workout always agree.
 *
 * Do not redefine these maps anywhere else.
 * ────────────────────────────────────────────────────────────────────────── */

var PROGRAM_SCHEDULES = {
  fat_loss_blueprint: {
    2: ['full_a', 'full_b'],
    3: ['full_a', 'full_b', 'full_c'],
    4: ['upper_a', 'lower_a', 'upper_b', 'lower_b'],
    5: ['push_a', 'pull_a', 'legs_a', 'upper_b', 'lower_b'],
    6: ['push_a', 'pull_a', 'legs_a', 'push_b', 'pull_b', 'legs_b'],
  },
  muscle_gain: {
    2: ['full_a', 'full_b'],
    3: ['full_a', 'full_b', 'full_c'],
    4: ['upper_a', 'lower_a', 'upper_b', 'lower_b'],
    5: ['push_a', 'pull_a', 'legs_a', 'upper_b', 'lower_b'],
    6: ['push_a', 'pull_a', 'legs_a', 'push_b', 'pull_b', 'legs_b'],
  },
  // Bodyweight Foundations runs the SAME three full-body sessions at every
  // frequency — no session is dropped for a lower training day count, so a
  // 2-day user still reaches C by carrying `current_index` forward across
  // weeks (A,B → C,A → B,C). This mapping is behaviourally identical to the
  // unmapped-slug fallback below; it is written out so the intent is explicit
  // and survives any future change to that fallback.
  bodyweight_foundations: {
    2: ['full_a', 'full_b', 'full_c'],
    3: ['full_a', 'full_b', 'full_c'],
    4: ['full_a', 'full_b', 'full_c'],
    5: ['full_a', 'full_b', 'full_c'],
    6: ['full_a', 'full_b', 'full_c'],
  },
  glute_builder: {
    2: ['glute_a', 'glute_b'],
    3: ['glute_a', 'glute_b', 'glute_c'],
    4: ['glute_lower_a', 'upper_a', 'glute_lower_b', 'upper_b'],
    5: ['glute_lower_a', 'upper_push_a', 'glute_lower_b', 'upper_pull_a', 'glute_pump'],
    6: ['glute_lower_a', 'upper_push_a', 'glute_lower_b', 'upper_pull_a', 'glute_pump', 'full_body_glute'],
  },
};

var SESSION_LABELS = {
  full_a: 'Full Body A', full_b: 'Full Body B', full_c: 'Full Body C',
  upper_a: 'Upper A',    upper_b: 'Upper B',
  lower_a: 'Lower A',    lower_b: 'Lower B',
  push: 'Push',          pull: 'Pull',          legs: 'Legs',
  push_a: 'Push A',      push_b: 'Push B',
  pull_a: 'Pull A',      pull_b: 'Pull B',
  legs_a: 'Legs A',      legs_b: 'Legs B',
  session_a: 'Session A — Hip Thrust Lead',
  session_b: 'Session B — RDL Lead',
  session_c: 'Session C — Squat Lead',
  upper: 'Upper Body',
  glute_a: 'Glute A',    glute_b: 'Glute B',    glute_c: 'Glute C',
  glute_lower_a: 'Glute & Lower A', glute_lower_b: 'Glute & Lower B',
  upper_push_a: 'Upper Push',       upper_pull_a: 'Upper Pull',
  glute_pump: 'Glute Pump',         full_body_glute: 'Full Body Glute',
};

/* Normalize any training_days value into a supported bucket (2–6).
 * 0 / 1 / unset → 3-day default. Anything above 6 caps at 6. */
function normalizeTrainingDays(trainingDays) {
  var d = parseInt(trainingDays, 10);
  if (!d || d < 2) return 3;
  if (d > 6) return 6;
  return d;
}

/* ── Canonical profile-frequency validation ─────────────────────────────────
 * The ONE rule that decides whether a profile's training frequency is USABLE.
 * Separate from normalizeTrainingDays() on purpose: normalize answers "which
 * bucket does this value belong to", which is only a meaningful question once
 * the value is known to be real. This answers "do we actually know the user's
 * frequency at all?" — and a caller that cannot answer yes must fail closed
 * rather than substitute a number, because substituting one silently selects
 * the wrong schedule family (a 4-day user shown the 3-day Full Body split).
 *
 * Canonical domain: integers 0–6 inclusive. `profiles.training_days` carries no
 * database CHECK constraint (verified 2026-09-29: nullable integer, no
 * default), so the domain is defined by the only writer that validates it —
 * onboarding-draft.js, which accepts inRange(v, 0, 6). `0` is a real ANSWER
 * ("not training yet"), not a missing value.
 *
 * Truthiness is deliberately NOT the test. `!v` rejects the valid answer 0,
 * while NaN, 4.5, '4' and 12 pass or fail for reasons unrelated to validity.
 * Values outside the domain are treated as CORRUPT, not clampable: nothing in
 * the profile schema authorises silently reinterpreting 12 as 6. */
var TRAINING_DAYS_MIN = 0;
var TRAINING_DAYS_MAX = 6;

function isValidTrainingDays(value) {
  return typeof value === 'number' && isFinite(value)
    && Math.floor(value) === value
    && value >= TRAINING_DAYS_MIN && value <= TRAINING_DAYS_MAX;
}

/* profile → { ok: true, days: n }
 *         | { ok: false, reason: 'no_profile' | 'missing' | 'invalid' }
 * `no_profile` covers both "the read failed" and "there is no row": getProfile()
 * returns null for both, so no surface can tell them apart, and both mean the
 * same thing here — the frequency is unknown. */
function resolveTrainingDays(profile) {
  if (!profile || typeof profile !== 'object') return { ok: false, reason: 'no_profile' };
  var value = profile.training_days;
  if (value === null || value === undefined) return { ok: false, reason: 'missing' };
  if (!isValidTrainingDays(value)) return { ok: false, reason: 'invalid' };
  return { ok: true, days: value };
}

/* The single function every surface uses to decide the schedule. */
function getScheduleForDays(programSlug, trainingDays) {
  var table = PROGRAM_SCHEDULES[programSlug];
  if (!table) return ['full_a', 'full_b', 'full_c'];
  var d = normalizeTrainingDays(trainingDays);
  return table[d] || table[3] || ['full_a', 'full_b', 'full_c'];
}

/* Every session a program offers, regardless of the user's training_days.
 * Built by unioning all day-buckets (2–6) for the program, deduped and in
 * order of first appearance. Used by program pages so a user can browse and
 * start ANY workout in a program they own (Priority 3) — not just the ones in
 * their current frequency schedule. The dashboard still uses getScheduleForDays
 * for progression. */
function getAllSessionsForProgram(programSlug) {
  var table = PROGRAM_SCHEDULES[programSlug];
  if (!table) return ['full_a', 'full_b', 'full_c'];
  var seen = {};
  var all = [];
  [2, 3, 4, 5, 6].forEach(function(d) {
    (table[d] || []).forEach(function(key) {
      if (!seen[key]) { seen[key] = true; all.push(key); }
    });
  });
  return all;
}

/* Neutral frequency label for the dashboard "Training Split" stats row.
 * Deliberately program-agnostic and split-agnostic: just the day count, so it
 * never claims "Push / Pull / Legs" for, say, an active Glute Builder program.
 * The Today card and program pages still show specific session names. */
function getFrequencyLabel(trainingDays) {
  var d = parseInt(trainingDays, 10);
  if (!d) return 'Not training yet';
  return d + (d === 1 ? ' day/week' : ' days/week');
}

/* Descriptive split name (Full Body / Upper-Lower / PPL) derived from days.
 * Still used to populate profiles.training_split on recalc; NOT shown in the
 * dashboard stats row anymore (see getFrequencyLabel). */
function getSplitLabel(trainingDays) {
  var d = parseInt(trainingDays, 10);
  if (!d)       return 'Start with 2x Full Body';
  if (d <= 2)   return 'Full Body A/B';
  if (d === 3)  return 'Full Body A/B/C';
  if (d === 4)  return 'Upper / Lower Split';
  return 'Push / Pull / Legs'; // 5–6 days
}

function sessionLabel(key) {
  return SESSION_LABELS[key] || key;
}

/* Program DISPLAY NAMES moved to program-catalog.js in Phase 4.3.6 CP1b.
 * The map here had already drifted from program-state.js ("90-Day Fat Loss
 * Blueprint" vs "90 Day Fat Loss Blueprint"), which is exactly the duplication
 * the canonical catalog exists to remove. `programName(slug)` now lives in
 * program-catalog.js; every call site already guards with
 * `typeof programName === 'function'`, so a surface that does not load the
 * catalog degrades to the same empty string it produced for an unknown slug.
 *
 * This file keeps what it has always owned: program × training_days → session
 * keys, and session labels. */
