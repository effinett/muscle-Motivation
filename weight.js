/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Weight Tracking (shared logic)
 *
 * One source of truth for body-weight queries, stats, the SVG trend chart and
 * the shared Log/Edit Weight modal. Used by app.html (dashboard) and
 * weight-history.html. No external dependencies.
 *
 * Storage: public.body_weight_logs — one row per (user_id, logged_on).
 * Weight is stored and displayed in LBS to match the rest of the app.
 * ──────────────────────────────────────────────────────────────────────── */

/* ── small helpers ─────────────────────────────────────────────────────── */
function wlEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// Local-time YYYY-MM-DD (avoids UTC off-by-one from toISOString()).
function wlToday() {
  var d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Parse a date-only string into a LOCAL Date (no timezone shift).
function wlParseDate(dateStr) {
  var p = String(dateStr).split('-');
  return new Date(+p[0], (+p[1]) - 1, +p[2]);
}

function wlFmtDate(dateStr) {
  return wlParseDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function wlFmtDateLong(dateStr) {
  return wlParseDate(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function wlRound1(n) { return Math.round(n * 10) / 10; }
function wlFmtWeight(n) { return wlRound1(+n) + ' lbs'; }

/* ── data access (exact Supabase queries) ──────────────────────────────── */
async function wlFetchLogs(userId, limit) {
  try {
    var q = supabaseClient
      .from('body_weight_logs')
      .select('id, weight_lbs, logged_on, note')
      .eq('user_id', userId)
      .order('logged_on', { ascending: false });
    if (limit) q = q.limit(limit);
    var res = await q;
    if (res.error) throw res.error;
    return res.data || [];
  } catch (e) {
    console.error('wlFetchLogs error:', e);
    return [];
  }
}

async function wlUpsert(userId, weightLbs, loggedOn, note) {
  return await supabaseClient
    .from('body_weight_logs')
    .upsert(
      {
        user_id: userId,
        weight_lbs: weightLbs,
        logged_on: loggedOn,
        note: note || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,logged_on' }
    )
    .select()
    .single();
}

async function wlDelete(id) {
  return await supabaseClient.from('body_weight_logs').delete().eq('id', id);
}

// Mirror profiles.weight_lbs to the most recent weigh-in so the dashboard,
// profile and calculator stay consistent. body_weight_logs remains the source
// of truth for history. If no logs remain, the profile is left unchanged.
// NEVER touches calorie/macro targets — Recalculate Goals owns those.
async function wlSyncProfileWeight(userId) {
  try {
    var res = await supabaseClient
      .from('body_weight_logs')
      .select('weight_lbs, logged_on')
      .eq('user_id', userId)
      .order('logged_on', { ascending: false })
      .limit(1);
    if (res.error) throw res.error;
    var latest = (res.data || [])[0];
    if (!latest) return null; // no logs remain — leave profiles.weight_lbs as-is

    var w = wlRound1(latest.weight_lbs);
    var upd = await supabaseClient
      .from('profiles')
      .update({ weight_lbs: w, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (upd.error) throw upd.error;

    if (window.currentProfile) window.currentProfile.weight_lbs = w;
    return w;
  } catch (e) {
    console.error('wlSyncProfileWeight error:', e);
    return null;
  }
}

/* ── stats ─────────────────────────────────────────────────────────────── */

// The real weigh-ins inside a trailing window, oldest → newest.
//
// This is the ONE definition of "recent weight history": wlStats derives
// change30 from it, and any surface that VISUALISES that change consumes the
// same rows, so a number and a chart can never describe different sets.
//
// It only ever returns rows that exist. body_weight_logs is unique on
// (user_id, logged_on) — enforced by the wlUpsert conflict target — so there is
// at most one weigh-in per day and no same-day resolution to invent here.
function wlRecentSeries(logs, days) {
  var cutoff = wlParseDate(wlToday());
  cutoff.setDate(cutoff.getDate() - (days || 30));
  return (logs || [])
    .filter(function (l) {
      return l && l.logged_on && isFinite(+l.weight_lbs) &&
        wlParseDate(l.logged_on) >= cutoff;
    })
    .sort(function (a, b) {
      return a.logged_on < b.logged_on ? -1 : a.logged_on > b.logged_on ? 1 : 0;
    })
    .map(function (l) {
      return { logged_on: l.logged_on, weight_lbs: +l.weight_lbs };
    });
}

// logs: array as returned by wlFetchLogs (any order). profileWeight: fallback.
function wlStats(logs, profileWeight) {
  var desc = (logs || []).slice().sort(function (a, b) {
    return a.logged_on < b.logged_on ? 1 : a.logged_on > b.logged_on ? -1 : 0;
  });

  if (!desc.length) {
    return { count: 0, current: profileWeight != null ? +profileWeight : null, currentFromProfile: true, avg7: null, change30: null };
  }

  var current = +desc[0].weight_lbs;
  var today = wlParseDate(wlToday());

  var sevenAgo = new Date(today); sevenAgo.setDate(sevenAgo.getDate() - 6);
  var win7 = desc.filter(function (l) { return wlParseDate(l.logged_on) >= sevenAgo; });
  var avg7 = win7.length >= 2
    ? win7.reduce(function (s, l) { return s + (+l.weight_lbs); }, 0) / win7.length
    : null;

  // Same rows, same window, same order as every consumer of wlRecentSeries —
  // ascending, so the oldest in-window weigh-in is the first element.
  var win30 = wlRecentSeries(desc, 30);
  var change30 = win30.length >= 2 ? current - win30[0].weight_lbs : null;

  return { count: desc.length, current: current, currentFromProfile: false, avg7: avg7, change30: change30 };
}

// Signed delta pill (▲/▼). Neutral by design — direction "good/bad" depends on goal.
function wlDeltaHTML(delta) {
  if (delta == null || isNaN(delta)) return '';
  var r = wlRound1(delta);
  if (r === 0) return '<span class="wi-delta same">±0</span>';
  var up = r > 0;
  return '<span class="wi-delta ' + (up ? 'up' : 'down') + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(r) + '</span>';
}

function wlChangeStr(delta) {
  if (delta == null || isNaN(delta)) return '—';
  var r = wlRound1(delta);
  return (r > 0 ? '+' : r < 0 ? '−' : '±') + Math.abs(r) + ' lbs';
}

/* ── dependency-free SVG trend chart ───────────────────────────────────── */
// Generic over the y column: opts.yField (default 'weight_lbs'), opts.ariaLabel,
// opts.gradId (unique per chart when several render on one page). Rows must
// carry logged_on. Existing weight callers pass no opts and are unchanged.
//
// ONE renderer, two sizes. Home draws a COMPACT preview of this same chart, so
// what varies is presentation only — box, padding, label size, marker size —
// never what the chart means. Data, scaling, point selection and the x/y
// mapping below are shared, so the small chart and the large one can never tell
// different stories. Every default reproduces the full chart byte for byte, so
// the Progress page is unaffected by the parameterisation.
//
// Colour comes from `currentColor`, set by whichever container the chart is
// dropped into, so a future user-selectable accent flows through both sizes.
// The neutral label grey is chrome, not accent, and stays fixed.
function wlChartSVG(logs, opts) {
  opts = opts || {};
  var w = opts.width || 640, h = opts.height || 200;
  var pad = opts.pad != null ? opts.pad : 30;
  var labelSize = opts.labelSize || 11;
  var dotR = opts.dotRadius != null ? opts.dotRadius : 2.6;
  var strokeW = opts.strokeWidth != null ? opts.strokeWidth : 2.5;
  var yField = opts.yField || 'weight_lbs';
  var gradId = opts.gradId || 'wlgrad';

  var pts = (logs || []).slice().sort(function (a, b) {
    return a.logged_on < b.logged_on ? -1 : a.logged_on > b.logged_on ? 1 : 0;
  });
  if (pts.length < 2) return '';

  var xs = pts.map(function (p) { return wlParseDate(p.logged_on).getTime(); });
  var ys = pts.map(function (p) { return +p[yField]; });
  var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);
  var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
  if (minY === maxY) { minY -= 1; maxY += 1; }
  var rangeY = maxY - minY;
  minY -= rangeY * 0.12; maxY += rangeY * 0.12; rangeY = maxY - minY;

  var plotW = w - pad * 2, plotH = h - pad * 2;
  function X(t) { return pad + (maxX === minX ? plotW / 2 : (t - minX) / (maxX - minX) * plotW); }
  function Y(v) { return pad + (1 - (v - minY) / rangeY) * plotH; }

  var line = pts.map(function (p, i) {
    return (i ? 'L' : 'M') + X(xs[i]).toFixed(1) + ' ' + Y(ys[i]).toFixed(1);
  }).join(' ');
  var area = line + ' L ' + X(maxX).toFixed(1) + ' ' + (pad + plotH).toFixed(1) +
             ' L ' + X(minX).toFixed(1) + ' ' + (pad + plotH).toFixed(1) + ' Z';
  var dots = pts.map(function (p, i) {
    return '<circle cx="' + X(xs[i]).toFixed(1) + '" cy="' + Y(ys[i]).toFixed(1) + '" r="' + dotR + '" fill="currentColor"/>';
  }).join('');

  var hi = Math.max.apply(null, ys), lo = Math.min.apply(null, ys);
  // Label offsets track the label SIZE rather than being fixed pixel constants.
  // At the default 11px these round to the original 5 / 14 / 8, so the full
  // chart is unchanged; at a larger compact size the rows move apart with the
  // type instead of overlapping it. The caller must keep
  // `pad > below + bottom`, or the low-value label would land on the dates.
  var above = Math.round(labelSize * 5 / 11);
  var below = Math.round(labelSize * 14 / 11);
  var bottom = Math.round(labelSize * 8 / 11);
  function label(x, y, text, anchor) {
    return '<text x="' + x + '" y="' + y + '"' +
      (anchor ? ' text-anchor="' + anchor + '"' : '') +
      ' fill="#666" font-size="' + labelSize +
      '" font-family="Barlow,sans-serif">' + text + '</text>';
  }
  var yLabels =
    label(6, (Y(hi) - above).toFixed(1), wlRound1(hi)) +
    label(6, (Y(lo) + below).toFixed(1), wlRound1(lo));
  var xLabels =
    label(pad, h - bottom, wlEsc(wlFmtDate(pts[0].logged_on))) +
    label(w - pad, h - bottom, wlEsc(wlFmtDate(pts[pts.length - 1].logged_on)), 'end');

  // A chart that sits inside its own labelled control announces the control,
  // not a wall of coordinates — so the drawing can opt out of the a11y tree.
  var a11y = opts.decorative
    ? 'aria-hidden="true" focusable="false"'
    : 'role="img" aria-label="' + wlEsc(opts.ariaLabel || 'Weight trend') + '"';

  return '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto;display:block" ' + a11y + '>' +
    '<defs><linearGradient id="' + wlEsc(gradId) + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="currentColor" stop-opacity="0.32"/>' +
    '<stop offset="100%" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + area + '" fill="url(#' + wlEsc(gradId) + ')"/>' +
    '<path d="' + line + '" fill="none" stroke="currentColor" stroke-width="' + strokeW + '" stroke-linejoin="round" stroke-linecap="round"/>' +
    dots + yLabels + xLabels +
    '</svg>';
}

/* ── shared Log / Edit Weight modal ────────────────────────────────────── */
// Requires the modal markup (see wlModalMarkup) present on the page, a
// showToast(msg) helper, and an optional window.onWeightSaved() refresh hook.
function wlOpenModal(prefill) {
  prefill = prefill || {};
  var dateEl = document.getElementById('wlDate');
  dateEl.max = wlToday();
  dateEl.value = prefill.logged_on || wlToday();
  document.getElementById('wlWeight').value = prefill.weight_lbs != null ? prefill.weight_lbs : '';
  document.getElementById('wlNote').value = prefill.note || '';
  document.getElementById('wlModalTitle').textContent = prefill.logged_on ? 'Edit Weigh-In' : 'Log Weight';
  MMSheet.open(document.getElementById('weightModal'), { initialFocus: '#wlWeight' });
}

// Phase 4.3.5C — opened through the shared overlay primitive (mm-sheet.js),
// which owns background scroll locking, Escape, backdrop dismissal and focus
// capture/restore. The modal's own markup and styling are unchanged.
function wlCloseModal() { MMSheet.close(document.getElementById('weightModal')); }

async function wlSave() {
  var weight = parseFloat(document.getElementById('wlWeight').value);
  var date = document.getElementById('wlDate').value || wlToday();
  var note = document.getElementById('wlNote').value.trim();

  if (!weight || weight < 50 || weight > 1000) { showToast('Enter a valid weight (50–1000 lbs).'); return; }
  if (date > wlToday()) { showToast("Date can't be in the future."); return; }

  var btn = document.getElementById('wlSaveBtn');
  btn.disabled = true;
  try {
    var s = await supabaseClient.auth.getSession();
    var uid = s.data.session.user.id;
    var res = await wlUpsert(uid, wlRound1(weight), date, note);
    if (res.error) throw res.error;
    await wlSyncProfileWeight(uid); // keep profiles.weight_lbs on the latest weigh-in
    wlCloseModal();
    showToast('Weight logged!');
    // PWA install onboarding (Phase 4.3.3): emit only AFTER a confirmed
    // body_weight_logs write. Narrow signal — no body-metric value is included.
    try { window.dispatchEvent(new CustomEvent('mm:pwa-value', { detail: { type: 'loggedWeight' } })); } catch (e) {}
    if (typeof window.onWeightSaved === 'function') await window.onWeightSaved();
  } catch (err) {
    console.error('wlSave error:', err);
    showToast('Error saving — try again.');
  } finally {
    btn.disabled = false;
  }
}

/* Node (AI-coach route / offline tests): export the PURE helpers only.
   Guarded so browsers never see `module`. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    wlEsc: wlEsc, wlToday: wlToday, wlParseDate: wlParseDate,
    wlFmtDate: wlFmtDate, wlRound1: wlRound1,
    wlStats: wlStats, wlChangeStr: wlChangeStr, wlChartSVG: wlChartSVG,
    wlRecentSeries: wlRecentSeries,
  };
}

// Reusable modal markup (kept identical on every page that logs weight).
function wlModalMarkup() {
  return '' +
  '<div class="modal-overlay" id="weightModal">' +
    '<div class="modal-box">' +
      '<div class="modal-header">' +
        '<div class="modal-title" id="wlModalTitle">Log Weight</div>' +
        '<button class="modal-close" onclick="document.getElementById(\'weightModal\').classList.remove(\'open\')">✕</button>' +
      '</div>' +
      '<div class="field-group">' +
        '<label class="field-label">Weight (lbs)</label>' +
        '<input type="number" id="wlWeight" inputmode="decimal" step="0.1" min="50" max="1000" placeholder="e.g. 184.5">' +
      '</div>' +
      '<div class="field-group">' +
        '<label class="field-label">Date</label>' +
        '<input type="date" id="wlDate">' +
      '</div>' +
      '<div class="field-group">' +
        '<label class="field-label">Note <span class="field-optional">(optional)</span></label>' +
        '<input type="text" id="wlNote" maxlength="120" placeholder="e.g. morning, after workout">' +
      '</div>' +
      '<button class="btn-calc" id="wlSaveBtn" onclick="wlSave()">Save Weigh-In</button>' +
    '</div>' +
  '</div>';
}
