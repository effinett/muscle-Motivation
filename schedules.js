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
