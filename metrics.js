/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Body Metrics (shared logic)  ·  Phase 4.0
 *
 * Body fat + body measurements: queries, stats, and the Log/Edit modals.
 * Used by weight-history.html (the Progress page). Loads AFTER weight.js and
 * reuses its helpers (wlToday, wlParseDate, wlRound1, wlEsc, wlChartSVG).
 *
 * Storage (one row per user_id + logged_on, client upserts on conflict):
 *   public.body_fat_logs     — body_fat_pct, note
 *   public.measurement_logs  — six nullable site columns (inches), note
 * ──────────────────────────────────────────────────────────────────────── */

/* ── body fat: data access ─────────────────────────────────────────────── */
async function bfFetchLogs(userId, limit) {
  try {
    var q = supabaseClient
      .from('body_fat_logs')
      .select('id, body_fat_pct, logged_on, note')
      .eq('user_id', userId)
      .order('logged_on', { ascending: false });
    if (limit) q = q.limit(limit);
    var res = await q;
    if (res.error) throw res.error;
    return res.data || [];
  } catch (e) {
    console.error('bfFetchLogs error:', e);
    return [];
  }
}

async function bfUpsert(userId, pct, loggedOn, note) {
  return await supabaseClient
    .from('body_fat_logs')
    .upsert(
      {
        user_id: userId,
        body_fat_pct: pct,
        logged_on: loggedOn,
        note: note || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,logged_on' }
    )
    .select()
    .single();
}

async function bfDelete(id) {
  return await supabaseClient.from('body_fat_logs').delete().eq('id', id);
}

// Mirror profiles.body_fat_pct to the most recent log (same contract as
// wlSyncProfileWeight): Recalculate Goals reads it, and calcBMR switches to
// the lean-mass formula when it's present. History stays the source of truth.
// NEVER touches calorie/macro targets. No logs left → profile unchanged.
async function bfSyncProfileBodyFat(userId) {
  try {
    var res = await supabaseClient
      .from('body_fat_logs')
      .select('body_fat_pct, logged_on')
      .eq('user_id', userId)
      .order('logged_on', { ascending: false })
      .limit(1);
    if (res.error) throw res.error;
    var latest = (res.data || [])[0];
    if (!latest) return null;

    var pct = wlRound1(latest.body_fat_pct);
    var upd = await supabaseClient
      .from('profiles')
      .update({ body_fat_pct: pct, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (upd.error) throw upd.error;

    if (window.currentProfile) window.currentProfile.body_fat_pct = pct;
    return pct;
  } catch (e) {
    console.error('bfSyncProfileBodyFat error:', e);
    return null;
  }
}

/* ── body fat: stats (same shape wlStats returns, for the snapshot layer) ── */
function bfStats(logs, profileBf) {
  var desc = (logs || []).slice().sort(function (a, b) {
    return a.logged_on < b.logged_on ? 1 : a.logged_on > b.logged_on ? -1 : 0;
  });
  if (!desc.length) {
    return { count: 0, current: profileBf != null ? +profileBf : null, currentFromProfile: true, change30: null };
  }
  var current = +desc[0].body_fat_pct;
  var today = wlParseDate(wlToday());
  var thirtyAgo = new Date(today); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  var win30 = desc.filter(function (l) { return wlParseDate(l.logged_on) >= thirtyAgo; });
  var change30 = win30.length >= 2 ? current - (+win30[win30.length - 1].body_fat_pct) : null;
  return { count: desc.length, current: current, currentFromProfile: false, change30: change30 };
}

/* ── body fat: shared Log / Edit modal ─────────────────────────────────── */
// Requires bfModalMarkup() mounted, showToast(msg), optional window.onBodyFatSaved().
function bfOpenModal(prefill) {
  prefill = prefill || {};
  var dateEl = document.getElementById('bfDate');
  dateEl.max = wlToday();
  dateEl.value = prefill.logged_on || wlToday();
  document.getElementById('bfPct').value = prefill.body_fat_pct != null ? prefill.body_fat_pct : '';
  document.getElementById('bfNote').value = prefill.note || '';
  document.getElementById('bfModalTitle').textContent = prefill.logged_on ? 'Edit Body Fat' : 'Log Body Fat';
  document.getElementById('bfModal').classList.add('open');
  setTimeout(function () { document.getElementById('bfPct').focus(); }, 60);
}

function bfCloseModal(e) {
  if (e && e.target !== document.getElementById('bfModal')) return;
  document.getElementById('bfModal').classList.remove('open');
}

async function bfSave() {
  var pct = parseFloat(document.getElementById('bfPct').value);
  var date = document.getElementById('bfDate').value || wlToday();
  var note = document.getElementById('bfNote').value.trim();

  if (!pct || pct <= 0 || pct >= 75) { showToast('Enter a valid body fat % (1–74).'); return; }
  if (date > wlToday()) { showToast("Date can't be in the future."); return; }

  var btn = document.getElementById('bfSaveBtn');
  btn.disabled = true;
  try {
    var s = await supabaseClient.auth.getSession();
    var uid = s.data.session.user.id;
    var res = await bfUpsert(uid, wlRound1(pct), date, note);
    if (res.error) throw res.error;
    await bfSyncProfileBodyFat(uid); // keep profiles.body_fat_pct on the latest log
    document.getElementById('bfModal').classList.remove('open');
    showToast('Body fat logged!');
    if (typeof window.onBodyFatSaved === 'function') await window.onBodyFatSaved();
  } catch (err) {
    console.error('bfSave error:', err);
    showToast('Error saving — try again.');
  } finally {
    btn.disabled = false;
  }
}

function bfModalMarkup() {
  return '' +
  '<div class="modal-overlay" id="bfModal" onclick="bfCloseModal(event)">' +
    '<div class="modal-box">' +
      '<div class="modal-header">' +
        '<div class="modal-title" id="bfModalTitle">Log Body Fat</div>' +
        '<button class="modal-close" onclick="document.getElementById(\'bfModal\').classList.remove(\'open\')">✕</button>' +
      '</div>' +
      '<div class="field-group">' +
        '<label class="field-label">Body Fat (%)</label>' +
        '<input type="number" id="bfPct" inputmode="decimal" step="0.1" min="1" max="74" placeholder="e.g. 18.5">' +
      '</div>' +
      '<div class="field-group">' +
        '<label class="field-label">Date</label>' +
        '<input type="date" id="bfDate">' +
      '</div>' +
      '<div class="field-group">' +
        '<label class="field-label">Note <span class="field-optional">(optional)</span></label>' +
        '<input type="text" id="bfNote" maxlength="120" placeholder="e.g. smart scale, caliper">' +
      '</div>' +
      '<button class="btn-calc" id="bfSaveBtn" onclick="bfSave()">Save Body Fat</button>' +
    '</div>' +
  '</div>';
}

/* ── measurements: config + data access ────────────────────────────────── */
// Fixed site vocabulary (order = form + dropdown order). Adding a site later
// = one nullable column in measurement_logs + one entry here.
var MS_SITES = [
  { key: 'waist_in', label: 'Waist' },
  { key: 'neck_in',  label: 'Neck'  },
  { key: 'chest_in', label: 'Chest' },
  { key: 'hips_in',  label: 'Hips'  },
  { key: 'arm_in',   label: 'Arm'   },
  { key: 'thigh_in', label: 'Thigh' },
];

var ms_lastLogs = [];   // most recent msFetchLogs result — lets the modal
                        // prefill when the user picks a date that has a row
                        // (prevents accidental partial-row overwrites)

async function msFetchLogs(userId, limit) {
  try {
    var q = supabaseClient
      .from('measurement_logs')
      .select('id, logged_on, waist_in, neck_in, chest_in, hips_in, arm_in, thigh_in, note')
      .eq('user_id', userId)
      .order('logged_on', { ascending: false });
    if (limit) q = q.limit(limit);
    var res = await q;
    if (res.error) throw res.error;
    ms_lastLogs = res.data || [];
    return ms_lastLogs;
  } catch (e) {
    console.error('msFetchLogs error:', e);
    return [];
  }
}

// values: { waist_in: 34, neck_in: null, ... } — the row becomes exactly this.
async function msUpsert(userId, values, loggedOn, note) {
  var row = {
    user_id: userId,
    logged_on: loggedOn,
    note: note || null,
    updated_at: new Date().toISOString(),
  };
  MS_SITES.forEach(function (s) { row[s.key] = values[s.key] != null ? values[s.key] : null; });
  return await supabaseClient
    .from('measurement_logs')
    .upsert(row, { onConflict: 'user_id,logged_on' })
    .select()
    .single();
}

async function msDelete(id) {
  return await supabaseClient.from('measurement_logs').delete().eq('id', id);
}

/* ── measurements: per-site series + stats ─────────────────────────────── */
// Rows that have this site filled — chartable directly via wlChartSVG(yField).
function msSiteSeries(logs, siteKey) {
  return (logs || []).filter(function (l) { return l[siteKey] != null; });
}

function msStats(logs, siteKey) {
  var desc = msSiteSeries(logs, siteKey).slice().sort(function (a, b) {
    return a.logged_on < b.logged_on ? 1 : a.logged_on > b.logged_on ? -1 : 0;
  });
  if (!desc.length) return { count: 0, current: null, change30: null };
  var current = +desc[0][siteKey];
  var today = wlParseDate(wlToday());
  var thirtyAgo = new Date(today); thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  var win30 = desc.filter(function (l) { return wlParseDate(l.logged_on) >= thirtyAgo; });
  var change30 = win30.length >= 2 ? current - (+win30[win30.length - 1][siteKey]) : null;
  return { count: desc.length, current: current, change30: change30 };
}

/* ── measurements: shared Log / Edit modal ─────────────────────────────── */
// Requires msModalMarkup() mounted, showToast(msg), optional window.onMeasurementsSaved().
function msFillForm(row) {
  row = row || {};
  MS_SITES.forEach(function (s) {
    document.getElementById('ms_' + s.key).value = row[s.key] != null ? row[s.key] : '';
  });
  document.getElementById('msNote').value = row.note || '';
}

function msOpenModal(prefill) {
  prefill = prefill || {};
  var dateEl = document.getElementById('msDate');
  dateEl.max = wlToday();
  dateEl.value = prefill.logged_on || wlToday();
  // Prefill from the existing row for that day (if any) so a partial re-log
  // doesn't silently blank the sites measured earlier that day.
  msFillForm(prefill.id ? prefill : msRowForDate(dateEl.value));
  document.getElementById('msModalTitle').textContent = prefill.id ? 'Edit Measurements' : 'Log Measurements';
  document.getElementById('msModal').classList.add('open');
  setTimeout(function () { document.getElementById('ms_waist_in').focus(); }, 60);
}

function msRowForDate(date) {
  return ms_lastLogs.filter(function (l) { return l.logged_on === date; })[0] || null;
}

// Date changed inside the modal → load that day's existing values (or clear).
function msDateChanged() {
  msFillForm(msRowForDate(document.getElementById('msDate').value));
}

function msCloseModal(e) {
  if (e && e.target !== document.getElementById('msModal')) return;
  document.getElementById('msModal').classList.remove('open');
}

async function msSave() {
  var date = document.getElementById('msDate').value || wlToday();
  var note = document.getElementById('msNote').value.trim();
  if (date > wlToday()) { showToast("Date can't be in the future."); return; }

  var values = {}, filled = 0, bad = null;
  MS_SITES.forEach(function (s) {
    var raw = document.getElementById('ms_' + s.key).value;
    if (raw === '' || raw == null) { values[s.key] = null; return; }
    var v = parseFloat(raw);
    if (!v || v <= 0 || v >= 200) { bad = s.label; return; }
    values[s.key] = wlRound1(v);
    filled++;
  });
  if (bad) { showToast('Enter a valid ' + bad + ' measurement (inches).'); return; }
  if (!filled) { showToast('Fill in at least one measurement.'); return; }

  var btn = document.getElementById('msSaveBtn');
  btn.disabled = true;
  try {
    var s = await supabaseClient.auth.getSession();
    var uid = s.data.session.user.id;
    var res = await msUpsert(uid, values, date, note);
    if (res.error) throw res.error;
    document.getElementById('msModal').classList.remove('open');
    showToast('Measurements logged!');
    if (typeof window.onMeasurementsSaved === 'function') await window.onMeasurementsSaved();
  } catch (err) {
    console.error('msSave error:', err);
    showToast('Error saving — try again.');
  } finally {
    btn.disabled = false;
  }
}

function msModalMarkup() {
  var fields = MS_SITES.map(function (s) {
    return '<div class="field-group">' +
      '<label class="field-label">' + s.label + ' <span class="field-optional">(in)</span></label>' +
      '<input type="number" id="ms_' + s.key + '" inputmode="decimal" step="0.1" min="1" max="199" placeholder="—">' +
    '</div>';
  }).join('');
  return '' +
  '<div class="modal-overlay" id="msModal" onclick="msCloseModal(event)">' +
    '<div class="modal-box">' +
      '<div class="modal-header">' +
        '<div class="modal-title" id="msModalTitle">Log Measurements</div>' +
        '<button class="modal-close" onclick="document.getElementById(\'msModal\').classList.remove(\'open\')">✕</button>' +
      '</div>' +
      '<div class="ms-grid">' + fields + '</div>' +
      '<div class="field-hint">Fill in what you measured — the rest stays blank.</div>' +
      '<div class="field-group">' +
        '<label class="field-label">Date</label>' +
        '<input type="date" id="msDate" onchange="msDateChanged()">' +
      '</div>' +
      '<div class="field-group">' +
        '<label class="field-label">Note <span class="field-optional">(optional)</span></label>' +
        '<input type="text" id="msNote" maxlength="120" placeholder="e.g. morning, relaxed">' +
      '</div>' +
      '<button class="btn-calc" id="msSaveBtn" onclick="msSave()">Save Measurements</button>' +
    '</div>' +
  '</div>';
}
