/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — User Snapshot Layer  ·  Phase 4.1
 *
 * One call that assembles the user's current state: targets, weight trend,
 * body composition, nutrition compliance, and training momentum. This object
 * is the CONTRACT for the AI Coach (Phase 4.3) — the server-side coach route
 * will require() the pure parts of this file and feed the same shape into
 * every conversation, so anything added here becomes coach context for free.
 *
 * Browser: load AFTER weight.js and metrics.js (uses their stats helpers +
 * supabaseClient). It does NOT depend on nutrition.js — food_logs are read
 * directly here, which is why Home can consume nutrition state without loading
 * the food-resolution stack. Node: require()s the sibling libraries.
 * Pure computation (snComputeSnapshot + helpers) is separated from fetching
 * (buildUserSnapshot) so both runtimes share identical math.
 * ──────────────────────────────────────────────────────────────────────── */

/* In Node (AI-coach route / offline tests), pull the shared helpers from the
   sibling libraries; in the browser they are already globals via script order. */
if (typeof module !== 'undefined' && typeof wlStats === 'undefined') {
  var _wl = require('./weight.js');
  var wlToday = _wl.wlToday, wlParseDate = _wl.wlParseDate,
      wlRound1 = _wl.wlRound1, wlStats = _wl.wlStats;
  var _mx = require('./metrics.js');
  var bfStats = _mx.bfStats, msStats = _mx.msStats;
}

/* ── training momentum (moved VERBATIM from app.html — one home for streak
      logic; app.html's loadStreak keeps calling these by the same names) ── */
