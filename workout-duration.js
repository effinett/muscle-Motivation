/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Workout length (Phase 4.3.9G, owner decision 2026-11-26)
 *
 * Pure and shared: estimates how long a Program session takes and builds that
 * session toward a target length of 30, 45, 60 or 90 minutes. No DOM, fetch,
 * DB or clock. NOT YET CONSUMED — the Train, Onboarding and Profile wiring and
 * the stored priorities each wait for owner approval.
 *
 * What it owns
 *   • estimate(exercises)        → seconds for warm-up, work, rest, changeovers
 *   • build(exercises, plan, min) → the session for that length, with every
 *                                   change listed and a `fits` flag
 *   • lengthForSession(usual, today) → today's choice applies to ONE session
 *   • evaluateWeek(sessions, min) → per-session results + weekly gaps
 *
 * Rules it enforces (as approved)
 *   • A plan lists, per session, an ordered TRIM list (what goes first when
 *     time is short) and an ordered ADD list (purposeful work for longer
 *     sessions). Priorities are per session: the same exercise can be
 *     essential on one day and an accessory on another.
 *   • Essential exercises are never removed, never go below their minimum
 *     sets, and keep their full planned rest. If the essentials alone do not
 *     fit, the result is flagged (`fits: false`) — never silently cut.
 *   • Identity and prescription are preserved: an exercise keeps its
 *     exercise_id, name, rep range, rest and notes; only `sets` changes, or it
 *     is removed/added whole. Progression keys on exercise identity, so a
 *     length change never touches history or progression.
 *   • Inputs are never mutated.
 *
 * Browser: global `WorkoutDuration`.  Node: guarded module.exports.
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  var VERSION = '0.1.0';
  var LENGTHS = Object.freeze([30, 45, 60, 90]);
  var DEFAULT_LENGTH = 60;

  /* Estimate model. Plain constants so they can be tuned in one place.
   *   warm-up      general warm-up plus ramp-up sets, scaled by length
   *   set work     time under load for one rep-based working set
   *   timed set    a timed set lasts its prescribed top time (reps_high sec)
   *   changeover   moving to the next exercise: setup, plates, walking
   * Rest is counted between sets of an exercise; the changeover replaces the
   * rest after its last set. */
  var MODEL = Object.freeze({
    warmupSec: Object.freeze({ 30: 300, 45: 360, 60: 420, 90: 480 }),
    setWorkSec: 45,
    changeoverSec: 75
  });

  // Tolerances: a session may run slightly over a short target, and "around
  // 90" means within a band under the target.
  var OVER_TOLERANCE_SEC = 120;   // never more than 2 min over
  var UNDER_TOLERANCE_SEC = 480;  // a built session aims within 8 min under

  function isLength(min) { return LENGTHS.indexOf(min) >= 0; }

  function int(v, fallback) {
    var n = parseInt(v, 10);
    return isFinite(n) ? n : fallback;
  }

  function isTimed(ex) { return ex && ex.tracking === 'time'; }

  function exerciseSec(ex) {
    var sets = int(ex.sets, 0);
    if (sets <= 0) return 0;
    var work = isTimed(ex) ? int(ex.reps_high, MODEL.setWorkSec) : MODEL.setWorkSec;
    var rest = int(ex.rest_sec, 90);
    return sets * work + (sets - 1) * rest + MODEL.changeoverSec;
  }

  /* Seconds for a session at a given length's warm-up (default 60). */
  function estimate(exercises, lengthMin) {
    var warm = MODEL.warmupSec[isLength(lengthMin) ? lengthMin : DEFAULT_LENGTH];
    var total = warm;
    (exercises || []).forEach(function (ex) { total += exerciseSec(ex); });
    return total;
  }

  function toMin(sec) { return Math.round(sec / 60); }

  function key(ex) { return ex.exercise_id || ex.name; }

  function copyEx(ex) {
    var c = {};
    Object.keys(ex).forEach(function (k) { c[k] = ex[k]; });
    return c;
  }

  function find(list, ref) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].exercise_id === ref || list[i].name === ref) return i;
    }
    return -1;
  }

  /* plan = {
   *   essential: [ref, …]            refs are exercise_id or name
   *   minSets:   { ref: n, … }       floor for essentials (default 3)
   *   trim: [ {cut: ref} | {sets: ref, to: n}, … ]   in the order to apply
   *   add:  [ {exercise: {...}} | {sets: ref, to: n}, … ] in the order to apply
   * } */
  function build(exercises, plan, lengthMin) {
    if (!isLength(lengthMin)) throw new Error('length must be one of ' + LENGTHS.join(', '));
    plan = plan || {};
    var essential = (plan.essential || []).slice();
    var minSets = plan.minSets || {};
    var targetSec = lengthMin * 60;
    var out = (exercises || []).map(copyEx);
    var changes = [];

    function isEssential(ex) {
      return essential.indexOf(ex.exercise_id) >= 0 || essential.indexOf(ex.name) >= 0;
    }
    function floorFor(ex) {
      var f = minSets[ex.exercise_id];
      if (f == null) f = minSets[ex.name];
      return isEssential(ex) ? int(f, 3) : 1;
    }
    function now() { return estimate(out, lengthMin); }

    if (now() > targetSec + OVER_TOLERANCE_SEC) {
      (plan.trim || []).forEach(function (step) {
        if (now() <= targetSec + OVER_TOLERANCE_SEC) return;
        if (step.cut != null) {
          var i = find(out, step.cut);
          if (i < 0 || isEssential(out[i])) return;
          changes.push({ action: 'removed', name: out[i].name, sets: out[i].sets });
          out.splice(i, 1);
        } else if (step.sets != null) {
          var j = find(out, step.sets);
          if (j < 0) return;
          var to = Math.max(int(step.to, 1), floorFor(out[j]));
          if (to >= out[j].sets) return;
          changes.push({ action: 'sets_reduced', name: out[j].name, from: out[j].sets, to: to });
          out[j].sets = to;
        }
      });
    } else {
      (plan.add || []).forEach(function (step) {
        var before = now();
        if (before >= targetSec - UNDER_TOLERANCE_SEC) return;
        if (step.exercise) {
          if (find(out, key(step.exercise)) >= 0) return;
          var ex = copyEx(step.exercise);
          out.push(ex);
          if (now() > targetSec + OVER_TOLERANCE_SEC) { out.pop(); return; }
          changes.push({ action: 'added', name: ex.name, sets: ex.sets });
        } else if (step.sets != null) {
          var k = find(out, step.sets);
          if (k < 0 || int(step.to, 0) <= out[k].sets) return;
          var from = out[k].sets;
          out[k].sets = int(step.to, from);
          if (now() > targetSec + OVER_TOLERANCE_SEC) { out[k].sets = from; return; }
          changes.push({ action: 'sets_added', name: out[k].name, from: from, to: out[k].sets });
        }
      });
    }

    var sec = now();
    return {
      lengthMin: lengthMin,
      exercises: out,
      estimateSec: sec,
      estimateMin: toMin(sec),
      changes: changes,
      fits: sec <= targetSec + OVER_TOLERANCE_SEC,
      onTarget: sec <= targetSec + OVER_TOLERANCE_SEC && sec >= targetSec - UNDER_TOLERANCE_SEC,
      underBy: Math.max(0, toMin(targetSec - sec))
    };
  }

  /* Today's choice applies to this session only; with none, the usual length
   * (or 60 when the user never chose one). */
  function lengthForSession(usualMin, todayMin) {
    if (isLength(todayMin)) return todayMin;
    if (isLength(usualMin)) return usualMin;
    return DEFAULT_LENGTH;
  }

  /* sessions = [{ key, exercises, plan }]. Returns every built session plus
   * the week's gaps: sessions whose essentials do not fit, and exercises
   * removed that the rest of the week never trains. */
  function evaluateWeek(sessions, lengthMin) {
    var results = (sessions || []).map(function (s) {
      var r = build(s.exercises, s.plan, lengthMin);
      r.key = s.key;
      return r;
    });
    var trained = {};
    results.forEach(function (r) {
      r.exercises.forEach(function (ex) { trained[key(ex)] = true; });
    });
    var gaps = [];
    results.forEach(function (r) {
      if (!r.fits) gaps.push({ type: 'essentials_do_not_fit', session: r.key, estimateMin: r.estimateMin });
    });
    var reported = {};
    results.forEach(function (r) {
      r.changes.forEach(function (c) {
        if (c.action !== 'removed') return;
        var src = (sessions.filter(function (s) { return s.key === r.key; })[0] || {}).exercises || [];
        var orig = src[find(src, c.name)];
        var k = orig ? key(orig) : c.name;
        if (!trained[k] && !reported[k]) {
          reported[k] = true;
          gaps.push({ type: 'dropped_for_week', session: r.key, name: c.name });
        }
      });
    });
    return { lengthMin: lengthMin, sessions: results, gaps: gaps };
  }

  var api = {
    VERSION: VERSION, LENGTHS: LENGTHS, DEFAULT_LENGTH: DEFAULT_LENGTH, MODEL: MODEL,
    OVER_TOLERANCE_SEC: OVER_TOLERANCE_SEC, UNDER_TOLERANCE_SEC: UNDER_TOLERANCE_SEC,
    isLength: isLength, estimate: estimate, build: build,
    lengthForSession: lengthForSession, evaluateWeek: evaluateWeek
  };
  root.WorkoutDuration = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
