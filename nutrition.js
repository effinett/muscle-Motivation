/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Nutrition Tracking (shared logic)
 *
 * One source of truth for food-log queries, daily totals, and the shared
 * Add / Edit Food modal. Used by nutrition.html (full logger) and app.html
 * (dashboard summary). No external dependencies.
 *
 * Storage:
 *   public.foods      — reusable food definitions (default per-serving macros).
 *   public.food_logs  — one row per logged entry; macros are a SNAPSHOT
 *                       (per-serving × servings) so editing a food later or
 *                       deleting it never rewrites history.
 *
 * IMPORTANT: nutrition logging NEVER writes profiles targets (calories/macros).
 * Those are owned exclusively by Recalculate Goals — same rule as weight.js.
 * ──────────────────────────────────────────────────────────────────────── */

/* ── small helpers ─────────────────────────────────────────────────────── */
function nuEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// Local-time YYYY-MM-DD (avoids UTC off-by-one from toISOString()).
function nuToday() {
  var d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Parse a date-only string into a LOCAL Date (no timezone shift).
function nuParseDate(dateStr) {
  var p = String(dateStr).split('-');
  return new Date(+p[0], (+p[1]) - 1, +p[2]);
}

function nuFmtDateLong(dateStr) {
  return nuParseDate(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function nuRound(n) { return Math.round((+n || 0)); }
function nuRound1(n) { return Math.round((+n || 0) * 10) / 10; }

var NU_MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
var NU_MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

/* ── data access (exact Supabase queries) ──────────────────────────────── */
async function nuFetchLogs(userId, date) {
  try {
    var res = await supabaseClient
      .from('food_logs')
      .select('id, food_id, name, date, meal, servings, calories, protein, carbs, fat')
      .eq('user_id', userId)
      .eq('date', date)
      .order('created_at', { ascending: true });
    if (res.error) throw res.error;
    return res.data || [];
  } catch (e) {
    console.error('nuFetchLogs error:', e);
    return [];
  }
}

// Fetch the user's recently-saved foods (per-serving defaults), newest first.
// Powers the quick-add chips in the Add Food modal. food_logs stays the source
// of truth for logged history — this is reuse convenience only.
async function nuFetchRecentFoods(userId, limit) {
  try {
    var res = await supabaseClient
      .from('foods')
      .select('id, name, default_calories, default_protein, default_carbs, default_fat')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(limit || 12);
    if (res.error) throw res.error;
    return res.data || [];
  } catch (e) {
    console.error('nuFetchRecentFoods error:', e);
    return [];
  }
}

// Upsert the reusable food definition (per-serving defaults). Returns its id, or
// null on failure — a null food_id is fine, the log still stores its own snapshot.
// `src` (optional) carries USDA provenance so a saved food remembers its origin.
//
// Identity differs by source:
//   • USDA foods → (user_id, source='usda', usda_fdc_id). Never name alone, so the
//     same FDC id maps to ONE record that barcode/voice/photo/AI can all reuse.
//   • Manual foods → (user_id, name), the existing behavior.
// USDA uses select-then-write (not ON CONFLICT) so the partial unique index works
// without tripping the "no matching constraint" pitfall.
async function nuUpsertFood(userId, food, src) {
  try {
    var base = {
      default_calories: food.calories,
      default_protein: food.protein,
      default_carbs: food.carbs,
      default_fat: food.fat,
      updated_at: new Date().toISOString(),
    };

    if (src && src.usda_fdc_id != null) {
      var fdc = String(src.usda_fdc_id);
      var payload = Object.assign({}, base, {
        name: food.name,
        source: 'usda',
        brand: src.brand || null,
        usda_fdc_id: fdc,
        serving_description: src.serving_description || null,
        default_fiber: src.fiber != null ? src.fiber : null,
        default_sugar: src.sugar != null ? src.sugar : null,
      });

      // Reuse the existing record for this FDC id if we already have one.
      var found = await supabaseClient
        .from('foods')
        .select('id')
        .eq('user_id', userId).eq('source', 'usda').eq('usda_fdc_id', fdc)
        .limit(1).maybeSingle();
      if (found.error) throw found.error;

      if (found.data && found.data.id) {
        var upd = await supabaseClient
          .from('foods').update(payload).eq('id', found.data.id).select('id').single();
        if (upd.error) throw upd.error;
        return upd.data ? upd.data.id : found.data.id;
      }
      var ins = await supabaseClient
        .from('foods').insert(Object.assign({ user_id: userId }, payload)).select('id').single();
      if (ins.error) throw ins.error;
      return ins.data ? ins.data.id : null;
    }

    // Manual food: identity by name (existing behavior). Leave source columns at
    // their defaults so we never stamp a manual save over real provenance.
    var manual = Object.assign({ user_id: userId, name: food.name }, base);
    var res = await supabaseClient
      .from('foods')
      .upsert(manual, { onConflict: 'user_id,name' }) // matches the plain unique index on (user_id, name)
      .select('id')
      .single();
    if (res.error) throw res.error;
    return res.data ? res.data.id : null;
  } catch (e) {
    // Non-fatal: the log itself carries a full snapshot, so we proceed without a food_id.
    console.error('nuUpsertFood error:', e);
    return null;
  }
}

// Save a log entry. Macros passed in are PER SERVING; we store the multiplied snapshot.
// If id is provided, updates that row; otherwise inserts a new one.
//
// entry.src (optional) is the per-serving USDA source object from a database pick.
// When present we stamp source provenance (fdc id, brand, fiber/sugar, raw payload);
// when absent on an UPDATE we leave the existing source columns untouched so editing
// a USDA-logged food's macros never erases where it came from.
async function nuSaveLog(userId, entry) {
  var servings = entry.servings != null ? +entry.servings : 1;
  var perCal = +entry.calories || 0, perP = +entry.protein || 0, perC = +entry.carbs || 0, perF = +entry.fat || 0;
  var src = entry.src || null;

  // Keep a reusable food definition in sync (best-effort; null is acceptable).
  var foodId = await nuUpsertFood(userId, {
    name: entry.name, calories: perCal, protein: perP, carbs: perC, fat: perF,
  }, src);

  var row = {
    user_id: userId,
    food_id: foodId,
    name: entry.name,
    date: entry.date,
    meal: entry.meal,
    servings: servings,
    calories: nuRound1(perCal * servings),
    protein: nuRound1(perP * servings),
    carbs: nuRound1(perC * servings),
    fat: nuRound1(perF * servings),
    updated_at: new Date().toISOString(),
  };

  // Source columns: only written for a fresh USDA pick (insert or edit). A plain
  // manual insert relies on the DB default source='manual'; a plain edit omits
  // them entirely to preserve any existing provenance.
  if (src) {
    row.source              = 'usda';
    row.usda_fdc_id         = src.usda_fdc_id != null ? String(src.usda_fdc_id) : null;
    row.brand               = src.brand || null;
    row.serving_description = src.serving_description || null;
    row.serving_amount      = src.serving_amount != null ? src.serving_amount : null;
    row.grams               = src.grams != null ? nuRound1(src.grams * servings) : null;
    row.fiber               = src.fiber != null ? nuRound1(src.fiber * servings) : null;
    row.sugar               = src.sugar != null ? nuRound1(src.sugar * servings) : null;
    row.raw_source_data     = src.raw || null;
  }

  if (entry.id) {
    return await supabaseClient.from('food_logs').update(row).eq('id', entry.id).select().single();
  }
  return await supabaseClient.from('food_logs').insert(row).select().single();
}

async function nuDeleteLog(id) {
  return await supabaseClient.from('food_logs').delete().eq('id', id);
}

/* ── totals ────────────────────────────────────────────────────────────── */
function nuDayTotals(logs) {
  return (logs || []).reduce(function (t, l) {
    t.calories += +l.calories || 0;
    t.protein  += +l.protein  || 0;
    t.carbs    += +l.carbs    || 0;
    t.fat      += +l.fat      || 0;
    return t;
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

/* ── shared Add / Edit Food modal ──────────────────────────────────────── */
// Requires nuModalMarkup() mounted on the page, a showToast(msg) helper, and an
// optional window.onFoodSaved() refresh hook. nu_modalDate holds the active day.
var nu_modalDate = null;

function nuOpenModal(prefill) {
  prefill = prefill || {};
  nu_modalDate = prefill.date || nuToday();

  // When editing an existing log, the stored macros are the multiplied snapshot;
  // divide back to per-serving so the inputs stay "per serving" consistent.
  var servings = prefill.servings != null ? +prefill.servings : 1;
  var div = (prefill.id && servings) ? servings : 1;

  document.getElementById('nuFoodId').value   = prefill.id || '';
  document.getElementById('nuName').value      = prefill.name || '';
  document.getElementById('nuMeal').value      = prefill.meal || 'breakfast';
  document.getElementById('nuServings').value  = servings;
  document.getElementById('nuCalories').value  = prefill.id ? nuRound1((+prefill.calories || 0) / div) : (prefill.calories != null ? prefill.calories : '');
  document.getElementById('nuProtein').value   = prefill.id ? nuRound1((+prefill.protein  || 0) / div) : (prefill.protein  != null ? prefill.protein  : '');
  document.getElementById('nuCarbs').value     = prefill.id ? nuRound1((+prefill.carbs    || 0) / div) : (prefill.carbs    != null ? prefill.carbs    : '');
  document.getElementById('nuFat').value       = prefill.id ? nuRound1((+prefill.fat      || 0) / div) : (prefill.fat      != null ? prefill.fat      : '');

  document.getElementById('nuModalTitle').textContent = prefill.id ? 'Edit Food' : 'Add Food';
  document.getElementById('nuDeleteBtn').style.display = prefill.id ? 'block' : 'none';

  // Always open on the Add/Edit form view (reset both search panels).
  nu_pendingSource = null;                // fresh open = no carried USDA provenance
  document.getElementById('nuSearchView').style.display = 'none';
  var usdaView = document.getElementById('nuUsdaView');
  if (usdaView) usdaView.style.display = 'none';
  document.getElementById('nuAddView').style.display    = 'block';
  document.getElementById('nuBackBtn').style.display     = 'none';

  // Recent/saved foods quick-add — only offered when adding a new entry, never
  // when editing an existing log (where the fields are already populated).
  var recentWrap = document.getElementById('nuRecentWrap');
  if (prefill.id) {
    if (recentWrap) recentWrap.style.display = 'none';
  } else {
    nuLoadRecent();
  }

  document.getElementById('foodModal').classList.add('open');
  setTimeout(function () { document.getElementById('nuName').focus(); }, 60);
}

function nuCloseModal(e) {
  if (e && e.target !== document.getElementById('foodModal')) return;
  document.getElementById('foodModal').classList.remove('open');
}

async function nuSave() {
  var name = document.getElementById('nuName').value.trim();
  var meal = document.getElementById('nuMeal').value;
  var servings = parseFloat(document.getElementById('nuServings').value);
  var calories = parseFloat(document.getElementById('nuCalories').value);
  var protein  = parseFloat(document.getElementById('nuProtein').value);
  var carbs    = parseFloat(document.getElementById('nuCarbs').value);
  var fat      = parseFloat(document.getElementById('nuFat').value);

  if (!name) { showToast('Enter a food name.'); return; }
  if (NU_MEALS.indexOf(meal) === -1) { showToast('Pick a meal.'); return; }
  if (!servings || servings <= 0) servings = 1;
  if (isNaN(calories) || calories < 0) { showToast('Enter calories.'); return; }

  var btn = document.getElementById('nuSaveBtn');
  btn.disabled = true;
  try {
    var s = await supabaseClient.auth.getSession();
    var uid = s.data.session.user.id;
    // Only attach USDA provenance if the picked food's name is still intact —
    // editing the name means the user is logging something else, so log it manual.
    var src = (nu_pendingSource && nu_pendingSource.name === name) ? nu_pendingSource : null;
    var res = await nuSaveLog(uid, {
      id: document.getElementById('nuFoodId').value || null,
      name: name, meal: meal, servings: servings,
      date: nu_modalDate || nuToday(),
      calories: calories,
      protein: isNaN(protein) ? 0 : protein,
      carbs:   isNaN(carbs)   ? 0 : carbs,
      fat:     isNaN(fat)     ? 0 : fat,
      src: src,
    });
    if (res.error) throw res.error;
    document.getElementById('foodModal').classList.remove('open');
    showToast('Food logged!');
    if (typeof window.onFoodSaved === 'function') await window.onFoodSaved();
  } catch (err) {
    console.error('nuSave error:', err);
    showToast('Error saving — try again.');
  } finally {
    btn.disabled = false;
  }
}

async function nuDeleteFromModal() {
  var id = document.getElementById('nuFoodId').value;
  if (!id) return;
  var btn = document.getElementById('nuDeleteBtn');
  btn.disabled = true;
  try {
    var res = await nuDeleteLog(id);
    if (res.error) throw res.error;
    document.getElementById('foodModal').classList.remove('open');
    showToast('Entry removed.');
    if (typeof window.onFoodSaved === 'function') await window.onFoodSaved();
  } catch (err) {
    console.error('nuDeleteFromModal error:', err);
    showToast('Error removing — try again.');
  } finally {
    btn.disabled = false;
  }
}

/* ── recent / saved foods quick-add ────────────────────────────────────── */
var NU_RECENT_VISIBLE = 6;          // chips shown before the "Show more" chip
var nu_recentFoods = [];            // full saved-food list (recent-first), shared
                                    // by the chips and the Saved Foods search panel

// Fire-and-forget loader: the modal opens immediately, chips fill in when ready.
async function nuLoadRecent() {
  try {
    var s = await supabaseClient.auth.getSession();
    var uid = s.data.session && s.data.session.user && s.data.session.user.id;
    if (!uid) { nuRenderRecent([]); return; }
    var foods = await nuFetchRecentFoods(uid, 100);
    nuRenderRecent(foods);
  } catch (e) {
    console.error('nuLoadRecent error:', e);
    nuRenderRecent([]);
  }
}

function nuRenderRecent(foods) {
  nu_recentFoods = foods || [];
  var wrap = document.getElementById('nuRecentWrap');
  var chips = document.getElementById('nuRecentChips');
  if (!wrap || !chips) return;
  if (!nu_recentFoods.length) { wrap.style.display = 'none'; chips.innerHTML = ''; return; }
  // Chips show a SHORTENED label; the full name is preserved in nu_recentFoods.
  var html = nu_recentFoods.slice(0, NU_RECENT_VISIBLE).map(function (f, i) {
    return '<button type="button" class="nu-chip" onclick="nuPickSaved(' + i + ')">' +
        '<span class="nu-chip-name">' + nuEsc(nuShortLabel(f.name)) + '</span>' +
      '</button>';
  }).join('');
  if (nu_recentFoods.length > NU_RECENT_VISIBLE) {
    html += '<button type="button" class="nu-chip nu-chip-more" onclick="nuOpenSearch()">Show more</button>';
  }
  chips.innerHTML = html;
  wrap.style.display = 'block';
}

// Prefill from a saved food — works from a chip OR the Saved Foods search list.
// The FULL name fills the Food field (never the shortened chip label); servings
// resets to 1 and meal is left as-is so the user can still adjust before saving.
function nuPickSaved(i) {
  var f = nu_recentFoods[i];
  if (!f) return;
  nu_pendingSource = null;          // re-logging a saved food is a plain manual entry
  document.getElementById('nuName').value     = f.name;
  document.getElementById('nuCalories').value = +f.default_calories || 0;
  document.getElementById('nuProtein').value  = +f.default_protein  || 0;
  document.getElementById('nuCarbs').value    = +f.default_carbs    || 0;
  document.getElementById('nuFat').value       = +f.default_fat      || 0;
  document.getElementById('nuServings').value = 1;
  nuCloseSearch();                  // return to the form if we came from search
  document.getElementById('nuServings').focus();
}

/* ── Saved Foods search panel (opened via "Show more") ─────────────────── */
function nuOpenSearch() {
  document.getElementById('nuAddView').style.display    = 'none';
  var usdaView = document.getElementById('nuUsdaView');
  if (usdaView) usdaView.style.display = 'none';
  document.getElementById('nuSearchView').style.display = 'block';
  document.getElementById('nuBackBtn').style.display    = 'inline-block';
  document.getElementById('nuModalTitle').textContent   = 'Saved Foods';
  document.getElementById('nuSearch').value = '';
  nuRenderSearchList('');
  setTimeout(function () { document.getElementById('nuSearch').focus(); }, 60);
}

function nuCloseSearch() {
  var sv = document.getElementById('nuSearchView');
  if (!sv || sv.style.display === 'none') return;
  sv.style.display = 'none';
  document.getElementById('nuAddView').style.display = 'block';
  document.getElementById('nuBackBtn').style.display = 'none';
  document.getElementById('nuModalTitle').textContent =
    document.getElementById('nuFoodId').value ? 'Edit Food' : 'Add Food';
}

function nuFilterSaved() {
  nuRenderSearchList(document.getElementById('nuSearch').value);
}

function nuRenderSearchList(q) {
  var list = document.getElementById('nuSearchList');
  if (!list) return;
  q = (q || '').trim().toLowerCase();
  var rows = nu_recentFoods
    .map(function (f, i) { return { f: f, i: i }; })
    .filter(function (o) { return !q || o.f.name.toLowerCase().indexOf(q) >= 0; });
  if (!rows.length) {
    list.innerHTML = '<div class="nu-search-empty">' +
      (nu_recentFoods.length ? 'No saved foods match.' : 'No saved foods yet.') + '</div>';
    return;
  }
  list.innerHTML = rows.map(function (o) {
    return '<button type="button" class="nu-saved-row" onclick="nuPickSaved(' + o.i + ')">' +
        '<span class="nu-saved-name">' + nuEsc(o.f.name) + '</span>' +
        '<span class="nu-saved-cal">' + nuRound(o.f.default_calories) + ' kcal</span>' +
      '</button>';
  }).join('');
}

// Display-only chip label: drop a trailing measure ("...,6 oz") and low-info
// qualifier words ("Fairlife Protein Shake" -> "Fairlife Shake"). Already-short
// names pass through untouched. The full name is always kept in nu_recentFoods.
// "protein" and "greek" are intentionally NOT here — they're meaningful food
// distinctions, not noise. We only strip fat/diet descriptors and packaging words.
var NU_FILLER = [
  'pro','organic','original','natural','plain','unsweetened',
  'nonfat','non-fat','low-fat','lowfat','reduced-fat','reduced','fat-free',
  'whole','skim','lean','raw','cooked','fresh','grass-fed','free-range',
  'boneless','skinless'
];
function nuShortLabel(name) {
  var full = String(name == null ? '' : name).trim();
  var base = full.split(',')[0].trim();          // drop ", 6 oz"-style measures
  var kept = base.split(/\s+/).filter(function (w) {
    var lw = w.toLowerCase().replace(/[().]/g, '');
    if (/^\d+(\.\d+)?%$/.test(lw)) return false;  // 2%, 0%, 1.5%
    return NU_FILLER.indexOf(lw) === -1;
  });
  var short = kept.join(' ').replace(/\s+/g, ' ').trim();
  // Never hard-truncate (that loses the food's identity) — the chip's CSS
  // max-width + text-overflow ellipsis handles any pathologically long name.
  return short || base || full;
}

/* ── USDA FoodData Central search ──────────────────────────────────────────
 * The page never sees the USDA key — it calls the /api/usda-search proxy with
 * the user's Supabase token. Normalization (per-100g → per-serving) lives here
 * so future barcode/photo logging can reuse the same nuNormalizeUsdaFood path.
 * ──────────────────────────────────────────────────────────────────────── */
var nu_pendingSource = null;   // per-serving USDA provenance for the next save
var nu_usdaResults   = [];     // normalized results backing the result rows
var nu_usdaTimer     = null;   // debounce timer
var nu_usdaAbort     = null;   // AbortController for the in-flight request
var nu_usdaSeq       = 0;      // guards against stale responses landing late

// Fetch trimmed USDA foods through the proxy. `signal` cancels stale requests.
async function nuUsdaSearch(query, signal) {
  var s = await supabaseClient.auth.getSession();
  var token = s.data.session && s.data.session.access_token;
  if (!token) throw new Error('Not authenticated');
  var res = await fetch('/api/usda-search?q=' + encodeURIComponent(query), {
    headers: { Authorization: 'Bearer ' + token },
    signal: signal,
  });
  if (!res.ok) {
    var msg = 'Search failed.';
    try { var j = await res.json(); if (j && j.error) msg = j.error; } catch (e) {}
    var err = new Error(msg); err.status = res.status; throw err;
  }
  var data = await res.json();
  return (data && data.foods) || [];
}

// Convert one trimmed USDA food (nutrients per 100 g + serving info) into a
// PER-SERVING object matching what the Add form / nuSaveLog expect.
function nuNormalizeUsdaFood(f) {
  var per100 = f.nutrients || {};
  var size = +f.servingSize;
  var unit = (f.servingSizeUnit || '').toLowerCase();
  var factor, grams, servingAmount, servingUnit, servingDesc;

  if (size > 0 && (unit === 'g' || unit === 'gram' || unit === 'grams' || unit === 'ml')) {
    factor = size / 100;                       // scale per-100g down to one serving
    grams = (unit === 'ml') ? null : size;     // ml has no reliable gram weight
    servingAmount = size; servingUnit = unit;
    servingDesc = f.householdServing || (nuRound1(size) + ' ' + unit);
  } else {
    factor = 1;                                // base unit is 100 g
    grams = 100; servingAmount = 100; servingUnit = 'g';
    servingDesc = f.householdServing || '100 g';
  }
  function sc(v) { return nuRound1((+v || 0) * factor); }

  return {
    usda_fdc_id: f.fdcId,
    name: f.brand ? (f.description + ' (' + f.brand + ')') : f.description,
    brand: f.brand || '',
    serving_description: servingDesc,
    serving_amount: servingAmount,
    serving_unit: servingUnit,
    grams: grams,
    // per-serving macros
    calories: nuRound((+per100.kcal || 0) * factor),
    protein: sc(per100.protein),
    carbs:   sc(per100.carbs),
    fat:     sc(per100.fat),
    fiber:   sc(per100.fiber),
    sugar:   sc(per100.sugar),
    raw: f,
  };
}

// Multiply a per-serving food's macros by quantity (shared by detail preview).
function nuScaleMacros(food, qty) {
  var q = +qty || 1;
  return {
    calories: nuRound((+food.calories || 0) * q),
    protein:  nuRound1((+food.protein || 0) * q),
    carbs:    nuRound1((+food.carbs   || 0) * q),
    fat:      nuRound1((+food.fat     || 0) * q),
    fiber:    nuRound1((+food.fiber   || 0) * q),
    sugar:    nuRound1((+food.sugar   || 0) * q),
  };
}

/* ── USDA search view (third modal panel) ─────────────────────────────────── */
function nuOpenUsda() {
  document.getElementById('nuAddView').style.display    = 'none';
  document.getElementById('nuSearchView').style.display = 'none';
  document.getElementById('nuUsdaView').style.display   = 'block';
  document.getElementById('nuBackBtn').style.display    = 'inline-block';
  document.getElementById('nuModalTitle').textContent   = 'Search Foods';
  document.getElementById('nuUsdaInput').value = '';
  nu_usdaResults = [];
  nuUsdaSetStatus('Type at least 2 letters to search the food database.');
  document.getElementById('nuUsdaResults').innerHTML = '';
  setTimeout(function () { document.getElementById('nuUsdaInput').focus(); }, 60);
}

function nuCloseUsda() {
  var v = document.getElementById('nuUsdaView');
  if (!v || v.style.display === 'none') return false;
  if (nu_usdaAbort) { try { nu_usdaAbort.abort(); } catch (e) {} nu_usdaAbort = null; }
  if (nu_usdaTimer) { clearTimeout(nu_usdaTimer); nu_usdaTimer = null; }
  v.style.display = 'none';
  document.getElementById('nuAddView').style.display = 'block';
  document.getElementById('nuBackBtn').style.display = 'none';
  document.getElementById('nuModalTitle').textContent =
    document.getElementById('nuFoodId').value ? 'Edit Food' : 'Add Food';
  return true;
}

// Single back-button dispatcher — closes whichever sub-panel is open.
function nuModalBack() {
  if (nuCloseUsda()) return;
  nuCloseSearch();
}

function nuUsdaSetStatus(msg, kind) {
  var el = document.getElementById('nuUsdaStatus');
  if (!el) return;
  el.className = 'nu-usda-status' + (kind ? ' ' + kind : '');
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

// Debounced + stale-cancelling input handler.
function nuUsdaInputChanged() {
  var q = document.getElementById('nuUsdaInput').value.trim();
  if (nu_usdaTimer) clearTimeout(nu_usdaTimer);

  if (q.length < 2) {
    if (nu_usdaAbort) { try { nu_usdaAbort.abort(); } catch (e) {} nu_usdaAbort = null; }
    nu_usdaResults = [];
    document.getElementById('nuUsdaResults').innerHTML = '';
    nuUsdaSetStatus('Type at least 2 letters to search the food database.');
    return;
  }

  nu_usdaTimer = setTimeout(function () { nuRunUsdaSearch(q); }, 300);
}

async function nuRunUsdaSearch(q) {
  // Cancel any in-flight request and tag this one so a late response can't win.
  if (nu_usdaAbort) { try { nu_usdaAbort.abort(); } catch (e) {} }
  nu_usdaAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var seq = ++nu_usdaSeq;

  nuUsdaSetStatus('Searching…', 'loading');
  document.getElementById('nuUsdaResults').innerHTML = '';

  try {
    var foods = await nuUsdaSearch(q, nu_usdaAbort ? nu_usdaAbort.signal : undefined);
    if (seq !== nu_usdaSeq) return;                       // a newer search superseded us
    nu_usdaResults = foods.map(nuNormalizeUsdaFood);
    if (!nu_usdaResults.length) {
      nuUsdaSetStatus('No foods found for “' + q + '”.', 'empty');
      return;
    }
    nuUsdaSetStatus('');
    nuRenderUsdaResults();
  } catch (err) {
    if (err && err.name === 'AbortError') return;         // stale request — ignore
    if (seq !== nu_usdaSeq) return;
    console.error('nuRunUsdaSearch error:', err);
    nuUsdaSetStatus(err && err.message ? err.message : 'Search failed. Try again.', 'error');
  }
}

function nuRenderUsdaResults() {
  var list = document.getElementById('nuUsdaResults');
  if (!list) return;
  list.innerHTML = nu_usdaResults.map(function (f, i) {
    var macros = nuRound(f.calories) + ' kcal · P ' + nuRound1(f.protein) +
                 ' · C ' + nuRound1(f.carbs) + ' · F ' + nuRound1(f.fat);
    var sub = (f.brand ? nuEsc(f.brand) + ' · ' : '') + nuEsc(f.serving_description);
    return '<button type="button" class="nu-usda-row" onclick="nuPickUsda(' + i + ')">' +
        '<span class="nu-usda-main">' +
          '<span class="nu-usda-name">' + nuEsc(f.name) + '</span>' +
          '<span class="nu-usda-sub">' + sub + '</span>' +
          '<span class="nu-usda-macros">' + macros + '</span>' +
        '</span>' +
        '<span class="nu-usda-cals">' + nuRound(f.calories) + '</span>' +
      '</button>';
  }).join('');
}

// Selecting a USDA result prefills the existing Add form (1 serving) and stashes
// the per-serving provenance so the save writes source='usda' + metadata.
function nuPickUsda(i) {
  var f = nu_usdaResults[i];
  if (!f) return;
  nu_pendingSource = f;
  document.getElementById('nuName').value     = f.name;
  document.getElementById('nuCalories').value = f.calories;
  document.getElementById('nuProtein').value  = f.protein;
  document.getElementById('nuCarbs').value    = f.carbs;
  document.getElementById('nuFat').value       = f.fat;
  document.getElementById('nuServings').value = 1;
  nuCloseUsda();
  document.getElementById('nuServings').focus();
}

// Clears carried USDA provenance the moment the user hand-edits the food name.
function nuNameEdited() {
  if (nu_pendingSource &&
      document.getElementById('nuName').value !== nu_pendingSource.name) {
    nu_pendingSource = null;
  }
}

// Reusable modal markup (kept identical on every page that logs food).
function nuModalMarkup() {
  var mealOpts = NU_MEALS.map(function (m) {
    return '<option value="' + m + '">' + NU_MEAL_LABELS[m] + '</option>';
  }).join('');
  return '' +
  '<div class="modal-overlay" id="foodModal" onclick="nuCloseModal(event)">' +
    '<div class="modal-box">' +
      '<div class="modal-header">' +
        '<button class="nu-back" id="nuBackBtn" style="display:none;" onclick="nuModalBack()" title="Back">←</button>' +
        '<div class="modal-title" id="nuModalTitle">Add Food</div>' +
        '<button class="modal-close" onclick="document.getElementById(\'foodModal\').classList.remove(\'open\')">✕</button>' +
      '</div>' +
      '<div id="nuAddView">' +
        '<input type="hidden" id="nuFoodId">' +
        '<button type="button" class="nu-dbsearch" id="nuDbSearchBtn" onclick="nuOpenUsda()">' +
          '<span class="nu-dbsearch-ico">🔍</span>' +
          '<span>Search food database</span>' +
        '</button>' +
        '<div class="nu-recent" id="nuRecentWrap" style="display:none;">' +
          '<div class="nu-recent-label">Recent foods</div>' +
          '<div class="nu-recent-chips" id="nuRecentChips"></div>' +
        '</div>' +
        '<div class="field-group">' +
          '<label class="field-label">Food</label>' +
          '<input type="text" id="nuName" maxlength="80" placeholder="e.g. Chicken breast, 6 oz" oninput="nuNameEdited()">' +
        '</div>' +
        '<div class="nu-row">' +
          '<div class="field-group">' +
            '<label class="field-label">Meal</label>' +
            '<select id="nuMeal">' + mealOpts + '</select>' +
          '</div>' +
          '<div class="field-group">' +
            '<label class="field-label">Servings</label>' +
            '<input type="number" id="nuServings" inputmode="decimal" step="0.25" min="0" value="1">' +
          '</div>' +
        '</div>' +
        '<div class="field-hint">Macros are per serving.</div>' +
        '<div class="nu-row nu-row-4">' +
          '<div class="field-group">' +
            '<label class="field-label">Calories</label>' +
            '<input type="number" id="nuCalories" inputmode="numeric" step="1" min="0" placeholder="0">' +
          '</div>' +
          '<div class="field-group">' +
            '<label class="field-label">Protein (g)</label>' +
            '<input type="number" id="nuProtein" inputmode="decimal" step="0.1" min="0" placeholder="0">' +
          '</div>' +
          '<div class="field-group">' +
            '<label class="field-label">Carbs (g)</label>' +
            '<input type="number" id="nuCarbs" inputmode="decimal" step="0.1" min="0" placeholder="0">' +
          '</div>' +
          '<div class="field-group">' +
            '<label class="field-label">Fat (g)</label>' +
            '<input type="number" id="nuFat" inputmode="decimal" step="0.1" min="0" placeholder="0">' +
          '</div>' +
        '</div>' +
        '<button class="btn-calc" id="nuSaveBtn" onclick="nuSave()">Save Food</button>' +
        '<button class="btn-delete-log" id="nuDeleteBtn" style="display:none;" onclick="nuDeleteFromModal()">Delete Entry</button>' +
      '</div>' +
      '<div id="nuSearchView" style="display:none;">' +
        '<input type="text" class="nu-search-input" id="nuSearch" maxlength="80" placeholder="Search saved foods…" oninput="nuFilterSaved()">' +
        '<div class="nu-saved-list" id="nuSearchList"></div>' +
      '</div>' +
      '<div id="nuUsdaView" style="display:none;">' +
        '<input type="text" class="nu-search-input" id="nuUsdaInput" maxlength="80" autocomplete="off" placeholder="Search foods (e.g. chicken breast)…" oninput="nuUsdaInputChanged()">' +
        '<div class="nu-usda-status" id="nuUsdaStatus"></div>' +
        '<div class="nu-usda-list" id="nuUsdaResults"></div>' +
      '</div>' +
    '</div>' +
  '</div>';
}
