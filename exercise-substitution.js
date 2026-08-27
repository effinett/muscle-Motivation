/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Shared Exercise-Substitution Engine (Phase 4.3.6I)
 *
 * The "what can I do instead?" sibling of exercise-core.js (identity),
 * exercise-custom.js (lifecycle), exercise-filters.js (discovery),
 * exercise-log.js (logging reliability) and exercise-detail.js (presentation).
 *
 * It answers exactly one question, deterministically:
 *
 *     "Given this exercise, which OTHER canonical exercises train the same
 *      thing closely enough to stand in for it?"
 *
 * It does NOT decide anything else. It never mutates a workout, never touches
 * a prescription, never talks to the DB, and never picks a winner on the
 * user's behalf — the UI presents its ranked candidates and the USER chooses.
 * That boundary is what makes it safe for a future Coach action (4.7.5) to
 * call: Coach may invoke this engine, but it can only ever propose what the
 * engine already considers valid.
 *
 * ── NO GUESSING, NO PROSE, NO AI ──────────────────────────────────────────
 * Every candidate is justified by STRUCTURED METADATA that is already on the
 * catalog row. There is no name matching, no fuzzy resolution, no LLM, no
 * hardcoded "bench press → these three" list, and no generated coaching copy.
 * If the metadata does not support a substitution, the engine returns nothing
 * rather than widening irresponsibly (§6: a chest press must never resolve to
 * a lat pulldown just because both use a barbell).
 *
 * ── THE TWO HARD GATES ────────────────────────────────────────────────────
 * A candidate is INELIGIBLE unless it passes both:
 *
 *   1. MUSCLE — it trains the same primary muscle GROUP as the source.
 *   2. TRACKING — it is measured the same way (reps vs time vs distance).
 *
 * Gate 2 is a correctness gate, not a nicety: an active workout prescribes a
 * number of sets, and a Routine prescribes sets × reps. Swapping a rep-based
 * exercise for a time-based one (Crunch → Plank) would carry a rep target onto
 * something that has no reps. Rather than invent a conversion (explicitly out
 * of scope), such candidates are filtered out entirely.
 *
 * Dual runtime, same pattern as its siblings:
 *   • Browser — <script src="exercise-substitution.js"> exposes
 *     `ExerciseSubstitution`. Load AFTER exercise-core.js.
 *   • Node — guarded module.exports for tests and benchmarks.
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  /* ── Shared primitives (reuse; never fork identity or vocabulary) ───────── */
  var _EI = (function () {
    if (root && root.ExerciseIntelligence) return root.ExerciseIntelligence;
    if (typeof module !== 'undefined' && module.exports) {
      try { return require('./exercise-core'); } catch (e) { return null; }
    }
    return null;
  })();
  var _EL = (function () {
    if (root && root.ExerciseLog) return root.ExerciseLog;
    if (typeof module !== 'undefined' && module.exports) {
      try { return require('./exercise-log'); } catch (e) { return null; }
    }
    return null;
  })();

  function normEquip(v) {
    if (_EI && typeof _EI.normalizeEquipment === 'function') return _EI.normalizeEquipment(v);
    return String(v || 'other').toLowerCase().trim() || 'other';
  }
  function familyOf(ex) {
    if (_EI && typeof _EI.getExerciseFamily === 'function') {
      try { return _EI.getExerciseFamily(ex); } catch (e) { return null; }
    }
    return null;
  }
  // Mirrors ExerciseLog.identityType (canonical > custom > legacy, dual-id invalid).
  function identityType(ref) {
    if (_EL && typeof _EL.identityType === 'function') return _EL.identityType(ref);
    if (!ref) return 'legacy';
    var hasCanon = ref.exerciseId != null, hasCustom = ref.customId != null;
    if (hasCanon && hasCustom) return 'invalid';
    if (hasCanon) return 'canonical';
    if (hasCustom) return 'custom';
    return 'legacy';
  }

  function lc(v) { return String(v == null ? '' : v).toLowerCase().trim(); }

  /* ── Muscle-group equivalence (curated, explicit, reviewable) ─────────────
   * `primary_muscle` is free text in the catalog and is FRAGMENTED in ways that
   * matter here: "Chest" (13 rows) and "Upper Chest" (2) are the same training
   * target for substitution purposes, as are Back/Lats, Shoulders/Front Delts,
   * Biceps/Brachialis and Abs/Core. Requiring exact string equality would give
   * every singleton (Brachialis, Front Delts) zero candidates for no real reason.
   *
   * This table is deliberately NARROWER than exercise-core's MUSCLE_REGION,
   * which folds biceps and triceps into one "arms" region — that is correct for
   * gating relationship edges but far too coarse here, since it would let a
   * curl stand in for a pushdown. Anything not listed keeps its own identity:
   * Quads, Hamstrings, Glutes, Calves, Adductors, Traps, Triceps and — very
   * deliberately — Rear Delts, which are a PULLING muscle and must never merge
   * into the pressing "Shoulders" group. */
  var MUSCLE_GROUP = {
    'chest': 'chest', 'upper chest': 'chest',
    'back': 'back', 'lats': 'back',
    'shoulders': 'shoulders', 'front delts': 'shoulders',
    'biceps': 'biceps', 'brachialis': 'biceps',
    'abs': 'abs', 'core': 'abs'
  };
  function muscleGroup(m) {
    var k = lc(m);
    if (!k) return '';
    return MUSCLE_GROUP[k] || k;
  }

  /* ── Tracking compatibility ───────────────────────────────────────────────
   * Rep-based tracking types are mutually interchangeable at the PRESCRIPTION
   * level — "3 × 8-12" is meaningful whether the load is a barbell, bodyweight,
   * or bodyweight plus a belt. (Carrying the LOAD across is a separate concern
   * and is deliberately not this module's job; the caller never copies weight.)
   * Time, distance and time+distance are each their own class, and no
   * cross-class conversion is invented here. */
  var TRACKING_CLASS = {
    weight_reps: 'reps',
    bodyweight_reps: 'reps',
    weighted_bodyweight: 'reps',
    time: 'time',
    distance: 'distance',
    time_distance: 'time_distance'
  };
  function trackingClass(t) {
    var k = lc(t);
    if (!k) return 'reps';              // catalog default; every live row sets one
    return TRACKING_CLASS[k] || ('other:' + k);
  }

  /* ── Scoring weights ──────────────────────────────────────────────────────
   * Tuned by editing THIS TABLE, the discipline food-ranking.js applies to
   * RANK_WEIGHTS. These order candidates WITHIN a tier; they can never promote
   * an ineligible candidate or move one across tiers, so a weight change can
   * never make a chest press suggest a row. */
  var SUB_WEIGHTS = {
    sameFamily: 40,        // exercise-core's curated family — the strongest signal
    sameForceType: 12,     // push vs pull vs static
    sameEquipment: 10,
    sameLoadStyle: 4,      // both free-weight, or both machine-guided
    sameLaterality: 6,     // unilateral vs bilateral
    secondaryOverlap: 2,   // per shared secondary muscle
    secondaryOverlapCap: 6,
    sameDifficulty: 4,
    nearDifficulty: 2,
    sameTrackingType: 5    // exact type, beyond the compatibility class
  };

  var DIFFICULTY_RANK = { beginner: 1, intermediate: 2, advanced: 3 };

  // Free-weight vs guided. A softer equipment signal than exact equality, so a
  // barbell press prefers a dumbbell press over a machine press when nothing
  // else separates them — without ever gating eligibility on equipment.
  var LOAD_STYLE = {
    barbell: 'free', dumbbell: 'free', kettlebell: 'free', bodyweight: 'free',
    machine: 'guided', cable: 'guided', smith: 'guided', band: 'guided'
  };
  function loadStyle(eq) { return LOAD_STYLE[normEquip(eq)] || 'other'; }

  function cleanList(v) {
    if (!Array.isArray(v)) return [];
    var out = [], seen = {};
    for (var i = 0; i < v.length; i++) {
      var s = lc(v[i]);
      if (!s || seen[s]) continue;
      seen[s] = 1; out.push(s);
    }
    return out;
  }

  /* ── Eligibility ──────────────────────────────────────────────────────────
   * The two hard gates plus the structural exclusions. Returns a reason string
   * when rejected so the decision is inspectable rather than a silent drop. */
  function eligibility(source, cand) {
    if (!cand || cand.id == null) return 'no_id';
    if (String(cand.id) === String(source.id)) return 'self';
    if (cand.is_active === false) return 'inactive';
    if (!muscleGroup(cand.primary_muscle)) return 'no_muscle';
    if (muscleGroup(cand.primary_muscle) !== muscleGroup(source.primary_muscle)) return 'muscle_mismatch';
    if (trackingClass(cand.tracking_type) !== trackingClass(source.tracking_type)) return 'tracking_mismatch';
    return null;
  }

  /* ── Structured similarity ────────────────────────────────────────────────
   * Every contribution is a named weight and every one is recorded in
   * `matched`, so `explain()` can state exactly which fields caused the match
   * (§36 — no opaque recommendation). */
  function score(source, cand) {
    var s = 0, matched = [];
    function add(w, label) { s += w; matched.push(label); }

    var sf = familyOf(source), cf = familyOf(cand);
    if (sf && cf && sf === cf) add(SUB_WEIGHTS.sameFamily, 'same_family');
    if (source.force_type && cand.force_type === source.force_type) {
      add(SUB_WEIGHTS.sameForceType, 'same_force_type');
    }
    var se = normEquip(source.equipment), ce = normEquip(cand.equipment);
    if (se === ce) add(SUB_WEIGHTS.sameEquipment, 'same_equipment');
    else if (loadStyle(se) === loadStyle(ce) && loadStyle(se) !== 'other') {
      add(SUB_WEIGHTS.sameLoadStyle, 'same_load_style');
    }
    if (!!source.is_unilateral === !!cand.is_unilateral) {
      add(SUB_WEIGHTS.sameLaterality, 'same_laterality');
    }
    var ss = cleanList(source.secondary_muscles), cs = cleanList(cand.secondary_muscles);
    var shared = ss.filter(function (m) { return cs.indexOf(m) !== -1; }).length;
    if (shared) {
      add(Math.min(shared * SUB_WEIGHTS.secondaryOverlap, SUB_WEIGHTS.secondaryOverlapCap),
        'secondary_overlap');
    }
    var sd = DIFFICULTY_RANK[lc(source.difficulty)] || 0;
    var cd = DIFFICULTY_RANK[lc(cand.difficulty)] || 0;
    if (sd && cd) {
      if (sd === cd) add(SUB_WEIGHTS.sameDifficulty, 'same_difficulty');
      else if (Math.abs(sd - cd) === 1) add(SUB_WEIGHTS.nearDifficulty, 'near_difficulty');
    }
    if (source.tracking_type && cand.tracking_type === source.tracking_type) {
      add(SUB_WEIGHTS.sameTrackingType, 'same_tracking_type');
    }
    return { score: s, matched: matched };
  }

  /* ── Display labels ───────────────────────────────────────────────────────
   * Derived from metadata, never generated. Neutral wording only — this module
   * makes no safety, medical or biomechanical-equivalence claim (§32). */
  var EQUIP_LABEL = {
    barbell: 'Barbell', dumbbell: 'Dumbbells', machine: 'Machine', cable: 'Cable',
    bodyweight: 'Bodyweight', kettlebell: 'Kettlebell', band: 'Band',
    smith: 'Smith machine', other: null
  };
  function equipLabel(eq) { return EQUIP_LABEL[normEquip(eq)] || null; }

  function reasonFor(source, cand, tier) {
    var parts = [tier === 'best' ? 'Same movement' : 'Same target'];
    if (tier === 'other') {
      // Say HOW it differs, so "Other" is never mysterious.
      parts[0] = 'Same muscle · Different movement';
    }
    var el = equipLabel(cand.equipment);
    if (el) parts.push(el);
    return parts.join(' · ');
  }

  /* ── Public: find substitutions ───────────────────────────────────────────
   * ref     — { name, exerciseId, customId } (the shared reference shape).
   * catalog — canonical `exercises` rows. Injected, never owned.
   * options — { bestLimit, otherLimit }.
   *
   * Returns:
   *   { kind, sourceId, sourceName, supported, best[], other[], note }
   *
   * `supported` answers "may we offer automatic suggestions at all" — false for
   * custom, legacy and invalid references, which the UI routes to the manual
   * picker instead. */
  var DEFAULTS = { bestLimit: 5, otherLimit: 4 };

  var NOTE = {
    custom: 'Automatic swaps aren’t available for your own exercises — choose a replacement yourself.',
    legacy: 'Automatic swaps aren’t available for this older exercise — choose a replacement yourself.',
    unknown: 'This exercise isn’t in the library, so there are no automatic suggestions.',
    none: 'No close alternatives in the library for this one.'
  };

  function findSubstitutions(ref, catalog, options) {
    var opts = options || {};
    var bestLimit = opts.bestLimit != null ? opts.bestLimit : DEFAULTS.bestLimit;
    var otherLimit = opts.otherLimit != null ? opts.otherLimit : DEFAULTS.otherLimit;

    var kind = identityType(ref);
    var out = {
      kind: kind,
      sourceId: null,
      sourceName: (ref && ref.name) ? String(ref.name) : '',
      supported: false,
      best: [], other: [], note: null
    };

    // Only a canonical reference can have metadata to reason over. A custom
    // carries none, and a legacy row has no stable identity — neither may be
    // guessed at. Both fall through to the manual picker in the UI.
    if (kind === 'custom') { out.note = NOTE.custom; return out; }
    if (kind === 'legacy' || kind === 'invalid') { out.note = NOTE.legacy; return out; }

    var list = Array.isArray(catalog) ? catalog : [];
    var source = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].id) === String(ref.exerciseId)) { source = list[i]; break; }
    }
    if (!source) { out.note = NOTE.unknown; return out; }

    out.supported = true;
    out.sourceId = source.id;
    out.sourceName = source.name || out.sourceName;

    var seen = {}, scored = [];
    for (var j = 0; j < list.length; j++) {
      var cand = list[j];
      if (eligibility(source, cand)) continue;
      var key = String(cand.id);
      if (seen[key]) continue;                 // duplicate ids collapse
      seen[key] = 1;
      var sc = score(source, cand);
      scored.push({
        id: cand.id,
        name: cand.name,
        equipment: cand.equipment || null,
        movement_pattern: cand.movement_pattern || null,
        tier: cand.movement_pattern === source.movement_pattern ? 'best' : 'other',
        score: sc.score,
        matched: sc.matched
      });
    }

    // Deterministic ordering: score desc, then name, then id. Same inputs always
    // produce the same order — no randomness, no Array.sort instability reliance.
    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      var an = lc(a.name), bn = lc(b.name);
      if (an !== bn) return an < bn ? -1 : 1;
      return String(a.id) < String(b.id) ? -1 : 1;
    });

    scored.forEach(function (c) {
      c.reason = reasonFor(source, c, c.tier);
      if (c.tier === 'best') { if (out.best.length < bestLimit) out.best.push(c); }
      else if (out.other.length < otherLimit) out.other.push(c);
    });

    if (!out.best.length && !out.other.length) out.note = NOTE.none;
    return out;
  }

  /* Why a specific pairing did or didn't qualify — for tests, diagnostics, and
   * any future Coach surface that must justify a proposed swap. */
  function explain(source, cand) {
    if (!source || !cand) return { eligible: false, rejectedBy: 'missing_input' };
    var rej = eligibility(source, cand);
    if (rej) {
      return {
        eligible: false, rejectedBy: rej, score: 0, matched: [],
        sourceGroup: muscleGroup(source.primary_muscle),
        candidateGroup: muscleGroup(cand.primary_muscle),
        sourceTracking: trackingClass(source.tracking_type),
        candidateTracking: trackingClass(cand.tracking_type)
      };
    }
    var sc = score(source, cand);
    return {
      eligible: true, rejectedBy: null,
      tier: cand.movement_pattern === source.movement_pattern ? 'best' : 'other',
      score: sc.score, matched: sc.matched,
      sourceGroup: muscleGroup(source.primary_muscle),
      candidateGroup: muscleGroup(cand.primary_muscle),
      sourceTracking: trackingClass(source.tracking_type),
      candidateTracking: trackingClass(cand.tracking_type)
    };
  }

  /* Whether a replacement may safely inherit the source's prescription. The
   * caller (UI) owns the prescription itself; this only reports compatibility
   * so no surface has to re-derive the rule. */
  function canInheritPrescription(source, replacement) {
    if (!source || !replacement) return false;
    return trackingClass(source.tracking_type) === trackingClass(replacement.tracking_type);
  }

  var ExerciseSubstitution = {
    SUB_WEIGHTS: SUB_WEIGHTS,
    MUSCLE_GROUP: MUSCLE_GROUP,
    TRACKING_CLASS: TRACKING_CLASS,
    NOTE: NOTE,
    DEFAULTS: DEFAULTS,
    muscleGroup: muscleGroup,
    trackingClass: trackingClass,
    identityType: identityType,
    findSubstitutions: findSubstitutions,
    explain: explain,
    canInheritPrescription: canInheritPrescription
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ExerciseSubstitution;
  root.ExerciseSubstitution = ExerciseSubstitution;
})(typeof window !== 'undefined' ? window : this);
