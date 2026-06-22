/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Progressive Overload Engine (Phase 3)
 *
 * A pure, reusable double-progression engine. NO database calls live here —
 * callers pass in the exercise + history and get back a recommendation. This
 * keeps it testable in Node and reusable across surfaces (workout logger,
 * dashboard, future AI coach).
 *
 * Double progression in one sentence:
 *   Keep the weight and add reps until you hit the TOP of the rep range on
 *   every working set — then add weight and drop back to the BOTTOM of the range.
 *
 * Exposed as `Progression` on window (browser) and module.exports (Node tests).
 *
 * Main entry points:
 *   Progression.analyze(input)        -> recommendation object
 *   Progression.evaluatePRs(sets, pr) -> PR detection / updated bests
 *   Progression.inferEquipment(name)  -> 'dumbbell' | 'barbell' | ...
 *   Progression.estimate1RM(w, reps)  -> Epley estimate
 * ────────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  var DEFAULT_LOW  = 8;
  var DEFAULT_HIGH = 12;
  var PLATEAU_SESSIONS = 3; // sessions without improvement before flagging plateau

  // Default working-set target for a brand-new exercise with no prescription.
  var DEFAULT_TARGET_SETS = 3;
  // History must span more than one session before it can establish a target —
  // a single recent (possibly incomplete) workout must never set the target.
  var MIN_SESSIONS_FOR_ESTABLISHED_TARGET = 2;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function num(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  // Drop trailing ".0" so 135 shows as "135", 137.5 stays "137.5".
  function fmtNum(n) {
    if (n === null || n === undefined || isNaN(n)) return '';
    return (Math.round(n * 10) / 10).toString();
  }

  // ── Equipment inference (drives rounding + jump size) ──────────────────────
  // Order matters: more specific patterns are checked first.
  function inferEquipment(name) {
    var n = (name || '').toLowerCase();
    if (/(plank|push.?up|pull.?up|chin.?up|\bdip\b|sit.?up|crunch|leg raise|dead ?bug|russian twist|hanging|mountain climber|burpee|bodyweight|hollow|superman)/.test(n)) return 'bodyweight';
    if (/(dumbbell|\bdb\b|goblet|farmer|suitcase)/.test(n)) return 'dumbbell';
    if (/(cable|pushdown|pulldown|pull.?down|lat pull|face pull|rope)/.test(n)) return 'cable';
    if (/(machine|leg press|leg curl|leg extension|pec deck|hack squat|smith|hammer strength)/.test(n)) return 'machine';
    if (/(barbell|bench press|deadlift|squat|overhead press|\bohp\b|romanian|\brdl\b|hip thrust|bent.?over row|\bbench\b|clean|snatch|press)/.test(n)) return 'barbell';
    return 'other';
  }

  // Round to a sensible plate increment, never below zero.
  // Dumbbells & everything else round to the nearest 5 lb — always achievable.
  function roundWeight(w, equip) {
    if (w === null || w === undefined || isNaN(w)) return null;
    if (w <= 0) return 0;
    var step = 5; // nearest 5 lb is universally loadable; safe default for all equipment
    return Math.max(0, Math.round(w / step) * step);
  }

  // How much weight to add when the user earns an increase.
  function weightIncrement(equip, name) {
    if (equip === 'bodyweight') return 0;
    if (equip === 'dumbbell') return 5;
    // Heavy lower-body barbell lifts tolerate a bigger jump.
    if (equip === 'barbell' && /(squat|deadlift|hip thrust)/.test((name || '').toLowerCase())) return 10;
    return 5; // barbell upper, cable, machine, other
  }

  // Epley estimated 1RM. reps <= 1 returns the weight itself.
  function estimate1RM(w, reps) {
    w = num(w); reps = num(reps);
    if (w === null || reps === null || reps <= 0) return null;
    if (reps === 1) return w;
    return w * (1 + reps / 30);
  }

  // ── Set / session shaping ──────────────────────────────────────────────────
  // A "session" = { date, sets: [{ weight, reps, completed, is_warmup }] }.
  // Working sets = completed, non-warmup sets that actually have reps. If none
  // were marked completed, fall back to any non-warmup sets with reps so a user
  // who logs but doesn't tick checkboxes still gets a recommendation.
  function workingSets(session) {
    if (!session || !session.sets) return [];
    var withReps = session.sets.filter(function (s) {
      return !s.is_warmup && num(s.reps) !== null;
    });
    var done = withReps.filter(function (s) { return s.completed; });
    return done.length ? done : withReps;
  }

  // The weight the working sets were actually performed at: the most common
  // weight (ties break toward the heavier load). Null for bodyweight work.
  function pickBaseWeight(sets) {
    var counts = {};
    sets.forEach(function (s) {
      var w = num(s.weight);
      if (w === null) return;
      counts[w] = (counts[w] || 0) + 1;
    });
    var keys = Object.keys(counts);
    if (!keys.length) return null;
    var bestW = null, bestC = -1;
    keys.forEach(function (k) {
      var w = parseFloat(k), c = counts[k];
      if (c > bestC || (c === bestC && w > bestW)) { bestC = c; bestW = w; }
    });
    return bestW;
  }

  // Reps performed at the base weight (or all reps for bodyweight work).
  function repsAtWeight(sets, base) {
    var arr = sets.filter(function (s) {
      return base === null ? num(s.reps) !== null : num(s.weight) === base;
    }).map(function (s) { return num(s.reps); }).filter(function (r) { return r !== null; });
    if (!arr.length) {
      arr = sets.map(function (s) { return num(s.reps); }).filter(function (r) { return r !== null; });
    }
    return arr;
  }

  // Every set the user set up that session (non-warmup, has reps) — completed
  // OR not. This is the PRESCRIBED/attempted set count, used to figure out the
  // target set count. It must stay separate from the COMPLETED set count so an
  // incomplete session never shrinks the target (see resolveTargetSets).
  function loggedSets(session) {
    if (!session || !session.sets) return [];
    return session.sets.filter(function (s) {
      return !s.is_warmup && num(s.reps) !== null;
    });
  }

  // ── Exercise classification (Phase 3 stub — minimum viable architecture) ────
  // Deliberately lightweight. There is NO classification table, AI, or volume
  // science here yet. This is the single seam future phases extend:
  //   • classifyExercise()           → replace the regex with a lookup table
  //   • EXERCISE_CATEGORY_DEFAULTS   → per-category / per-goal default sets
  //   • VOLUME_LANDMARKS             → MEV / MAV / MRV per category (AI volume)
  // Callers only ever ask for defaultTargetSets(name), so the internals can grow
  // without touching the engine or the UI.
  var COMPOUND_RE = /(squat|deadlift|bench|press|\brow\b|pulldown|pull.?up|chin.?up|\bdip\b|lunge|hip thrust|clean|snatch|thruster|leg press)/i;

  function classifyExercise(name) {
    return COMPOUND_RE.test(name || '') ? 'compound' : 'isolation';
  }

  // Per-category defaults. Both 3 working sets for now (per spec) — the shape
  // lets a future version tune compound vs. isolation independently.
  var EXERCISE_CATEGORY_DEFAULTS = {
    compound:  { defaultSets: DEFAULT_TARGET_SETS },
    isolation: { defaultSets: DEFAULT_TARGET_SETS }
  };

  // Placeholder ONLY — not consulted by any logic yet. Reserved so future AI
  // volume work (MEV/MAV/MRV weekly set landmarks per category) has a home.
  var VOLUME_LANDMARKS = {
    compound:  { mev: null, mav: null, mrv: null },
    isolation: { mev: null, mav: null, mrv: null }
  };

  function defaultTargetSets(name) {
    var conf = EXERCISE_CATEGORY_DEFAULTS[classifyExercise(name)] || EXERCISE_CATEGORY_DEFAULTS.isolation;
    return conf.defaultSets;
  }

  // The user's established logged set count, but ONLY when history is deep
  // enough to be meaningful (>= MIN_SESSIONS_FOR_ESTABLISHED_TARGET sessions).
  // A single recent session — which may be incomplete — never counts. Uses the
  // most common LOGGED (set-up, not completed) count so an unfinished workout
  // can't shrink the target. Ties break toward more sets. Returns null if there
  // isn't enough history to establish a target.
  function establishedTargetSets(history) {
    var counts = (history || []).map(function (s) { return loggedSets(s).length; })
                                .filter(function (n) { return n > 0; });
    if (counts.length < MIN_SESSIONS_FOR_ESTABLISHED_TARGET) return null;
    var freq = {};
    counts.forEach(function (c) { freq[c] = (freq[c] || 0) + 1; });
    var bestC = null, bestF = -1;
    Object.keys(freq).forEach(function (k) {
      var c = parseInt(k, 10), f = freq[k];
      if (f > bestF || (f === bestF && c > bestC)) { bestF = f; bestC = c; }
    });
    return bestC;
  }

  // Resolve how many sets the user SHOULD do, independent of how many they
  // actually completed last time. Priority:
  //   1. programmed/prescribed sets passed in (program exercise)
  //   2. an explicit previous prescription passed in
  //   3. the user's established target from SUFFICIENT history (never one session)
  //   4. category default (compound/isolation → 3 for now)
  function resolveTargetSets(input, history) {
    var t = num(input.targetSets);
    if (t && t > 0) return Math.round(t);
    var p = num(input.prescribedSets);
    if (p && p > 0) return Math.round(p);
    var established = establishedTargetSets(history);
    if (established) return established;
    return defaultTargetSets(input.exerciseName);
  }

  // ── Display formatting ─────────────────────────────────────────────────────
  function formatPerformance(sets) {
    var rich = sets.map(function (s) { return { w: num(s.weight), r: num(s.reps) }; })
                   .filter(function (s) { return s.r !== null; });
    if (!rich.length) return '';
    var weights = rich.map(function (s) { return s.w; });
    var uniform = weights.every(function (w) { return w === weights[0]; });
    if (uniform) {
      var wLabel = weights[0] === null ? 'BW' : fmtNum(weights[0]);
      return wLabel + ' × ' + rich.map(function (s) { return s.r; }).join(', ');
    }
    return rich.map(function (s) {
      return (s.w === null ? 'BW' : fmtNum(s.w)) + '×' + s.r;
    }).join(', ');
  }

  function formatRecommendation(weight, reps, setCount) {
    var wLabel = (weight === null || weight === undefined) ? 'BW' : fmtNum(weight);
    var repsList = [];
    for (var i = 0; i < setCount; i++) repsList.push(reps);
    return wLabel + ' × ' + repsList.join(', ');
  }

  // ── Plateau / deload detection ─────────────────────────────────────────────
  // Looks at the best estimated-1RM (or weight×reps for bodyweight) of each of
  // the last N sessions. No improvement across the window = plateau. A clear
  // downward trend, or a flat/declining plateau, suggests a deload.
  function sessionScore(session) {
    var ws = workingSets(session);
    var best = 0;
    ws.forEach(function (s) {
      var w = num(s.weight), r = num(s.reps);
      if (r === null) return;
      var score = (w === null) ? r : (estimate1RM(w, r) || 0);
      if (score > best) best = score;
    });
    return best;
  }

  function detectPlateau(history, sessionsWanted) {
    var n = sessionsWanted || PLATEAU_SESSIONS;
    var sessions = (history || []).slice(0, n);
    if (sessions.length < n) return { plateau: false, declining: false, sessions: sessions.length };

    var scores = sessions.map(sessionScore); // newest first
    var newest = scores[0];
    var oldest = scores[scores.length - 1];
    var EPS = 0.01;

    var improved = newest > oldest + EPS;
    var plateau  = !improved; // flat or down across the whole window
    var declining = newest < oldest - EPS;

    return { plateau: plateau, declining: declining, sessions: sessions.length };
  }

  // ── Main engine ────────────────────────────────────────────────────────────
  function analyze(input) {
    input = input || {};
    var name = input.exerciseName || '';
    var equip = inferEquipment(name);

    var low = num(input.repsLow);
    var high = num(input.repsHigh);
    if (low === null || high === null || low > high) { low = DEFAULT_LOW; high = DEFAULT_HIGH; }

    var history = Array.isArray(input.history) ? input.history : [];
    var last = history.length ? history[0] : null;
    var lastWorking = workingSets(last);

    var goalRange = { low: low, high: high, display: low + '–' + high + ' reps' };

    // ── No history → empty state, lean on programmed targets if present ──────
    if (!lastWorking.length) {
      var pw = num(input.programmedWeight);
      var pr = num(input.programmedReps);
      var recReps = pr !== null ? pr : low;
      var recSets = resolveTargetSets(input, history);
      var startWeight = pw !== null ? roundWeight(pw, equip) : null;
      var note;
      if (startWeight !== null) {
        note = 'Start around ' + fmtNum(startWeight) + ' lb and aim for ' + low + '–' + high + ' reps.';
      } else if (equip === 'bodyweight') {
        note = 'Log your sets — aim for ' + low + '–' + high + ' reps and we\'ll guide you next time.';
      } else {
        note = 'Pick a weight you can do for ' + low + '–' + high + ' reps. We\'ll guide your progression next time.';
      }
      return {
        hasHistory: false,
        equipment: equip,
        goalRange: goalRange,
        lastPerformance: null,
        recommendedWeight: startWeight,
        recommendedReps: recReps,
        recommendedSets: recSets,
        recommendedDisplay: formatRecommendation(startWeight, recReps, recSets),
        action: 'start',
        plateau: false,
        deloadSuggested: false,
        coachNote: note
      };
    }

    // ── Analyse last performance ────────────────────────────────────────────
    var base = pickBaseWeight(lastWorking);
    var repsArr = repsAtWeight(lastWorking, base);
    var minReps = Math.min.apply(null, repsArr);
    var maxReps = Math.max.apply(null, repsArr);

    // Target set count is resolved INDEPENDENTLY of how many sets were actually
    // completed — an incomplete session must never shrink the target. lastWorking
    // is the COMPLETED set count (or all logged sets when none were ticked).
    var targetSets    = resolveTargetSets(input, history);
    var completedSets = lastWorking.length;

    var plat = detectPlateau(history);

    var action, recWeight, recReps, note;
    var inc = weightIncrement(equip, name);

    // ── Incomplete session: completed fewer sets than the target ─────────────
    // Hold the weight, keep the SAME target set count, and ask the user to
    // finish all sets before earning a weight increase. Never reduce the target.
    if (completedSets < targetSets) {
      recWeight = base;
      recReps = Math.min(high, Math.max(low, isFinite(maxReps) ? maxReps : low));
      return {
        hasHistory: true,
        equipment: equip,
        goalRange: goalRange,
        lastPerformance: { weight: base, reps: repsArr, display: formatPerformance(lastWorking) },
        recommendedWeight: recWeight,
        recommendedReps: recReps,
        recommendedSets: targetSets,
        recommendedDisplay: formatRecommendation(recWeight, recReps, targetSets),
        action: 'incomplete',
        plateau: false,
        deloadSuggested: false,
        coachNote: 'Complete all target sets before increasing weight.'
      };
    }

    // Weight only increases when the top of the range is hit across ALL target
    // sets — guaranteed here because completedSets >= targetSets.
    var allHitHigh = repsArr.length > 0 && minReps >= high;

    if (allHitHigh) {
      // Earned the increase: bump weight, reset to bottom of range.
      action = 'increase';
      if (base === null || equip === 'bodyweight' || inc === 0) {
        recWeight = base; // bodyweight — can't add load
        recReps = high;
        note = 'You topped the rep range. Add reps beyond ' + high + ', add load, or move to a harder variation.';
      } else {
        recWeight = roundWeight(base + inc, equip);
        if (recWeight <= base) recWeight = base + inc; // guard rounding that doesn't move
        recReps = low;
        note = 'Strong — you hit the top of the range on every set. Move up to ' + fmtNum(recWeight) + ' lb and build back from ' + low + ' reps.';
      }
    } else if (minReps >= low) {
      // In range → hold weight, push reps toward the top.
      action = 'hold';
      recWeight = base;
      if (minReps === maxReps && maxReps < high) {
        recReps = Math.min(high, maxReps + 1);
        note = 'Add 1 rep before increasing weight — aim for ' + recReps + ' on every set.';
      } else if (maxReps < high) {
        recReps = maxReps; // bring the lagging sets up to your top set first
        note = 'Match your top set (' + maxReps + ' reps) on every set, then keep adding reps toward ' + high + '.';
      } else {
        // Top set already at the ceiling but a lagging set held it back.
        recReps = high;
        note = 'Bring every set up to ' + high + ' reps, then add weight next time.';
      }
    } else {
      // Below the bottom of the range.
      var severe = minReps < (low - 2);
      if (severe && base !== null && equip !== 'bodyweight') {
        action = 'reduce';
        recWeight = roundWeight(base * 0.9, equip);
        if (recWeight >= base) recWeight = Math.max(0, base - inc); // ensure it actually drops
        recReps = low;
        note = 'Reps dropped well below ' + low + '. Reduce to ' + fmtNum(recWeight) + ' lb and rebuild clean volume.';
      } else {
        action = 'hold';
        recWeight = base;
        recReps = low;
        note = 'Stay at this weight until you hit at least ' + low + ' reps on every set.';
      }
    }

    // ── Fold plateau / deload guidance into the note ────────────────────────
    // Deload is reserved for a clear drop in performance, or a repeated grind
    // where the user keeps stalling at/below the bottom of the range. A flat
    // plateau that's still inside the rep range just gets a "push for the top"
    // nudge, not a deload.
    var deloadCandidate = plat.declining || (plat.plateau && (action === 'reduce' || minReps < low));
    var deloadSuggested = false;
    if (deloadCandidate && action !== 'increase') {
      deloadSuggested = true;
      if (base !== null && equip !== 'bodyweight') {
        var deloadW = roundWeight(base * 0.9, equip);
        if (deloadW >= base) deloadW = Math.max(0, base - inc);
        note = 'Progress has stalled for ' + plat.sessions + ' sessions. Consider a deload — drop to about ' + fmtNum(deloadW) + ' lb and rebuild.';
      } else {
        note = 'Progress has stalled for ' + plat.sessions + ' sessions. Consider an easier variation or extra rest, then rebuild.';
      }
    } else if (plat.plateau && action === 'hold') {
      note += ' You\'ve held here ' + plat.sessions + ' sessions — push for the top of the range.';
    }

    return {
      hasHistory: true,
      equipment: equip,
      goalRange: goalRange,
      lastPerformance: {
        weight: base,
        reps: repsArr,
        display: formatPerformance(lastWorking)
      },
      recommendedWeight: recWeight,
      recommendedReps: recReps,
      recommendedSets: targetSets,
      recommendedDisplay: formatRecommendation(recWeight, recReps, targetSets),
      action: action,
      plateau: plat.plateau,
      deloadSuggested: deloadSuggested,
      coachNote: note
    };
  }

  // ── PR detection ───────────────────────────────────────────────────────────
  // sets: completed working sets [{ weight, reps }] from the just-finished
  // workout. prior: the existing personal_records row (or null/empty).
  // Returns { best, updated, hadPrior, prMessages, topMessage }.
  //
  // Priority when describing a single set's PR:
  //   1. heavier weight than ever            -> weight PR
  //   2. same top weight, more reps           -> rep PR at that weight
  //   3. higher estimated 1RM                 -> 1RM PR
  //   4. higher single-set volume (w × reps)  -> volume PR
  function evaluatePRs(sets, prior) {
    prior = prior || {};
    var hadPrior = prior.best_weight != null || prior.best_reps != null ||
                   prior.best_volume != null || prior.best_estimated_1rm != null;

    var best = {
      best_weight:        prior.best_weight != null ? num(prior.best_weight) : null,
      best_reps:          prior.best_reps != null ? num(prior.best_reps) : null,
      best_volume:        prior.best_volume != null ? num(prior.best_volume) : null,
      best_estimated_1rm: prior.best_estimated_1rm != null ? num(prior.best_estimated_1rm) : null
    };

    var updated = false;
    var messages = [];

    (sets || []).forEach(function (s) {
      var w = num(s.weight), r = num(s.reps);
      if (w === null || r === null || r <= 0) return;
      var vol = w * r;
      var e1 = estimate1RM(w, r);
      var label = null;

      if (best.best_weight === null || w > best.best_weight) {
        label = fmtNum(w) + ' lb × ' + r;
      } else if (w === best.best_weight && (best.best_reps === null || r > best.best_reps)) {
        label = fmtNum(w) + ' lb × ' + r + ' (rep PR)';
      } else if (e1 !== null && (best.best_estimated_1rm === null || e1 > best.best_estimated_1rm)) {
        label = '~' + fmtNum(Math.round(e1)) + ' lb est. 1RM';
      } else if (best.best_volume === null || vol > best.best_volume) {
        label = fmtNum(w) + ' lb × ' + r + ' (volume PR)';
      }

      // Update the running bests regardless of which label fired.
      if (best.best_weight === null || w > best.best_weight) { best.best_weight = w; updated = true; }
      if (best.best_reps === null || r > best.best_reps) { best.best_reps = r; updated = true; }
      if (best.best_volume === null || vol > best.best_volume) { best.best_volume = vol; updated = true; }
      if (e1 !== null && (best.best_estimated_1rm === null || e1 > best.best_estimated_1rm)) { best.best_estimated_1rm = e1; updated = true; }

      if (label && hadPrior) messages.push(label);
    });

    return {
      best: best,
      updated: updated,
      hadPrior: hadPrior,
      prMessages: messages,
      topMessage: messages.length ? messages[0] : null
    };
  }

  var Progression = {
    analyze: analyze,
    evaluatePRs: evaluatePRs,
    detectPlateau: detectPlateau,
    inferEquipment: inferEquipment,
    roundWeight: roundWeight,
    weightIncrement: weightIncrement,
    estimate1RM: estimate1RM,
    workingSets: workingSets,
    // Exercise classification / target-set seam (extend in future phases)
    classifyExercise: classifyExercise,
    defaultTargetSets: defaultTargetSets,
    resolveTargetSets: resolveTargetSets,
    establishedTargetSets: establishedTargetSets,
    EXERCISE_CATEGORY_DEFAULTS: EXERCISE_CATEGORY_DEFAULTS,
    VOLUME_LANDMARKS: VOLUME_LANDMARKS,
    DEFAULT_LOW: DEFAULT_LOW,
    DEFAULT_HIGH: DEFAULT_HIGH,
    DEFAULT_TARGET_SETS: DEFAULT_TARGET_SETS,
    MIN_SESSIONS_FOR_ESTABLISHED_TARGET: MIN_SESSIONS_FOR_ESTABLISHED_TARGET,
    PLATEAU_SESSIONS: PLATEAU_SESSIONS
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Progression;
  root.Progression = Progression;
})(typeof window !== 'undefined' ? window : this);
