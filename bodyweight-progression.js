/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Bodyweight Exercise Progression v1
 * (roadmap 5.1.2 bodyweight scope, required before 4.4; owner decisions 2026-11-16)
 *
 * Pure and shared: the workout screen, the Completion card and the future AI
 * Coach all read the SAME decision from here. No DOM, fetch, DB or clock.
 *
 * The rules, exactly as decided:
 *   • The ceiling is the top of the Program's prescribed range (reps_high).
 *     There is no separate per-exercise ceiling.
 *   • A session counts as "at the ceiling" only when it was completed, every
 *     prescribed working set was done, and every working set reached the
 *     ceiling. Warm-ups never count.
 *   • Two consecutive such sessions → the client is OFFERED the next
 *     pre-approved harder variation on that exercise's path. Accepting is the
 *     client's confirmation of good form; nothing is swapped silently.
 *   • An exercise at the end of its path (TERMINAL) holds at its prescribed
 *     range and is marked as having no next step. Reps or time never grow
 *     past the ceiling, and sets are never added.
 *   • A declined offer comes back only after two more sessions at the ceiling.
 *   • An exercise on no path and not terminal (mobility, breathing, cardio,
 *     anything with equipment) is NOT ELIGIBLE: v1 says nothing about it.
 *   • A step-up is stored per client and applied when a session is built. No
 *     Program or Routine is ever edited.
 *
 * Identity is the canonical exercises.id, never a name.
 *
 * Browser: global `BodyweightProgression`.  Node: guarded module.exports.
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  var VERSION = 1;
  var REQUIRED_STREAK = 2;

  // Canonical ids (public.exercises). Every one is in the reviewed 38-exercise
  // equipment-free pool, so a step can never leave Bodyweight Foundations' pool.
  var EX = {
    WALL_PUSH_UP:     '784a0508-84c3-42a6-98b1-c00cc780e5cd',
    KNEE_PUSH_UP:     'a1bb3980-ae49-48ce-a0b5-91bffd5daeda',
    PUSH_UP:          'dfb48ed7-a1b9-4dc3-91c2-eabf52c821ac',
    PIKE_LEAN:        'c3d81925-04dc-4caf-b5ef-5b42740028e8',
    PIKE_PUSH_UP:     'b1f4c7a2-3e58-4d91-9c26-7a0d8e5f1b34',
    BODYWEIGHT_SQUAT: '97501496-7f81-4552-82ab-d3f326b8ff06',
    SPLIT_SQUAT:      'a7942454-736c-4d84-980d-39b40298a1b2',
    GLUTE_BRIDGE:     'ff15ede3-a361-415a-8e20-6a7244bad0b3',
    SL_GLUTE_BRIDGE:  'da2d9535-6e82-4790-84c9-8e1a0d549718',
    REVERSE_CRUNCH:   'a224a468-28c0-4ba2-b6f9-c8a3f45d2147',
    LYING_LEG_RAISE:  '0b519d3f-6a32-4883-955c-ad9c87f7385f',
    CRUNCHES:         '0d28f8c9-7485-4b0a-9552-b56cf3c556bf',
    SIT_UP:           'c84d3609-cca3-4652-a1ee-b119105aac1a',
    DEAD_BUG:         '9c8998ab-9713-43f4-940b-5f8feec39d3c',
    BIRD_DOG:         'd3b6e9c4-5a7a-4f13-9e48-2c0f1a7b3d56',
    SUPERMAN:         'c2a5d8b3-4f69-4e02-8d37-1b9e0f6a2c45',
    PLANK:            'c320bf46-9f16-4483-bd2f-9ae9e88b7ad5',
    SIDE_PLANK:       'be4abe1a-93fa-4e87-9250-2627fe45ad3c',
    WALL_SIT:         '7948f9c4-2ec1-432b-ad79-7f27c5961577',
    REVERSE_LUNGE:    'd2812c92-d4c6-420c-b2d9-d2c5757871c9',
    LATERAL_LUNGE:    'eee8a605-10d6-41ad-9b79-65d626b598db',
    BICYCLE_CRUNCH:   '694c48ac-9251-4fa7-bb25-23353048963c',
    RUSSIAN_TWIST:    'e4015387-bed0-43e2-9129-4ca3c2b67414'
  };

  // Approved paths (owner-approved 2026-11-16). `to` carries the prescription
  // the slot uses after the step: the range the Program already prescribes for
  // that exercise elsewhere. Lying Leg Raise 8–12 is proposed, pending review.
  var PATHS = [
    { from: EX.WALL_PUSH_UP,     to: EX.KNEE_PUSH_UP,    toName: 'Knee Push-Up',            reps_low: 8, reps_high: 12, unit: 'reps' },
    { from: EX.KNEE_PUSH_UP,     to: EX.PUSH_UP,         toName: 'Push-Up',                 reps_low: 6, reps_high: 12, unit: 'reps' },
    { from: EX.PIKE_LEAN,        to: EX.PIKE_PUSH_UP,    toName: 'Pike Push-Up',            reps_low: 6, reps_high: 10, unit: 'reps' },
    { from: EX.BODYWEIGHT_SQUAT, to: EX.SPLIT_SQUAT,     toName: 'Split Squat',             reps_low: 8, reps_high: 12, unit: 'reps' },
    { from: EX.GLUTE_BRIDGE,     to: EX.SL_GLUTE_BRIDGE, toName: 'Single-Leg Glute Bridge', reps_low: 8, reps_high: 12, unit: 'reps' },
    { from: EX.REVERSE_CRUNCH,   to: EX.LYING_LEG_RAISE, toName: 'Lying Leg Raise',         reps_low: 8, reps_high: 12, unit: 'reps' },
    { from: EX.CRUNCHES,         to: EX.SIT_UP,          toName: 'Sit-Up',                  reps_low: 8, reps_high: 12, unit: 'reps' }
  ];

  // End of path in v1. The first nine are the owner-reviewed list; the rest
  // have no approved path either (the last three are path destinations).
  var TERMINAL = [
    EX.PUSH_UP, EX.SPLIT_SQUAT, EX.SL_GLUTE_BRIDGE, EX.DEAD_BUG, EX.BIRD_DOG,
    EX.SUPERMAN, EX.PLANK, EX.SIDE_PLANK, EX.WALL_SIT,
    EX.REVERSE_LUNGE, EX.LATERAL_LUNGE, EX.BICYCLE_CRUNCH, EX.RUSSIAN_TWIST,
    EX.PIKE_PUSH_UP, EX.LYING_LEG_RAISE, EX.SIT_UP
  ];

  var STATUS = {
    NOT_ELIGIBLE: 'not_eligible',  // v1 says nothing; today's behaviour stands
    BUILDING:     'building',      // below the ceiling on at least one set
    ONE_MORE:     'one_more',      // at the ceiling once; one more session
    STEP_UP:      'step_up',       // offer the next variation
    TERMINAL:     'terminal'       // at the ceiling, no next step defined
  };

  function pathFrom(exerciseId) {
    for (var i = 0; i < PATHS.length; i++) if (PATHS[i].from === exerciseId) return PATHS[i];
    return null;
  }
  function isTerminal(exerciseId) { return TERMINAL.indexOf(exerciseId) !== -1; }
  function isEligible(exerciseId) { return !!pathFrom(exerciseId) || isTerminal(exerciseId); }

  function int(v) {
    var n = +v;
    return (v === null || v === undefined || v === '' || !isFinite(n)) ? null : Math.floor(n);
  }

  // One logged session at the ceiling? `session` = { completed, sets: [{ reps, completed, is_warmup }] }.
  function sessionAtCeiling(session, ceiling, prescribedSets) {
    if (!session || session.completed === false) return false;
    var working = (session.sets || []).filter(function (s) {
      return s && !s.is_warmup && s.completed !== false && int(s.reps) !== null;
    });
    if (!working.length || working.length < Math.max(1, prescribedSets || 1)) return false;
    for (var i = 0; i < working.length; i++) if (int(working[i].reps) < ceiling) return false;
    return true;
  }

  /* decide(input)
   *   exerciseId      canonical id of the exercise in this slot
   *   prescription    { reps_low, reps_high, sets } as the slot prescribes it
   *   history         completed-or-not sessions of THIS exercise, newest first,
   *                   each { date?, completed, sets: [...] }
   *   declinedAt      optional ISO date of the client's last "Not yet" for this
   *                   exercise; only sessions after it count toward a new offer
   * → { version, status, ceiling, streak, next } */
  function decide(input) {
    var i = input || {};
    var id = i.exerciseId;
    var rx = i.prescription || {};
    var ceiling = int(rx.reps_high);
    var out = { version: VERSION, status: STATUS.NOT_ELIGIBLE, ceiling: ceiling, streak: 0, next: null };
    if (!id || !isEligible(id) || ceiling === null) return out;
    if (int(rx.reps_low) !== null && int(rx.reps_low) >= ceiling) return out; // fixed target: no room to progress

    var history = Array.isArray(i.history) ? i.history : [];
    if (i.declinedAt) {
      history = history.filter(function (s) { return s && s.date && String(s.date) > String(i.declinedAt); });
    }
    var streak = 0;
    for (var k = 0; k < history.length; k++) {
      if (sessionAtCeiling(history[k], ceiling, int(rx.sets))) streak++; else break;
    }
    out.streak = streak;
    var path = pathFrom(id);
    if (streak >= REQUIRED_STREAK) {
      if (path) {
        out.status = STATUS.STEP_UP;
        out.next = { exerciseId: path.to, name: path.toName, reps_low: path.reps_low, reps_high: path.reps_high, unit: path.unit };
      } else {
        out.status = STATUS.TERMINAL;
      }
    } else if (streak === 1) {
      out.status = STATUS.ONE_MORE;
    } else {
      out.status = STATUS.BUILDING;
    }
    return out;
  }

  /* applySteps(entries, steps)
   * Builds the session the client actually does: each Routine entry whose
   * exercise has an ACCEPTED step-up is replaced by its next variation (keeping
   * sets, rest and notes-free guidance), following a chain of accepted steps.
   * `steps` = [{ from_exercise_id, to_exercise_id, state }], latest per `from`
   * wins. Returns NEW objects; the input entries are never mutated. Each
   * replaced entry carries `stepped_from` so the screen can say so. */
  function applySteps(entries, steps) {
    var accepted = {};
    (Array.isArray(steps) ? steps : []).forEach(function (s) {
      if (!s || !s.from_exercise_id) return;
      accepted[s.from_exercise_id] = s.state === 'accepted' ? s.to_exercise_id : null;
    });
    return (Array.isArray(entries) ? entries : []).map(function (e) {
      var copy = Object.assign({}, e);
      var seen = {};
      var originalName = e && e.name;
      while (copy.exercise_id && accepted[copy.exercise_id] && !seen[copy.exercise_id]) {
        seen[copy.exercise_id] = true;
        var path = pathFrom(copy.exercise_id);
        if (!path || path.to !== accepted[copy.exercise_id]) break; // only approved paths
        copy = Object.assign({}, copy, {
          exercise_id: path.to, name: path.toName,
          reps_low: path.reps_low, reps_high: path.reps_high,
          notes: '', stepped_from: originalName
        });
      }
      return copy;
    });
  }

  var api = {
    VERSION: VERSION, REQUIRED_STREAK: REQUIRED_STREAK, STATUS: STATUS, EX: EX,
    PATHS: PATHS, TERMINAL: TERMINAL,
    pathFrom: pathFrom, isTerminal: isTerminal, isEligible: isEligible,
    sessionAtCeiling: sessionAtCeiling, decide: decide, applySteps: applySteps
  };
  root.BodyweightProgression = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