function dashIso(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
// Consecutive-day streak; counts from today, or yesterday if today isn't logged
// yet (so a not-yet-trained today doesn't reset the streak).
function dashDayStreak(dateSet) {
  var cursor = new Date(); cursor.setHours(0, 0, 0, 0);
  if (!dateSet.has(dashIso(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!dateSet.has(dashIso(cursor))) return 0;
  }
  var streak = 0;
  while (dateSet.has(dashIso(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}
function dashThisWeekCount(dates) {
  var now = new Date(); now.setHours(0, 0, 0, 0);
  var weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 6); // last 7 days incl today
  return dates.filter(function (ds) {
    var p = String(ds).split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return d >= weekAgo && d <= now;
  }).length;
}

/* ── weekly training target (pure) ──────────────────────────────────────────
 * How many sessions the user INTENDS per week, from the global
 * profiles.training_days setting. Domain state, not presentation: the coach,
 * reminders, the Train surface and the dashboard all need the same answer.
 *
 * Deliberately NOT schedules.js's normalizeTrainingDays(), which buckets any
 * value into 2–6 to pick a SCHEDULE. Adherence must never invent a target:
 * "0 — not training yet" or an unset value returns null, and callers show the
 * completed count alone rather than a fabricated denominator. */
function snPlannedPerWeek(trainingDays) {
  var d = parseInt(trainingDays, 10);
  if (!isFinite(d) || d < 1) return null;
  return d > 7 ? 7 : d;
}

// completed vs planned over the same rolling 7-day window dashThisWeekCount
// uses. `ratio` is null when there is no declared target.
function snWeekAdherence(completed, trainingDays) {
  var planned = snPlannedPerWeek(trainingDays);
  var done = parseInt(completed, 10);
  if (!isFinite(done) || done < 0) done = 0;
  return {
    planned: planned,
    completed: done,
    ratio: planned ? Math.round((done / planned) * 100) / 100 : null,
    met: planned ? done >= planned : null,
  };
}

/* ── calendar week (pure) ───────────────────────────────────────────────────
 * The Monday–Sunday week containing `today`. This is the ONE definition that
 * powers both the day strip and the completed/target metric — they must never
 * disagree, which is why both read the same structure.
 *
 * Deliberately distinct from dashThisWeekCount(), which is a ROLLING 7-day
 * window and stays untouched for backward compatibility. New consumers should
 * use training.week; the rolling figures remain for existing ones.
 *
 * Honest state vocabulary only: a day is completed, today, or neither. The
 * product stores a weekly training COUNT (profiles.training_days), never a
 * per-weekday plan, so there is no "scheduled" state to derive and inventing
 * one would fabricate data. */
function snWeekStart(todayIso) {
  var d = wlParseDate(todayIso);
  // getDay(): 0=Sun … 6=Sat. Shift so Monday is the first day of the week.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

var SN_DAY_LABELS   = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
var SN_DAY_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// workoutDates: ISO date strings of COMPLETED workouts (duplicates tolerated —
// a day counts once, matching a target expressed in training DAYS per week).
function snCalendarWeek(workoutDates, todayIso, trainingDays) {
  var today = todayIso || wlToday();
  var start = snWeekStart(today);

  var done = {};
  (workoutDates || []).forEach(function (d) { if (d) done[String(d)] = true; });

  var days = [];
  var completed = 0;
  for (var i = 0; i < 7; i++) {
    var d = new Date(start.getTime());
    d.setDate(start.getDate() + i);          // rolls across month/year ends
    var iso = dashIso(d);
    var isDone = done[iso] === true;
    if (isDone) completed++;
    days.push({
      date: iso,
      label: SN_DAY_LABELS[i],
      weekday: SN_DAY_WEEKDAYS[i],
      completed: isDone,
      isToday: iso === today,
      isFuture: iso > today,
    });
  }

  var planned = snPlannedPerWeek(trainingDays);
  return {
    start: days[0].date,
    end: days[6].date,
    days: days,
    completed: completed,
    planned: planned,
    ratio: planned ? Math.round((completed / planned) * 100) / 100 : null,
    met: planned ? completed >= planned : null,
  };
}

/* ── nutrition compliance (pure) ───────────────────────────────────────── */
// rows: food_logs rows (date, calories, protein, carbs, fat) covering the last
// 7 days INCLUDING today. Averages are over days that logged anything — the
// coach cares about "how consistent, and what did consistent days look like".
function snWeekNutrition(rows, today) {
  var byDay = {};
  (rows || []).forEach(function (r) {
    var d = r.date;
    if (!byDay[d]) byDay[d] = { calories: 0, protein: 0, carbs: 0, fat: 0 };
    byDay[d].calories += +r.calories || 0;
    byDay[d].protein  += +r.protein  || 0;
    byDay[d].carbs    += +r.carbs    || 0;
    byDay[d].fat      += +r.fat      || 0;
  });
  var days = Object.keys(byDay);
  var todayTotals = byDay[today] || { calories: 0, protein: 0, carbs: 0, fat: 0 };
  if (!days.length) {
    return { daysLogged: 0, avgCalories: null, avgProtein: null, today: todayTotals };
  }
  var sum = days.reduce(function (s, d) {
    s.calories += byDay[d].calories; s.protein += byDay[d].protein; return s;
  }, { calories: 0, protein: 0 });
  return {
    daysLogged: days.length,
    avgCalories: Math.round(sum.calories / days.length),
    avgProtein:  Math.round(sum.protein  / days.length),
    today: todayTotals,
  };
}

/* ── pure assembly: all inputs in, snapshot out (Node-testable, no I/O) ─── */
// inputs: { profile, weightLogs, bfLogs, msLogs, foodRows, workouts, today }
//   workouts: completed rows { date, name, created_at, duration_minutes } desc.
function snComputeSnapshot(inputs) {
  var p = inputs.profile || {};
  var today = inputs.today || wlToday();

  var weight = wlStats(inputs.weightLogs || [], p.weight_lbs);
  var goalW = p.goal_weight_lbs != null ? +p.goal_weight_lbs : null;
  weight.goal = goalW;
  weight.toGoal = (goalW != null && weight.current != null)
    ? wlRound1(weight.current - goalW) : null;

  var workouts = inputs.workouts || [];
  var dates = [];
  var seen = {};
  workouts.forEach(function (w) {
    if (w.date && !seen[w.date]) { seen[w.date] = true; dates.push(w.date); }
  });
  var last = workouts[0] || null;

  var week = snWeekNutrition(inputs.foodRows, today);
  var thisWeekCount = dashThisWeekCount(dates);

  return {
    generatedAt: new Date().toISOString(),
    profile: {
      goal: p.goal || null,
      target_calories: p.target_calories != null ? +p.target_calories : null,
      protein_target:  p.protein_target  != null ? +p.protein_target  : null,
      carb_target:     p.carb_target     != null ? +p.carb_target     : null,
      fat_target:      p.fat_target      != null ? +p.fat_target      : null,
      weight_lbs:      p.weight_lbs      != null ? +p.weight_lbs      : null,
      goal_weight_lbs: goalW,
      body_fat_pct:    p.body_fat_pct    != null ? +p.body_fat_pct    : null,
      training_days:   p.training_days   != null ? +p.training_days   : null,
    },
    weight: weight,                                   // + goal / toGoal above
    bodyFat: bfStats(inputs.bfLogs || [], p.body_fat_pct),
    waist:   msStats(inputs.msLogs || [], 'waist_in'),
    nutrition: {
      today: week.today,
      week: { daysLogged: week.daysLogged, avgCalories: week.avgCalories, avgProtein: week.avgProtein },
    },
    training: {
      trainedToday: seen[today] === true,
      streak: dashDayStreak(new Set(dates)),
      // Rolling 7-day figures — PRESERVED for existing consumers.
      thisWeekCount: thisWeekCount,
      weekAdherence: snWeekAdherence(thisWeekCount, p.training_days),
      // Calendar Monday–Sunday week — the definition new surfaces should use.
      week: snCalendarWeek(dates, today, p.training_days),
      lastWorkout: last ? { name: last.name || 'Workout', date: last.date } : null,
    },
  };
}

/* ── browser fetch + assemble ──────────────────────────────────────────── */
// opts.profile: pass the already-loaded profile (dashboard has currentProfile)
// to skip one query. All fetches run in parallel; each failure degrades to
// empty data rather than sinking the whole snapshot.
async function buildUserSnapshot(userId, opts) {
  opts = opts || {};
  var today = wlToday();
  var weekAgo = (function () {
    var d = wlParseDate(today); d.setDate(d.getDate() - 6);
    return dashIso(d);
  })();

  // await-based so any thenable (incl. Supabase's query builder) works.
  async function safe(promise, fallback) {
    try {
      var res = await promise;
      return res.error ? fallback : (res.data || fallback);
    } catch (e) {
      return fallback;
    }
  }

  var results = await Promise.all([
    opts.profile
      ? Promise.resolve(opts.profile)
      : safe(supabaseClient.from('profiles').select('*').eq('id', userId).single(), {}),
    wlFetchLogs(userId, 60),
    bfFetchLogs(userId, 60),
    msFetchLogs(userId, 90),
    safe(supabaseClient.from('food_logs')
      .select('date, calories, protein, carbs, fat')
      .eq('user_id', userId).gte('date', weekAgo).lte('date', today), []),
    safe(supabaseClient.from('workouts')
      .select('date, name, created_at, duration_minutes')
      .eq('user_id', userId).eq('completed', true)
      .order('date', { ascending: false }).limit(180), []),
  ]);

  return snComputeSnapshot({
    profile: results[0], weightLogs: results[1], bfLogs: results[2],
    msLogs: results[3], foodRows: results[4], workouts: results[5],
    today: today,
  });
}

/* Node: export the PURE parts only (no fetchers — the coach route brings its
   own data access). Guarded so browsers never see `module`. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    dashIso: dashIso,
    dashDayStreak: dashDayStreak,
    dashThisWeekCount: dashThisWeekCount,
    snWeekNutrition: snWeekNutrition,
    snPlannedPerWeek: snPlannedPerWeek,
    snWeekAdherence: snWeekAdherence,
    snWeekStart: snWeekStart,
    snCalendarWeek: snCalendarWeek,
    snComputeSnapshot: snComputeSnapshot,
  };
}
