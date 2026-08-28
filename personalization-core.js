/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Personalization Core  ·  Phase 4.3.7 (D · E · F)
 *
 * ONE deterministic answer to "what did Muscle Motivation build for THIS
 * person?". It is the value layer that turns the profile onboarding already
 * collects into a coherent starting setup, so a user who finishes onboarding
 * does not land in a generic app.
 *
 * ── PERSONALIZED HERE MEANS DERIVED, NOT GENERATED ────────────────────────
 * There is no model call, no prose generation, and no randomness anywhere in
 * this file. Every output is a pure function of (profile, catalog) and every
 * recommendation carries STABLE REASON CODES naming the inputs that produced
 * it. Ranking logic never composes a sentence; the codes are turned into copy
 * by one static table at the bottom of this file, so Home, Train and
 * onboarding cannot drift into three explanations of the same decision.
 * Same inputs in, same plan out, forever.
 *
 * ── IT COMPUTES NO NUTRITION MATH ─────────────────────────────────────────
 * This is deliberate and load-bearing. BMR/TDEE/macro math already exists in
 * three places (calculator.html, onboarding.html, profile.html's recalc) and
 * has already drifted between two of them. Adding a fourth implementation
 * would make that worse. Instead this module READS the targets those flows
 * already persisted on `profiles` (target_calories · protein_target ·
 * maintenance_calories) and reports them. It never recalculates, never
 * second-guesses, and when a target is absent it says so rather than
 * inventing one. Nutrition math is owned by the flows that write it; this
 * module only presents what is already true.
 *
 * ── RECOMMENDATION IS NOT ACCESS, AND NEVER ENROLMENT ─────────────────────
 * Ranking NEVER consults purchases or entitlement. The best-fit Program is the
 * best fit whether or not the user can open it today; `accessible` is stamped
 * on afterwards, purely as an observation, from a caller-supplied list that
 * entitlement-core.js produced. Recommending is also not starting: nothing
 * here writes anything, so no `user_programs` row can ever appear because of a
 * recommendation. The user chooses.
 *
 * ── NO FALSE PRECISION ────────────────────────────────────────────────────
 * A reason code is emitted only when the input behind it genuinely exists AND
 * genuinely discriminated. Every published Program is currently "Any Setup",
 * so equipment separates nothing — and therefore never claims to. Missing
 * inputs produce a `missing` entry and a softer status, never a confident
 * guess. A NULL field is always "no signal" and never a mismatch.
 *
 * ── DERIVED, NOT STORED (4.3.7F) ──────────────────────────────────────────
 * `buildPersonalContext` returns the normalized personal-facts view Coach will
 * later consume. It is a READ MODEL over `profiles`, not a second store: no
 * table, no cache, no snapshot. Goal, targets and training days keep exactly
 * one source of truth, so a profile edit can never leave a stale plan behind —
 * the plan is re-derived on every read.
 *
 * Dual runtime, same pattern as its siblings:
 *   • Browser — <script src="personalization-core.js"> exposes
 *     `Personalization`. Load AFTER program-catalog.js where a catalog is used.
 *   • Node — guarded module.exports for tests.
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  var PLAN_VERSION = 1;

  /* ── vocabularies ───────────────────────────────────────────────────────
   * The user's own vocabulary (profiles.goal / training_experience /
   * gym_access) and the catalog's vocabulary (programs.goal / difficulty /
   * equipment_summary) are DIFFERENT vocabularies that happen to overlap.
   * Every crossing between them is an explicit table below — never a fuzzy
   * string comparison, never a substring test. */

  var GOAL_LABELS = {
    fatloss: 'Fat Loss',
    recomp: 'Recomposition',
    muscle: 'Muscle Gain'
  };

  var EXPERIENCE_LABELS = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced'
  };

  var GYM_ACCESS_LABELS = {
    full_gym: 'Full gym',
    home_basic: 'Home setup',
    bodyweight: 'Bodyweight only'
  };

  /* GOAL → PROGRAM GOAL.
   *
   * A user goal maps to an ORDERED preference over catalog goals, and the
   * position in that list becomes the goal rank. Higher wins, 0 = no match.
   *
   * `recomp` is the case that needs a policy: no Program declares goal
   * 'recomp', yet half the onboarded users choose it. Rather than leave them
   * unmatched or invent a 'recomp' catalog goal, recomp resolves to muscle
   * first and fat loss second — recomp trains like muscle gain, and that is
   * the honest closest fit. It ranks BELOW an exact match on purpose, and the
   * reason code it produces is `goal_partial_match`, never `goal_match`, so no
   * surface can claim an exactness the mapping does not have. */
  var GOAL_PREFERENCE = {
    fatloss: ['fatloss'],
    recomp: ['muscle', 'fatloss'],
    muscle: ['muscle']
  };

  var GOAL_EXACT_RANK = 10;   // an exact goal match outranks every fallback

  /* DIFFICULTY → EXPERIENCE LEVELS IT SUITS.
   *
   * `programs.difficulty` is free-form display text, so it is normalized
   * (lowercased, en/em dashes folded to '-', whitespace collapsed) and then
   * looked up EXACTLY. An unrecognised difficulty returns null, which means
   * "no signal" — it is never penalised and never rewarded. Adding a new
   * difficulty string to the catalog therefore degrades safely instead of
   * silently mismatching, and the fix is one line here. */
  var DIFFICULTY_LEVELS = {
    'beginner': ['beginner'],
    'intermediate': ['intermediate'],
    'advanced': ['advanced'],
    'beginner - intermediate': ['beginner', 'intermediate'],
    'intermediate - advanced': ['intermediate', 'advanced'],
    'beginner - advanced': ['beginner', 'intermediate', 'advanced'],
    'all levels': ['beginner', 'intermediate', 'advanced']
  };

  /* EQUIPMENT SUMMARY → GYM ACCESS IT SUITS. Same exact-match discipline.
   * Every published Program is 'Any Setup' today, so this table currently
   * discriminates nothing — which the reason-code rule below detects on its
   * own rather than being told. */
  var EQUIPMENT_ACCESS = {
    'any setup': ['full_gym', 'home_basic', 'bodyweight'],
    'full gym': ['full_gym'],
    'home gym': ['full_gym', 'home_basic'],
    'home setup': ['full_gym', 'home_basic'],
    'minimal equipment': ['full_gym', 'home_basic', 'bodyweight'],
    'bodyweight': ['full_gym', 'home_basic', 'bodyweight'],
    'bodyweight only': ['full_gym', 'home_basic', 'bodyweight']
  };

  /* Stable reason codes. Exported so tests and UI copy tables key off the
   * same constants instead of repeating string literals. */
  var REASON = {
    GOAL_MATCH: 'goal_match',
    GOAL_PARTIAL_MATCH: 'goal_partial_match',
    TRAINING_DAYS_MATCH: 'training_days_match',
    TRAINING_DAYS_CLOSE: 'training_days_close',
    EXPERIENCE_MATCH: 'experience_match',
    EQUIPMENT_MATCH: 'equipment_match',
    ONLY_OPTION: 'only_option',
    CATALOG_ORDER: 'catalog_order'
  };

  var WARNING = {
    NO_GOAL: 'missing_goal',
    NO_TRAINING_DAYS: 'missing_training_days',
    NO_TARGETS: 'missing_nutrition_targets',
    PARTIAL_TARGETS: 'partial_nutrition_targets',
    NO_CATALOG: 'no_catalog',
    NO_MATCH: 'no_catalog_match',
    EXPERIENCE_MISMATCH: 'experience_above_program_level',
    EQUIPMENT_MISMATCH: 'equipment_below_program_requirement'
  };

  var STATUS = { READY: 'ready', PARTIAL: 'partial', NEEDS_INPUT: 'needs_input' };

  /* ── primitives ─────────────────────────────────────────────────────────── */

  function num(v) {
    var n = (v == null || v === '') ? NaN : +v;
    return isFinite(n) ? n : null;
  }

  function posInt(v) {
    var n = num(v);
    if (n == null) return null;
    n = Math.round(n);
    return n >= 0 ? n : null;
  }

  // Fold catalog display text to its lookup key. Handles the en dash the
  // production catalog actually uses ("Beginner – Intermediate").
  function normText(v) {
    if (typeof v !== 'string') return null;
    var s = v.toLowerCase()
      .replace(/[\u2010-\u2015]/g, "-")   // hyphen/en/em dash family → '-'
      .replace(/\s*-\s*/g, ' - ')
      .replace(/\s+/g, ' ')
      .trim();
    return s || null;
  }

  function oneOf(value, table) {
    return (typeof value === 'string' && Object.prototype.hasOwnProperty.call(table, value))
      ? value : null;
  }

  /* ── profile reading ─────────────────────────────────────────────────────
   * Every read is defensive and NON-MUTATING. An unknown or legacy value
   * collapses to null (no signal) instead of throwing or being trusted. */

  function readProfile(profile) {
    var p = (profile && typeof profile === 'object') ? profile : {};
    return {
      name: (typeof p.full_name === 'string' && p.full_name.trim()) || null,
      goal: oneOf(p.goal, GOAL_LABELS),
      timeline: (typeof p.timeline === 'string' && p.timeline) || null,
      trainingDays: posInt(p.training_days),
      experience: oneOf(p.training_experience, EXPERIENCE_LABELS),
      gymAccess: oneOf(p.gym_access, GYM_ACCESS_LABELS),
      calories: posInt(p.target_calories),
      protein: posInt(p.protein_target),
      maintenance: posInt(p.maintenance_calories),
      fat: posInt(p.fat_target),
      carbs: posInt(p.carb_target),
      splitLabel: (typeof p.training_split === 'string' && p.training_split) || null,
      activeProgram: (typeof p.active_program === 'string' && p.active_program) || null,
      weightLbs: num(p.weight_lbs),
      goalWeightLbs: num(p.goal_weight_lbs),
      bodyFatPct: num(p.body_fat_pct),
      heightCm: num(p.height_cm),
      age: posInt(p.age),
      gender: (typeof p.gender === 'string' && p.gender) || null,
      onboardingComplete: p.onboarding_complete === true
    };
  }

  /* ── per-signal fit ──────────────────────────────────────────────────────
   * Each returns a tri-state: 1 = supported, -1 = contradicted, 0 = no signal
   * (either side unknown). 0 is never a penalty — a Program whose metadata we
   * cannot interpret must not lose to one we can merely for being legible. */

  function goalRank(userGoal, programGoal) {
    if (!userGoal || !programGoal) return 0;
    var prefs = GOAL_PREFERENCE[userGoal];
    if (!prefs) return 0;
    var i = prefs.indexOf(programGoal);
    if (i < 0) return 0;
    // Exact match (the goal is its own first preference) outranks any fallback.
    if (prefs.length === 1 || programGoal === userGoal) return GOAL_EXACT_RANK;
    return prefs.length - i;   // earlier preference ⇒ higher rank
  }

  // Absolute distance between the user's weekly training days and the
  // Program's recommendation. null when either side is unknown; nulls sort
  // AFTER every known distance so a Program that declares a schedule is
  // preferred over one that declares nothing, all else equal.
  function dayDelta(trainingDays, program) {
    if (trainingDays == null) return null;
    var rec = posInt(program.recommendedDaysPerWeek);
    if (rec == null) return null;
    return Math.abs(rec - trainingDays);
  }

  function difficultyLevels(program) {
    var key = normText(program.difficulty);
    if (!key) return null;
    return DIFFICULTY_LEVELS[key] || null;
  }

  function experienceFit(experience, program) {
    if (!experience) return 0;
    var levels = difficultyLevels(program);
    if (!levels) return 0;
    return levels.indexOf(experience) >= 0 ? 1 : -1;
  }

  function equipmentAccess(program) {
    var key = normText(program.equipmentSummary);
    if (!key) return null;
    return EQUIPMENT_ACCESS[key] || null;
  }

  function equipmentFit(gymAccess, program) {
    if (!gymAccess) return 0;
    var supported = equipmentAccess(program);
    if (!supported) return 0;
    return supported.indexOf(gymAccess) >= 0 ? 1 : -1;
  }

  /* ── ranking ─────────────────────────────────────────────────────────────
   * STRICTLY LEXICOGRAPHIC, not a weighted score. Each tier is compared only
   * when every earlier tier ties, which makes the §32 hierarchy a structural
   * guarantee rather than a matter of weight tuning: no accumulation of
   * schedule, experience and equipment agreement can ever lift a
   * goal-mismatched Program above a goal-matched one.
   *
   *   1. goal rank            desc   (exact > partial > none)
   *   2. training-day delta   asc    (nulls last)
   *   3. experience fit       desc   (suits > unknown > contradicts)
   *   4. equipment fit        desc
   *   5. catalog sort_order   asc
   *   6. slug                 asc    (total order ⇒ always deterministic)
   */
  function scoreProgram(program, ctx) {
    return {
      program: program,
      goalRank: goalRank(ctx.goal, program.goal),
      dayDelta: dayDelta(ctx.trainingDays, program),
      experienceFit: experienceFit(ctx.experience, program),
      equipmentFit: equipmentFit(ctx.gymAccess, program)
    };
  }

  function compareScored(a, b) {
    if (a.goalRank !== b.goalRank) return b.goalRank - a.goalRank;

    if (a.dayDelta !== b.dayDelta) {
      if (a.dayDelta == null) return 1;
      if (b.dayDelta == null) return -1;
      return a.dayDelta - b.dayDelta;
    }
    if (a.experienceFit !== b.experienceFit) return b.experienceFit - a.experienceFit;
    if (a.equipmentFit !== b.equipmentFit) return b.equipmentFit - a.equipmentFit;

    var ao = num(a.program.sortOrder) || 0;
    var bo = num(b.program.sortOrder) || 0;
    if (ao !== bo) return ao - bo;

    return a.program.slug < b.program.slug ? -1
      : (a.program.slug > b.program.slug ? 1 : 0);
  }

  /* Did this signal actually SEPARATE the field, or does it agree with
   * everything? A reason is only honest when it explains why THIS Program was
   * chosen over the others, so a signal every candidate satisfies earns no
   * reason code. This is what keeps "Any Setup" — true of every published
   * Program — from being advertised as an equipment match. */
  function discriminated(scored, pick, field) {
    for (var i = 0; i < scored.length; i++) {
      if (scored[i] === pick) continue;
      if (scored[i][field] !== pick[field]) return true;
    }
    return false;
  }

  // Is the pick the closest of all candidates to the user's training days?
  // A null delta is "unknown", which is never better than a known one.
  function bestOnDayDelta(scored, pick) {
    if (pick.dayDelta == null) return false;
    for (var i = 0; i < scored.length; i++) {
      var d = scored[i].dayDelta;
      if (d != null && d < pick.dayDelta) return false;
    }
    return true;
  }

  function rankPrograms(catalog, ctx) {
    var list = Array.isArray(catalog) ? catalog : [];
    var scored = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || typeof p.slug !== 'string' || !p.slug) continue;
      scored.push(scoreProgram(p, ctx));
    }
    // Comparator is a total order, so the sort is stable by construction and
    // needs no index tie-break.
    scored.sort(compareScored);
    return scored;
  }

  function buildReasons(scored, pick, ctx) {
    var reasons = [];
    if (!pick) return reasons;

    if (pick.goalRank === GOAL_EXACT_RANK) {
      reasons.push(REASON.GOAL_MATCH);
    } else if (pick.goalRank > 0) {
      reasons.push(REASON.GOAL_PARTIAL_MATCH);
    }

    if (pick.dayDelta === 0) {
      // An exact fit is worth stating on its own terms, however the rest of
      // the field looks.
      reasons.push(REASON.TRAINING_DAYS_MATCH);
    } else if (pick.dayDelta === 1 && discriminated(scored, pick, 'dayDelta')
               && bestOnDayDelta(scored, pick)) {
      // "Close to your schedule" may only be claimed when nothing else fits
      // the schedule BETTER. A goal-matched Program that won despite being
      // off-by-one, while two alternatives fit exactly, is not a schedule
      // argument — saying so would credit a signal that actually counted
      // against it.
      reasons.push(REASON.TRAINING_DAYS_CLOSE);
    }

    if (pick.experienceFit === 1 && discriminated(scored, pick, 'experienceFit')) {
      reasons.push(REASON.EXPERIENCE_MATCH);
    }
    if (pick.equipmentFit === 1 && discriminated(scored, pick, 'equipmentFit')) {
      reasons.push(REASON.EQUIPMENT_MATCH);
    }

    if (!reasons.length) {
      // Nothing about this user separated the field. Say that plainly instead
      // of dressing up catalog order as personalization.
      reasons.push(scored.length === 1 ? REASON.ONLY_OPTION : REASON.CATALOG_ORDER);
    }
    return reasons;
  }

  /* ── nutrition (read-only over persisted targets) ────────────────────────── */

  function buildNutrition(p, warnings, missing) {
    var hasCalories = p.calories != null && p.calories > 0;
    var hasProtein = p.protein != null && p.protein > 0;

    var status;
    if (hasCalories && hasProtein) status = STATUS.READY;
    else if (hasCalories || hasProtein) status = STATUS.PARTIAL;
    else status = STATUS.NEEDS_INPUT;

    if (status === STATUS.NEEDS_INPUT) {
      missing.push('target_calories');
      missing.push('protein_target');
      warnings.push(WARNING.NO_TARGETS);
    } else if (status === STATUS.PARTIAL) {
      if (!hasCalories) missing.push('target_calories');
      if (!hasProtein) missing.push('protein_target');
      warnings.push(WARNING.PARTIAL_TARGETS);
    }

    var out = {
      status: status,
      calories: hasCalories ? p.calories : null,
      protein: hasProtein ? p.protein : null,
      maintenance: p.maintenance != null && p.maintenance > 0 ? p.maintenance : null,
      // Home's default snapshot stays Calories + Protein. Carbs and fat are
      // reported because they are already stored and the onboarding reveal
      // shows them, NOT as a suggestion that Home should render them.
      carbs: p.carbs != null && p.carbs > 0 ? p.carbs : null,
      fat: p.fat != null && p.fat > 0 ? p.fat : null,
      direction: null,
      delta: null
    };

    // Deficit / surplus is arithmetic over two ALREADY-PERSISTED numbers, not
    // a recalculation: it restates the relationship the writing flow computed.
    if (out.calories != null && out.maintenance != null) {
      var d = out.calories - out.maintenance;
      out.delta = Math.abs(d);
      out.direction = d < 0 ? 'deficit' : (d > 0 ? 'surplus' : 'maintenance');
    }
    return out;
  }

  /* ── training ────────────────────────────────────────────────────────────── */

  function publicProgram(program, accessibleSlugs) {
    var accessible = null;
    if (Array.isArray(accessibleSlugs)) {
      accessible = accessibleSlugs.indexOf(program.slug) >= 0;
    }
    return {
      slug: program.slug,
      name: program.name || program.slug,
      goal: program.goal || null,
      difficulty: program.difficulty || null,
      durationWeeks: program.durationWeeks != null ? program.durationWeeks : null,
      recommendedDaysPerWeek: program.recommendedDaysPerWeek != null
        ? program.recommendedDaysPerWeek : null,
      equipmentSummary: program.equipmentSummary || null,
      pagePath: program.pagePath || null,
      // Observation only. Ranking never saw this, and a false value is not a
      // reason to prefer anything else — the best fit is still the best fit.
      accessible: accessible
    };
  }

  function buildTraining(p, catalog, accessibleSlugs, warnings, missing) {
    var out = {
      status: STATUS.NEEDS_INPUT,
      trainingDays: p.trainingDays,
      splitLabel: p.splitLabel,
      experience: p.experience,
      gymAccess: p.gymAccess,
      activeProgram: p.activeProgram,
      recommendedProgram: null,
      reasons: [],
      alternatives: []
    };

    if (p.trainingDays == null) {
      missing.push('training_days');
      warnings.push(WARNING.NO_TRAINING_DAYS);
    }

    var list = Array.isArray(catalog) ? catalog : [];
    if (!list.length) {
      // A catalog that failed to load is NOT the same as a user with no goal.
      // Nutrition personalization stands on its own and the page still works.
      warnings.push(WARNING.NO_CATALOG);
      out.status = STATUS.PARTIAL;
      return out;
    }

    var scored = rankPrograms(list, p);
    if (!scored.length) {
      warnings.push(WARNING.NO_MATCH);
      out.status = STATUS.PARTIAL;
      return out;
    }

    var pick = scored[0];
    out.recommendedProgram = publicProgram(pick.program, accessibleSlugs);
    out.reasons = buildReasons(scored, pick, p);
    out.alternatives = scored.slice(1).map(function (s) {
      return publicProgram(s.program, accessibleSlugs);
    });

    // An honest caveat, not a rejection: the Program is still the best fit,
    // and the user is told what it does not cover.
    if (pick.experienceFit === -1) warnings.push(WARNING.EXPERIENCE_MISMATCH);
    if (pick.equipmentFit === -1) warnings.push(WARNING.EQUIPMENT_MISMATCH);

    // 'ready' requires a real goal signal. Ranking the catalog by schedule
    // alone produces an ORDER, not a personalized recommendation.
    out.status = pick.goalRank > 0 ? STATUS.READY : STATUS.PARTIAL;
    return out;
  }

  /* ── focus ───────────────────────────────────────────────────────────────
   * ONE next priority, from profile evidence only. It deliberately knows
   * nothing about workouts logged or food logged — Home's Coach Insight
   * (dashboard-model.js buildFocus) already owns behavioural nudges from the
   * snapshot, and duplicating that here would create two voices disagreeing.
   * This answers the narrower question: what is missing from the SETUP?
   * Returns null when the setup is complete, so nothing is filled in. */
  function buildFocus(p, nutrition, training) {
    if (!p.goal) {
      return { id: 'set_goal', field: 'goal' };
    }
    if (nutrition.status !== STATUS.READY) {
      return { id: 'set_targets', field: 'target_calories' };
    }
    if (p.trainingDays == null) {
      return { id: 'set_training_days', field: 'training_days' };
    }
    if (p.trainingDays === 0) {
      return { id: 'start_training', field: 'training_days' };
    }
    if (training.recommendedProgram && !p.activeProgram) {
      return { id: 'choose_program', field: 'active_program',
        slug: training.recommendedProgram.slug };
    }
    return null;
  }

  /* ── the entry point ─────────────────────────────────────────────────────
   * PURE. Mutates neither `profile` nor `context.catalog`, performs no I/O,
   * and depends on no clock or random source.
   *
   *   profile  — a public.profiles row (or null/partial)
   *   context  — { catalog: normalized program-catalog rows,
   *                accessibleSlugs: string[] | undefined }
   *
   * `accessibleSlugs` is optional on purpose: omitting it yields
   * `accessible: null` ("not evaluated"), which is honest, whereas defaulting
   * to [] would assert the user can open nothing.
   */
  function derivePersonalizedStart(profile, context) {
    var ctx = (context && typeof context === 'object') ? context : {};
    var p = readProfile(profile);
    var warnings = [];
    var missing = [];

    if (!p.goal) {
      missing.push('goal');
      warnings.push(WARNING.NO_GOAL);
    }

    var nutrition = buildNutrition(p, warnings, missing);
    var training = buildTraining(p, ctx.catalog, ctx.accessibleSlugs, warnings, missing);

    // Overall status is the WEAKEST part: a plan is only as ready as its
    // least-ready half, and a missing goal caps it regardless.
    var status;
    if (!p.goal) {
      status = nutrition.status === STATUS.NEEDS_INPUT ? STATUS.NEEDS_INPUT : STATUS.PARTIAL;
    } else if (nutrition.status === STATUS.READY && training.status === STATUS.READY) {
      status = STATUS.READY;
    } else if (nutrition.status === STATUS.NEEDS_INPUT && training.status !== STATUS.READY) {
      status = STATUS.NEEDS_INPUT;
    } else {
      status = STATUS.PARTIAL;
    }

    return {
      version: PLAN_VERSION,
      status: status,
      name: p.name,
      goal: p.goal ? { key: p.goal, label: GOAL_LABELS[p.goal] } : null,
      nutrition: nutrition,
      training: training,
      focus: buildFocus(p, nutrition, training),
      warnings: warnings,
      missing: missing
    };
  }

  /* ── 4.3.7F · Personal Context Layer ─────────────────────────────────────
   * The normalized view of explicit, CURRENT user facts plus the plan derived
   * from them — the shape Coach (4.4.3) will read.
   *
   * A read model, not a store. It holds no opinions, no history and no
   * inference: every field is either something the user stated or something a
   * documented flow computed and persisted. Unknown is always null, never a
   * default, so a consumer can always tell "the user said X" apart from "we
   * don't know". Because it is derived on every call, it cannot go stale. */
  function buildPersonalContext(profile, context) {
    var p = readProfile(profile);
    var plan = derivePersonalizedStart(profile, context);
    return {
      version: PLAN_VERSION,
      onboardingComplete: p.onboardingComplete,
      identity: { name: p.name, age: p.age, gender: p.gender },
      body: {
        heightCm: p.heightCm,
        weightLbs: p.weightLbs,
        bodyFatPct: p.bodyFatPct,
        goalWeightLbs: p.goalWeightLbs
      },
      goal: plan.goal,
      timeline: p.timeline,
      targets: {
        calories: plan.nutrition.calories,
        protein: plan.nutrition.protein,
        carbs: plan.nutrition.carbs,
        fat: plan.nutrition.fat,
        maintenance: plan.nutrition.maintenance
      },
      training: {
        daysPerWeek: p.trainingDays,
        experience: p.experience,
        gymAccess: p.gymAccess,
        split: p.splitLabel,
        activeProgram: p.activeProgram,
        recommendedProgram: plan.training.recommendedProgram
          ? plan.training.recommendedProgram.slug : null
      },
      status: plan.status,
      missing: plan.missing.slice()
    };
  }

  /* ── PRESENTATION ────────────────────────────────────────────────────────
   * A static LOOKUP TABLE with at most one numeric substitution — not
   * generated prose, and not composed by any ranking code path. It lives here
   * so the three surfaces that explain a recommendation (onboarding reveal,
   * Home, Train) say the same words for the same code.
   *
   * Wording follows CLAUDE.md §13 and the phase's §35: practical, bound to
   * evidence the engine actually has. No "perfect for you", no "optimal", no
   * "AI picked this" — nothing here is AI, and every claim is one the reason
   * code has already earned. */
  var REASON_COPY = {
    goal_match: 'Matches your goal',
    goal_partial_match: 'Closest match for your goal',
    training_days_match: 'Fits your {days}-day schedule',
    training_days_close: 'Close to your {days}-day schedule',
    experience_match: 'Suits your experience level',
    equipment_match: 'Works with your setup',
    only_option: 'The program available today',
    catalog_order: 'A good place to start'
  };

  // Short phrases for a plan's reason codes, in the engine's own order.
  // Unknown codes are dropped rather than rendered raw, so a code added to the
  // engine before its copy can never leak an identifier into the UI.
  function describeReasons(plan) {
    var training = (plan && plan.training) || {};
    var codes = Array.isArray(training.reasons) ? training.reasons : [];
    var days = training.trainingDays;
    var out = [];
    for (var i = 0; i < codes.length; i++) {
      var copy = REASON_COPY[codes[i]];
      if (!copy) continue;
      if (copy.indexOf('{days}') >= 0) {
        if (days == null) continue;   // never render a blank where a number belongs
        copy = copy.replace('{days}', String(days));
      }
      out.push(copy);
    }
    return out;
  }

  var Personalization = {
    PLAN_VERSION: PLAN_VERSION,
    REASON_COPY: REASON_COPY,
    describeReasons: describeReasons,
    STATUS: STATUS,
    REASON: REASON,
    WARNING: WARNING,
    GOAL_LABELS: GOAL_LABELS,
    EXPERIENCE_LABELS: EXPERIENCE_LABELS,
    GYM_ACCESS_LABELS: GYM_ACCESS_LABELS,
    GOAL_PREFERENCE: GOAL_PREFERENCE,
    DIFFICULTY_LEVELS: DIFFICULTY_LEVELS,
    EQUIPMENT_ACCESS: EQUIPMENT_ACCESS,
    derivePersonalizedStart: derivePersonalizedStart,
    buildPersonalContext: buildPersonalContext,
    // Exposed for tests and diagnostics; surfaces use the two builders above.
    rankPrograms: rankPrograms,
    goalRank: goalRank,
    experienceFit: experienceFit,
    equipmentFit: equipmentFit
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Personalization;
  root.Personalization = Personalization;
})(typeof window !== 'undefined' ? window : this);
