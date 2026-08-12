/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Dashboard View-Model  ·  Phase 4.3.4 (CP3)
 *
 * The PURE presentation layer for Home. It consumes shared domain state
 * (snapshot.js) plus the small amount of program/session state that only the
 * dashboard resolves, and returns presentation-ready sections.
 *
 * It owns NO fetching, NO Supabase, NO DOM, and NO fitness intelligence of its
 * own: every number it presents is already computed by a shared module. Its job
 * is PRIORITY and FALLBACK — deciding what the user should see first and what
 * to say when evidence is missing.
 *
 * Hard rule: this module never fabricates data. When evidence is absent a
 * section reports `hasData: false` (or the focus surface returns null) so the
 * page can render an honest empty state instead of filler.
 *
 * Browser: global `DashboardModel`.  Node: guarded module.exports.
 * ──────────────────────────────────────────────────────────────────────── */

(function (global) {
  'use strict';

  function num(v) {
    var n = (v == null || v === '') ? NaN : +v;
    return isFinite(n) ? n : null;
  }
  function round1(n) { return Math.round(n * 10) / 10; }

  /* ── A · TODAY ──────────────────────────────────────────────────────────
   * One dominant action, resolved by strict priority. An unfinished session
   * always wins: it must never become an invisible orphan. */
  function buildToday(input) {
    var program = input.program || null;
    var snap = input.snapshot || null;
    var training = (snap && snap.training) || {};

    if (input.inProgressWorkout) {
      return {
        state: 'resume',
        title: input.inProgressWorkout.name || 'Workout',
        status: 'In progress',
        cta: { label: 'Resume Workout', href: 'workout.html' },
        secondary: { label: 'Discard', action: 'discard' },
      };
    }

    if (training.trainedToday === true) {
      return {
        state: 'done',
        title: (training.lastWorkout && training.lastWorkout.name) || 'Workout',
        status: 'Complete',
        cta: null,
        secondary: { label: 'Train again', href: 'workout.html' },
      };
    }

    if (program && program.sessionLabel && program.href) {
      return {
        state: 'start',
        title: program.sessionLabel,
        status: program.name || null,
        cta: { label: 'Start Workout', href: program.href },
        // "a different workout" because a specific session IS already proposed
        // above it — the label names the alternative to that, not a first
        // choice. Same destination and behaviour as before.
        secondary: { label: 'Choose a different workout', href: 'workout.html' },
      };
    }

    // Owns programs but none is active yet — the choice is the action.
    if (program && program.needsSelection) {
      return {
        state: 'choose',
        title: 'Choose your program',
        status: null,
        cta: { label: 'Choose Program', href: 'profile.html#programs' },
        secondary: { label: 'Choose workout', href: 'workout.html' },
      };
    }

    // No program at all. Training is still possible — never dead-end into a
    // store link as the only option.
    return {
      state: 'open',
      title: 'Ready to train',
      status: null,
      cta: { label: 'Start Workout', href: 'workout.html' },
      secondary: null,
    };
  }

  /* ── B · THIS WEEK ──────────────────────────────────────────────────────
   * completed / planned over the Monday–Sunday CALENDAR week, plus the seven
   * day states the strip renders. Both read the SAME snapshot.training.week
   * structure, so the strip and the metric can never disagree.
   *
   * Falls back to the legacy rolling-7-day fields when a caller supplies an
   * older snapshot; `planned` stays null when the user has declared no training
   * frequency, so we show the count alone rather than invent a target. */
  function buildWeek(input) {
    var snap = input.snapshot || null;
    var training = (snap && snap.training) || {};
    var week = training.week || null;

    var completed = week ? num(week.completed) : num(training.thisWeekCount);
    var planned = week
      ? num(week.planned)
      : (training.weekAdherence && num(training.weekAdherence.planned));

    if (completed == null) {
      return { hasData: false, completed: null, planned: null, pct: 0, label: null,
        complete: false, days: [] };
    }
    var complete = planned != null && completed >= planned;
    return {
      hasData: true,
      completed: completed,
      planned: planned,
      pct: planned ? Math.min(100, Math.round((completed / planned) * 100)) : 0,
      label: planned != null
        ? completed + ' / ' + planned + ' workouts'
        : completed + (completed === 1 ? ' workout' : ' workouts'),
      complete: complete,
      streak: num(training.streak) || 0,
      // Seven day cells for .mm-daystrip. Empty when the snapshot predates the
      // calendar-week field — the strip simply does not render.
      days: week && Array.isArray(week.days) ? week.days : [],
      start: week ? week.start : null,
      end: week ? week.end : null,
    };
  }

  /* ── C · NUTRITION ──────────────────────────────────────────────────────
   * Calories remaining is the headline; protein is the one macro that earns a
   * place on Home. Without a calorie target we show consumed totals and say so
   * rather than computing a meaningless "left". */
  function buildNutrition(input) {
    var snap = input.snapshot || null;
    var profile = input.profile || {};
    var today = (snap && snap.nutrition && snap.nutrition.today) || null;

    var calTarget = num(profile.target_calories);
    var proTarget = num(profile.protein_target);
    var consumed = today ? (num(today.calories) || 0) : null;
    var protein = today ? (num(today.protein) || 0) : null;

    if (consumed == null) {
      return { hasData: false, logged: false, hasTargets: !!calTarget };
    }

    var logged = consumed > 0 || (protein || 0) > 0;
    var out = {
      hasData: true,
      logged: logged,
      hasTargets: !!calTarget,
      consumed: Math.round(consumed),
      target: calTarget,
      protein: {
        consumed: Math.round(protein || 0),
        target: proTarget,
        pct: proTarget ? Math.min(100, Math.round(((protein || 0) / proTarget) * 100)) : 0,
        behind: proTarget ? (protein || 0) < proTarget : false,
      },
      href: 'nutrition.html',
    };
    if (calTarget) {
      var left = Math.round(calTarget - consumed);
      out.left = Math.abs(left);
      out.over = left < 0;
      out.pct = Math.min(100, Math.round((consumed / calTarget) * 100));
    }
    return out;
  }

  /* ── D · FOCUS (the permanent Coach seat) ───────────────────────────────
   * ONE short, evidence-backed line — or null. Deterministic and derived only
   * from shared snapshot state; it is never presented as AI reasoning, and it
   * never speculates. Rules are ordered by usefulness; the first that has real
   * evidence wins. When nothing qualifies the surface renders nothing.
   *
   * `hourOfDay` is injected rather than read from the clock so the surface is
   * deterministic and testable. */
  function buildFocus(input) {
    var snap = input.snapshot || null;
    if (!snap) return null;
    var hour = num(input.hourOfDay);
    var training = snap.training || {};
    var nutrition = snap.nutrition || {};
    var week = buildWeek(input);
    var nut = buildNutrition(input);

    // An insight that points at a screen the user can act on carries a small
    // action. Purely routing — it adds no claim the evidence does not support.
    var seeNutrition = { label: 'View nutrition', href: 'nutrition.html' };

    // 1. Protein clearly behind, late enough in the day to be actionable.
    if (hour != null && hour >= 15 && nut.hasData && nut.protein &&
        nut.protein.target && nut.protein.consumed < nut.protein.target * 0.6) {
      return { text: 'Protein is behind today.', tone: 'behind', id: 'protein-behind',
        action: seeNutrition };
    }

    // 2. Over the calorie target. The ONLY insight carrying a semantic
    // severity: exceeding a target the user set is genuinely a warning state.
    // Every other insight is a routine nudge and must render in the theme
    // accent, not as an error.
    if (nut.hasData && nut.hasTargets && nut.over) {
      return { text: 'You\'re over calories today.', tone: 'behind', id: 'calories-over',
        severity: 'warning', action: seeNutrition };
    }

    // 3. Weekly training target met.
    if (week.hasData && week.complete && week.planned) {
      return { text: 'Weekly training goal complete.', tone: 'good', id: 'week-complete' };
    }

    // 4. A streak worth protecting.
    if (num(training.streak) != null && training.streak >= 3) {
      return { text: training.streak + '-day streak.', tone: 'good', id: 'streak' };
    }

    // 5. Behind the weekly target — express it as WORKOUTS remaining.
    // Deliberately not "days left": the product tracks a weekly training COUNT,
    // never a per-weekday plan, so counting down calendar days would imply the
    // user is expected to train on every remaining day and would contradict the
    // neutral-day model. Workouts remaining is exactly the target's own unit.
    if (week.hasData && week.planned) {
      var remaining = week.planned - week.completed;
      if (remaining > 0) {
        return {
          text: remaining + ' workout' + (remaining === 1 ? '' : 's') +
            ' to hit your weekly goal.',
          tone: 'neutral', id: 'week-remaining',
        };
      }
    }

    // 6. Tracking has lapsed (only when we have a real weekly figure).
    var daysLogged = num(nutrition.week && nutrition.week.daysLogged);
    if (daysLogged != null && daysLogged > 0 && daysLogged <= 2) {
      return { text: 'Food logged ' + daysLogged + ' of 7 days.', tone: 'behind',
        id: 'logging-lapsed', action: seeNutrition };
    }

    // 7. Nothing logged today, late in the day.
    if (hour != null && hour >= 18 && nut.hasData && !nut.logged) {
      return { text: 'No food logged today.', tone: 'behind', id: 'no-food',
        action: seeNutrition };
    }

    // No evidence-backed insight — say nothing rather than fill the space.
    return null;
  }

  /* ── E · PROGRESS ───────────────────────────────────────────────────────
   * Only metrics the product actually has reliable shared data for: scale
   * weight and its 30-day change, plus body fat when it has been logged.
   * Steps / water / sleep are NOT modelled — there is no shared source. */

  // Whole days between two YYYY-MM-DD strings. UTC on both sides, so the
  // difference is unaffected by the local timezone; these are date-only values
  // and only their span is ever used.
  function daysBetween(a, b) {
    var pa = String(a).split('-'), pb = String(b).split('-');
    var ta = Date.UTC(+pa[0], (+pa[1]) - 1, +pa[2]);
    var tb = Date.UTC(+pb[0], (+pb[1]) - 1, +pb[2]);
    if (!isFinite(ta) || !isFinite(tb)) return null;
    return Math.round((tb - ta) / 86400000);
  }

  // ── HOME SPARKLINE PRESENTATION THRESHOLD ─────────────────────────────
  //
  // NEW POLICY, and deliberately scoped: these two numbers decide ONLY whether
  // Home draws a sparkline. They are NOT a weight-domain semantic. They do not
  // exist in weight.js, they take no part in change30, and nothing on the
  // Progress page or in weight history consults them — that surface renders the
  // full chart under its own rules and is untouched by this file.
  //
  // Why a gate at all: a sparkline is a claim about a SHAPE, which needs more
  // evidence than a number does. Two weigh-ins establish a factual delta and
  // describe no trend; three logged on three consecutive days inside a 30-day
  // window would draw a line whose horizontal extent implies a month of history
  // that was never recorded.
  //
  // Why 7 days specifically — a judgement call, not an inherited rule:
  //   · Scale weight swings by a pound or more day to day on water, food and
  //     glycogen alone, so a span under a week plots mostly noise as if it were
  //     direction. A week is the shortest span where the line is more signal
  //     than fluctuation.
  //   · It is the least restrictive gate that still admits a genuinely new
  //     user: three weigh-ins across one week earns a sparkline, so the
  //     visualisation is not reserved for long-established accounts.
  //   · Corroboration only, NOT authority: wlStats already averages weight over
  //     a trailing 7 days (avg7) precisely because single days are noisy, so a
  //     week is an interval the product already treats as the point where
  //     weight becomes readable. That makes 7 a defensible choice here; it does
  //     not make it a pre-existing product rule for sparklines, and there was
  //     none to inherit.
  //
  // Changing either value changes what Home DRAWS and nothing else.
  var HOME_SPARK_MIN_POINTS = 3;
  var HOME_SPARK_MIN_SPAN_DAYS = 7;

  function sparklineSeries(recent) {
    var pts = Array.isArray(recent) ? recent : [];
    if (pts.length < HOME_SPARK_MIN_POINTS) return null;
    var span = daysBetween(pts[0].logged_on, pts[pts.length - 1].logged_on);
    if (span == null || span < HOME_SPARK_MIN_SPAN_DAYS) return null;
    return pts;
  }

  function buildProgress(input) {
    var snap = input.snapshot || null;
    var weight = (snap && snap.weight) || null;
    if (!weight || num(weight.current) == null) {
      return { hasData: false, entries: 0, series: null, href: 'weight-history.html' };
    }
    var change = num(weight.change30);
    var bf = (snap && snap.bodyFat) || null;
    return {
      hasData: true,
      current: round1(num(weight.current)),
      unit: 'lb',
      // Real weigh-ins on record. A profile weight with no logged history
      // still reports 0 — it is a starting value, not a measurement series.
      entries: num(weight.count) || 0,
      change30: change != null ? round1(change) : null,
      direction: change == null ? null : (change < 0 ? 'down' : change > 0 ? 'up' : 'flat'),
      // Present ONLY when a sparkline would be honest; null is the instruction
      // not to draw one, so the page needs no policy of its own.
      series: sparklineSeries(weight.recent),
      goal: num(weight.goal),
      bodyFat: (bf && num(bf.current) != null && bf.count > 0) ? round1(num(bf.current)) : null,
      href: 'weight-history.html',
    };
  }

  /* ── Assembly ───────────────────────────────────────────────────────────── */
  function buildDashboardModel(input) {
    input = input || {};
    return {
      today: buildToday(input),
      week: buildWeek(input),
      nutrition: buildNutrition(input),
      focus: buildFocus(input),
      progress: buildProgress(input),
    };
  }

  var DashboardModel = {
    buildDashboardModel: buildDashboardModel,
    buildToday: buildToday,
    buildWeek: buildWeek,
    buildNutrition: buildNutrition,
    buildFocus: buildFocus,
    buildProgress: buildProgress,
    // Home presentation thresholds — exposed so tests can pin that they gate
    // the DRAWING and nothing else. Not a weight-domain semantic.
    HOME_SPARK_MIN_POINTS: HOME_SPARK_MIN_POINTS,
    HOME_SPARK_MIN_SPAN_DAYS: HOME_SPARK_MIN_SPAN_DAYS,
  };

  if (global) global.DashboardModel = DashboardModel;
  if (typeof module !== 'undefined' && module.exports) module.exports = DashboardModel;
})(typeof globalThis !== 'undefined' ? globalThis : this);
