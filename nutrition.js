/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Nutrition Tracking (shared logic)
 *
 * One source of truth for food-log queries, daily totals, and the shared
 * Add / Edit Food modal. Used by nutrition.html (full logger) and app.html
 * (dashboard summary). REQUIRES food-core.js (the shared food-resolution
 * core, Phase 4.2.1) loaded first — pure resolution logic lives there.
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

// Rounding + macro scaling (nuRound, nuRound1, nuScaleMacros) live in
// food-core.js — loaded before this file on every page and in the tests.

var NU_MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];
var NU_MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

/* ── data access (exact Supabase queries) ──────────────────────────────── */
async function nuFetchLogs(userId, date) {
  try {
    var res = await supabaseClient
      .from('food_logs')
      // Identity columns (source…serving_unit) ride along so edit mode can keep a
      // USDA food's identity for favorites — cheap text columns, no raw payload.
      .select('id, food_id, name, date, meal, servings, calories, protein, carbs, fat, source, usda_fdc_id, brand, gtin_upc, serving_amount, serving_unit')
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
  var src = entry.src || null;

  // Per-serving base (fiber/sugar only exist on a USDA source). Scaled with the SAME
  // shared function the live readout uses, so saved values == displayed values.
  var perUnit = {
    calories: +entry.calories || 0, protein: +entry.protein || 0,
    carbs:    +entry.carbs    || 0, fat:     +entry.fat     || 0,
    fiber:    src ? (+src.fiber || 0) : 0, sugar: src ? (+src.sugar || 0) : 0,
  };
  var total = nuScaleMacros(perUnit, servings);

  // Keep a reusable food definition in sync (best-effort; null is acceptable).
  var foodId = await nuUpsertFood(userId, {
    name: entry.name, calories: perUnit.calories, protein: perUnit.protein, carbs: perUnit.carbs, fat: perUnit.fat,
  }, src);

  var row = {
    user_id: userId,
    food_id: foodId,
    name: entry.name,
    date: entry.date,
    meal: entry.meal,
    servings: servings,
    calories: total.calories,
    protein: total.protein,
    carbs: total.carbs,
    fat: total.fat,
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
    row.serving_unit        = src.serving_unit || null;
    row.grams               = src.grams != null ? nuRound1(src.grams * servings) : null;
    row.fiber               = total.fiber;
    row.sugar               = total.sugar;
    row.gtin_upc            = src.gtin_upc || null;
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

  // Reset transient state and hide every sub-panel before choosing a start view.
  nuResetModalState();
  // Editing a USDA-logged entry: remember its identity for FAVORITES only.
  // nuSave's provenance rules are untouched — a plain edit still never rewrites
  // the log's source columns (nu_pendingSource stays null).
  if (prefill.id && prefill.source === 'usda' && prefill.usda_fdc_id != null) {
    nu_editSource = {
      log_id: prefill.id, name: prefill.name || '',
      usda_fdc_id: prefill.usda_fdc_id, brand: prefill.brand || null,
      gtin_upc: prefill.gtin_upc || null, serving_unit: prefill.serving_unit || null,
      serving_amount: prefill.serving_amount != null ? prefill.serving_amount : null,
    };
  }
  nuUpdateTotalPreview();

  document.getElementById('foodModal').classList.add('open');

  if (prefill.id) {
    // Editing an existing entry → straight to the form (fields already filled).
    document.getElementById('nuRecentWrap').style.display = 'none';
    nuShowForm(false);
  } else {
    // New entry → USDA search is the default path (manual entry is the fallback).
    nu_recentLoaded = false;              // form's recent chips load lazily on demand
    nuShowUsdaSearch(true);
  }
}

// Show the add/detail form. `withBack` controls the header back arrow (used when
// the form was reached from the search results so the user can return to search).
function nuShowForm(withBack) {
  document.getElementById('nuSearchView').style.display = 'none';
  document.getElementById('nuUsdaView').style.display   = 'none';
  document.getElementById('nuAddView').style.display    = 'block';
  var editing = !!document.getElementById('nuFoodId').value;
  // USDA pick → polished selected-food card; manual/edit → plain editable form.
  var isUsda = !!(nu_pendingSource && nu_pendingSource.usda_fdc_id);
  nuSetMode(isUsda);
  document.getElementById('nuModalTitle').textContent = editing ? 'Edit Food' : 'Add Food';
  document.getElementById('nuSaveBtn').textContent = editing ? 'Save Changes' : 'Add Food';
  document.getElementById('nuBackBtn').style.display = withBack ? 'inline-block' : 'none';
  nuUpdateTotalPreview();
  nuSyncFavBtn();
}

// Toggle the two faces of the Add form. USDA shows the card header + serving
// dropdown + big macro readout; manual/edit shows the editable name + macro
// inputs. The hidden macro inputs still exist in BOTH modes (nuApplyServing keeps
// them filled for USDA) so nuSave stays unchanged.
function nuSetMode(isUsda) {
  function show(id, on) { var e = document.getElementById(id); if (e) e.style.display = on ? '' : 'none'; }
  show('nuDbSearchBtn', !isUsda);
  show('nuCardHeader',  isUsda);
  show('nuNameGroup',   !isUsda);
  show('nuServingRow',  isUsda);
  show('nuManualMacros', !isUsda);
  show('nuMacroReadout', isUsda);
  if (isUsda) { var rw = document.getElementById('nuRecentWrap'); if (rw) rw.style.display = 'none'; }
}

function nuCloseModal(e) {
  if (e && e.target !== document.getElementById('foodModal')) return;
  nuStopScanner();                  // never leave the camera running behind a closed modal
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
  nuSyncFavBtn();
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
  nuSyncFavBtn();
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

// Chip labels (NU_FILLER, nuShortLabel) live in food-core.js.

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
var nu_usdaIsRoot    = false;  // true when search is the modal's root (new entry)
var nu_formBackTo    = null;   // where the form's back arrow returns ('search' | null)
var nu_recentLoaded  = false;  // lazy-load guard for the manual form's recent chips

// Fetch trimmed USDA foods through the proxy. `signal` cancels stale requests.
async function nuUsdaSearch(query, signal) {
  var s = await supabaseClient.auth.getSession();
  var token = s.data.session && s.data.session.access_token;
  if (!token) throw new Error('Not authenticated');
  var headers = { Authorization: 'Bearer ' + token };
  var hasCorrectionContext = false;
  // Session correction memory (Phase 4.2.4): attach only the corrections relevant
  // to THIS query so the server can apply them immediately (before/without the
  // persistent write landing). The server treats this as untrusted evidence and
  // re-validates it; a failure here must never block search, so it is guarded.
  try {
    if (typeof nmSelectRelevant === 'function' && nu_corrections.length) {
      var rel = nmSelectRelevant(nu_corrections, { query: query });
      if (rel.length) { headers['X-Correction-Context'] = nmSerializeContext(rel); hasCorrectionContext = true; }
    }
  } catch (e) { /* correction context is best-effort */ }
  var opts = { headers: headers, signal: signal };
  // A correction-context request must NEVER be answered from the browser's
  // per-query cache: the plain (no-context) response for the same URL is cached
  // `private, max-age=60`, so right after a correction the identical query would
  // otherwise be served the STALE pre-correction ranking (the cache is keyed by
  // URL and ignores this header). `no-store` bypasses that so same-session
  // learning is immediate. Plain searches keep the short cache (common while typing).
  if (hasCorrectionContext) opts.cache = 'no-store';
  var res = await fetch('/api/usda-search?q=' + encodeURIComponent(query), opts);
  if (!res.ok) {
    var msg = 'Search failed.';
    try { var j = await res.json(); if (j && j.error) msg = j.error; } catch (e) {}
    var err = new Error(msg); err.status = res.status; throw err;
  }
  var data = await res.json();
  return (data && data.foods) || [];
}

// Candidate normalization + the serving engine (nuNormalizeUsdaFood,
// nuScalePer100, nuBuildServingOptions, nuDefaultServingKey) live in
// food-core.js.

// Mutate a normalized USDA food so its result row previews its true default
// serving: generic + cached portions → portion label + macros for that portion
// (same nuScalePer100 math the card uses). Idempotent; returns true if applied.
function nuApplyDefaultPortion(f) {
  var portions = f.usda_fdc_id != null ? nu_detailCache[f.usda_fdc_id] : null;
  if (f.has_serving || !portions || !portions.length) return false;
  var p = portions[0];
  var g = +p.gramWeight;
  var per100 = f.raw && f.raw.nutrients;
  if (!(g > 0) || !per100) return false;
  var pu = nuScalePer100(per100, g);
  f.serving_description = p.label + ' (' + nuRound(g) + ' g)';
  f.serving_amount = p.amount || 1;
  f.serving_unit = 'serving';
  f.grams = g;
  f.calories = pu.calories; f.protein = pu.protein; f.carbs = pu.carbs;
  f.fat = pu.fat; f.fiber = pu.fiber; f.sugar = pu.sugar;
  if (f.raw) f.raw.portions = portions;      // keep saved raw payload in sync
  return true;
}

// Prefetch household portions for the generic rows of the current result set so
// each row previews its real default serving. Uses the SAME fetch + session
// cache as the card, so tapping a row opens with identical data. Stale-guarded
// by nu_usdaSeq; failures leave the honest 100 g row.
function nuPrefetchPortions() {
  var seq = nu_usdaSeq, dirty = false;
  nu_usdaResults.forEach(function (f) {
    if (f.has_serving || f.usda_fdc_id == null) return;
    if (nu_detailCache[f.usda_fdc_id]) { dirty = nuApplyDefaultPortion(f) || dirty; return; }
    nuFetchUsdaDetail(f.usda_fdc_id).then(function () {
      if (seq !== nu_usdaSeq) return;          // a newer search superseded us
      if (nuApplyDefaultPortion(f)) nuRenderUsdaResults();
    });
  });
  if (dirty) nuRenderUsdaResults();
}

/* ── USDA search view — the DEFAULT path for a new entry ───────────────────── */
// isRoot: true when search is the modal's root (new Add Food) so there's no back
//   arrow — the user reaches the form by picking a result or "enter manually".
// preserve: keep the current query + results (used when returning from the form).
function nuShowUsdaSearch(isRoot, preserve) {
  nu_usdaIsRoot = !!isRoot;
  document.getElementById('nuAddView').style.display    = 'none';
  document.getElementById('nuSearchView').style.display = 'none';
  document.getElementById('nuUsdaView').style.display   = 'block';
  document.getElementById('nuModalTitle').textContent   = isRoot ? 'Add Food' : 'Search Foods';
  // Root search has no back (use ✕); non-root returns to the form via the arrow.
  document.getElementById('nuBackBtn').style.display = isRoot ? 'none' : 'inline-block';

  if (!preserve) {
    document.getElementById('nuUsdaInput').value = '';
    nu_usdaResults = [];
    document.getElementById('nuUsdaResults').innerHTML = '';
    nuUsdaSetStatus('Search the food database to auto-fill calories & macros.');
  }
  nuSyncFavBtn();
  setTimeout(function () { document.getElementById('nuUsdaInput').focus(); }, 60);
}

// Kept name for the form's "Search food database" button — opens a non-root search.
function nuOpenUsda() { nuShowUsdaSearch(false, false); }

// Return from the search view to the form (non-root back arrow).
function nuCloseUsda() {
  var v = document.getElementById('nuUsdaView');
  if (!v || v.style.display === 'none') return false;
  if (nu_usdaAbort) { try { nu_usdaAbort.abort(); } catch (e) {} nu_usdaAbort = null; }
  if (nu_usdaTimer) { clearTimeout(nu_usdaTimer); nu_usdaTimer = null; }
  nuShowForm(nu_formBackTo === 'search');
  return true;
}

// Manual-entry fallback — for custom foods or when USDA has no match. Opens the
// form blank (no carried provenance) so the user types their own macros.
function nuManualEntry() {
  nu_pendingSource = null;
  if (nu_usdaAbort) { try { nu_usdaAbort.abort(); } catch (e) {} nu_usdaAbort = null; }
  if (nu_usdaTimer) { clearTimeout(nu_usdaTimer); nu_usdaTimer = null; }
  document.getElementById('nuName').value     = '';
  document.getElementById('nuCalories').value = '';
  document.getElementById('nuProtein').value  = '';
  document.getElementById('nuCarbs').value    = '';
  document.getElementById('nuFat').value       = '';
  document.getElementById('nuServings').value = 1;
  if (!nu_recentLoaded) { nu_recentLoaded = true; nuLoadRecent(); }
  nu_formBackTo = 'search';            // back arrow returns to the search results
  nuShowForm(true);
  setTimeout(function () { document.getElementById('nuName').focus(); }, 60);
}

// Single back-button dispatcher — context-aware across the modal's sub-panels.
function nuModalBack() {
  var scan = document.getElementById('nuScanView');
  if (scan && scan.style.display !== 'none') { nuCloseScanner(); return; }
  var usda = document.getElementById('nuUsdaView');
  if (usda && usda.style.display !== 'none') { nuCloseUsda(); return; }
  var saved = document.getElementById('nuSearchView');
  if (saved && saved.style.display !== 'none') { nuCloseSearch(); return; }
  // Form is showing — return to the search results it came from.
  if (nu_formBackTo === 'search') nuShowUsdaSearch(nu_usdaIsRoot, true);
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
    nuPrefetchPortions();   // rows update to their true default household serving
  } catch (err) {
    if (err && err.name === 'AbortError') return;         // stale request — ignore
    if (seq !== nu_usdaSeq) return;
    console.error('nuRunUsdaSearch error:', err);
    nuUsdaSetStatus(err && err.message ? err.message : 'Search failed. Try again.', 'error');
  }
}

var NU_GROUP_LABELS = { branded: '⭐ Branded Foods', generic: 'USDA Generic Foods' };

function nuRenderUsdaResults() {
  var list = document.getElementById('nuUsdaResults');
  if (!list) return;
  // Results arrive branded-first (proxy-ranked); insert a header whenever the
  // group changes so branded and generic foods are visually separated.
  var lastGroup = null;
  list.innerHTML = nu_usdaResults.map(function (f, i) {
    var header = '';
    var group = f.group || 'generic';
    if (group !== lastGroup) {
      lastGroup = group;
      header = '<div class="nu-usda-group">' + (NU_GROUP_LABELS[group] || 'USDA Foods') + '</div>';
    }
    var macros = nuRound(f.calories) + ' kcal · P ' + nuRound1(f.protein) +
                 ' · C ' + nuRound1(f.carbs) + ' · F ' + nuRound1(f.fat);
    var sub = (f.brand ? nuEsc(f.brand) + ' · ' : '') + nuEsc(f.serving_description) +
      ' · <span class="nu-verified-sm">✓ USDA</span>';
    return header +
      '<button type="button" class="nu-usda-row" onclick="nuPickUsda(' + i + ')">' +
        '<span class="nu-usda-main">' +
          '<span class="nu-usda-name">' + nuEsc(f.name) + '</span>' +
          '<span class="nu-usda-sub">' + sub + '</span>' +
          '<span class="nu-usda-macros">' + macros + '</span>' +
        '</span>' +
        '<span class="nu-usda-cals">' + nuRound(f.calories) + '<small>kcal</small></span>' +
      '</button>';
  }).join('');
}

// Selecting a USDA result opens the polished selected-food card: name + brand +
// ✓USDA header, a serving dropdown (built from the payload), a quantity stepper,
// and a big live macro readout. The user only picks serving + quantity.
var nu_servingOptions = [];
var nu_servingTouched = false;   // true once the user changes the serving select
var nu_detailCache = {};         // fdcId → trimmed portions[] (session cache)

// Render the serving <select> from nu_servingOptions, selecting `selectedKey`.
function nuRenderServingSelect(selectedKey) {
  var sel = document.getElementById('nuServingSelect');
  if (!sel) return;
  sel.innerHTML = nu_servingOptions.map(function (o) {
    return '<option value="' + o.key + '">' + nuEsc(o.label) + '</option>';
  }).join('');
  if (selectedKey != null) sel.value = selectedKey;
}

// User changed the serving — mark it touched so a late portions fetch won't override.
function nuServingChanged(key) {
  nu_servingTouched = true;
  nuApplyServing(key);
}

function nuPickUsda(i) {
  var f = nu_usdaResults[i];
  if (!f) return;
  nu_pendingSource = f;
  nu_servingTouched = false;
  document.getElementById('nuName').value = f.name;      // logged name keeps the brand suffix

  // Card header.
  document.getElementById('nuCardName').textContent = f.description || f.name;
  var bEl = document.getElementById('nuCardBrand');
  bEl.textContent = f.brand || '';
  bEl.style.display = f.brand ? 'inline-block' : 'none';

  // Same serving rule as the search list (nuDefaultServingKey). Portions already
  // cached by the row prefetch apply synchronously, so the card opens showing
  // exactly what the row previewed; otherwise the async fetch merges them in.
  var cachedPortions = f.usda_fdc_id != null ? nu_detailCache[f.usda_fdc_id] : null;
  nu_servingOptions = nuBuildServingOptions(f, cachedPortions);
  var def = nuDefaultServingKey(f, nu_servingOptions, cachedPortions);
  nuRenderServingSelect(def);
  document.getElementById('nuCustomGrams').value = '';
  document.getElementById('nuServings').value = 1;

  nu_formBackTo = 'search';            // back arrow returns to the search results
  nuShowForm(true);                    // switches the form into USDA-card mode
  nuApplyServing(def);                 // fills hidden inputs + readout for the default serving
  setTimeout(function () { document.getElementById('nuServingSelect').focus(); }, 60);

  // Non-blocking: enrich the dropdown with real household servings when they arrive.
  if (f.usda_fdc_id != null && !cachedPortions) nuLoadPortions(f);
}

// Fetch USDA detail portions (cached, abortable) and merge them into the serving
// dropdown. Purely additive — any failure leaves the 3.1.2 options in place.
async function nuLoadPortions(f) {
  var portions = await nuFetchUsdaDetail(f.usda_fdc_id);
  if (nu_pendingSource !== f) return;          // user moved on — stale result
  if (!portions || !portions.length) return;   // graceful fallback: keep base options

  // Persist the fuller detail (household portions) into the saved raw payload.
  if (f.raw) f.raw.portions = portions;

  var sel = document.getElementById('nuServingSelect');
  var prevKey = sel ? sel.value : null;
  nu_servingOptions = nuBuildServingOptions(f, portions);

  if (!nu_servingTouched && !f.has_serving) {
    // Generic food: default to the primary USDA household serving (egg →
    // 1 large). Foods with a manufacturer serving KEEP it as the default —
    // that's what their search row previewed (portions stay in the dropdown).
    var def = nuDefaultServingKey(f, nu_servingOptions, portions);
    nuRenderServingSelect(def);
    nuApplyServing(def);
  } else {
    // Respect the user's choice; keep it selected if it still exists.
    var keep = nu_servingOptions.some(function (o) { return o.key === prevKey; }) ? prevKey : (sel && sel.value);
    nuRenderServingSelect(keep);
  }
}

// GET trimmed USDA portions for an fdcId. Cached per session; ~3.5s timeout; any
// error/empty returns [] so the caller silently keeps the base serving options.
async function nuFetchUsdaDetail(fdcId) {
  if (nu_detailCache[fdcId]) return nu_detailCache[fdcId];
  try {
    var s = await supabaseClient.auth.getSession();
    var token = s.data.session && s.data.session.access_token;
    if (!token) return [];
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, 3500) : null;
    var res = await fetch('/api/usda-food?fdcId=' + encodeURIComponent(fdcId), {
      headers: { Authorization: 'Bearer ' + token }, signal: ctrl ? ctrl.signal : undefined,
    });
    if (timer) clearTimeout(timer);
    if (!res.ok) return [];
    var data = await res.json();
    var portions = (data && data.portions) || [];
    nu_detailCache[fdcId] = portions;          // cache even [] to avoid refetching
    return portions;
  } catch (e) {
    return [];                                  // network/abort → silent fallback
  }
}

/* ── Barcode scanner (Phase 3.2) ────────────────────────────────────────────
 * Scans a packaged food's UPC/EAN and feeds the matched USDA branded food into
 * the EXISTING flow: /api/usda-barcode returns the same trimmed shape as
 * search, so nuNormalizeUsdaFood → nuPickUsda → serving card → nuSave all run
 * unchanged. Engine: native BarcodeDetector where available, else ZXing UMD
 * lazy-loaded from jsdelivr (SRI-pinned). Structured so later phases (QR,
 * label/receipt scanning) can add engines/formats without reshaping the flow.
 * ─────────────────────────────────────────────────────────────────────────── */
var NU_SCAN_FORMATS  = ['ean_13', 'ean_8', 'upc_a', 'upc_e']; // retail barcodes only (QR later)
var NU_SCAN_COOLDOWN = 2000;      // ms before the same code may trigger again
var NU_ZXING_SRC = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
var NU_ZXING_SRI = 'sha384-BzBxP10ZE72aitqj5UMmUsbKFliP/DZqA8Wq+BNNhlIJDGoEd1tpkMYXOg9+n6sB';

var nu_scanStream  = null;        // getUserMedia stream (native-detector path)
var nu_scanTimer   = null;        // native detect-loop interval
var nu_scanReader  = null;        // ZXing reader (fallback path — owns its stream)
var nu_scanBusy    = false;       // a lookup is in flight — pause detections
var nu_scanTried   = {};          // per-session codes already looked up and not found
var nu_lastScan    = { code: null, at: 0 };
var nu_zxingLoad   = null;        // cached ZXing script-load promise

function nuScanSetStatus(msg, kind) {
  var el = document.getElementById('nuScanStatus');
  if (!el) return;
  el.className = 'nu-scan-status' + (kind ? ' ' + kind : '');
  el.textContent = msg || '';
}

// Open the scanner sub-view (from the USDA search view) and start the camera.
function nuOpenScanner() {
  if (nu_usdaAbort) { try { nu_usdaAbort.abort(); } catch (e) {} nu_usdaAbort = null; }
  if (nu_usdaTimer) { clearTimeout(nu_usdaTimer); nu_usdaTimer = null; }
  document.getElementById('nuUsdaView').style.display = 'none';
  document.getElementById('nuScanView').style.display = 'block';
  document.getElementById('nuModalTitle').textContent = 'Scan Barcode';
  document.getElementById('nuBackBtn').style.display  = 'inline-block';
  document.getElementById('nuScanSearchBtn').style.display = 'none';
  document.getElementById('nuScanCode').value = '';
  nu_scanTried = {};
  nu_lastScan = { code: null, at: 0 };
  nuSyncFavBtn();
  nuScanSetStatus('Starting camera…');
  nuStartCamera();
}

// Stop the scanner and return to the USDA search (preserving its results).
function nuCloseScanner() {
  nuStopScanner();
  document.getElementById('nuScanView').style.display = 'none';
  nuShowUsdaSearch(nu_usdaIsRoot, true);
}

// "Search manually instead" — back to the USDA search with the input focused.
function nuScanToSearch() {
  nuCloseScanner();
  setTimeout(function () { document.getElementById('nuUsdaInput').focus(); }, 80);
}

// Start live scanning. Native BarcodeDetector runs on our own camera stream;
// otherwise ZXing manages the (rear) camera itself. Camera failure NEVER blocks
// the flow — manual barcode entry and the search stay available.
async function nuStartCamera() {
  var video = document.getElementById('nuScanVideo');
  if (!video) return;
  var hasCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  if (!hasCamera) {
    nuScanSetStatus('Camera not supported on this device — type the barcode below.', 'error');
    return;
  }
  // The permission prompt can outlive the scan view (user backs out / closes the
  // modal while it's up) — anything acquired after that must be released at once.
  function scanGone() {
    var v = document.getElementById('nuScanView');
    return !v || v.style.display === 'none';
  }
  try {
    if (typeof window.BarcodeDetector !== 'undefined') {
      var detector = new window.BarcodeDetector({ formats: NU_SCAN_FORMATS });
      nu_scanStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, audio: false,
      });
      if (scanGone()) { nuStopScanner(); return; }
      video.srcObject = nu_scanStream;
      await video.play().catch(function () {});
      nuScanSetStatus('Point your camera at the barcode.');
      nu_scanTimer = setInterval(async function () {
        if (nu_scanBusy || !nu_scanStream || video.readyState < 2) return;
        try {
          var codes = await detector.detect(video);
          if (codes && codes.length) nuScanHit(codes[0].rawValue);
        } catch (e) { /* per-frame detect errors are non-fatal */ }
      }, 250);
    } else {
      await nuLoadZxing();
      if (scanGone()) return;
      var hints = new Map();
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
        ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
        ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
      ]);
      nu_scanReader = new ZXing.BrowserMultiFormatReader(hints);
      // undefined deviceId → ZXing requests the environment (rear) camera.
      await nu_scanReader.decodeFromVideoDevice(undefined, video, function (result) {
        if (result && !nu_scanBusy) nuScanHit(result.getText());
      });
      nuScanSetStatus('Point your camera at the barcode.');
    }
  } catch (err) {
    nuStopScanner();
    var name = err && err.name;
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      nuScanSetStatus('Camera access denied — allow camera in your browser, or type the barcode below.', 'error');
    } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      nuScanSetStatus('No camera found — type the barcode below.', 'error');
    } else {
      console.error('nuStartCamera error:', err);
      nuScanSetStatus('Couldn’t start the camera — type the barcode below.', 'error');
    }
  }
}

// Stop camera tracks / detect loop / ZXing reader. Safe to call repeatedly.
function nuStopScanner() {
  if (nu_scanTimer) { clearInterval(nu_scanTimer); nu_scanTimer = null; }
  if (nu_scanStream) {
    try { nu_scanStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    nu_scanStream = null;
  }
  if (nu_scanReader) {
    try { nu_scanReader.reset(); } catch (e) {}      // stops ZXing's own stream
    nu_scanReader = null;
  }
  var video = document.getElementById('nuScanVideo');
  if (video) video.srcObject = null;
}

// Lazy, SRI-pinned ZXing loader (CSP already allows cdn.jsdelivr.net scripts).
function nuLoadZxing() {
  if (typeof window.ZXing !== 'undefined') return Promise.resolve();
  if (nu_zxingLoad) return nu_zxingLoad;
  nu_zxingLoad = new Promise(function (resolve, reject) {
    var s = document.createElement('script');
    s.src = NU_ZXING_SRC;
    s.integrity = NU_ZXING_SRI;
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = function () { nu_zxingLoad = null; reject(new Error('scanner load failed')); };
    document.head.appendChild(s);
  });
  return nu_zxingLoad;
}

// A code was detected in frame. Debounce: ignore while a lookup is in flight,
// within the cooldown for the same code, or after this code already came back
// not-found this session (the same barcode stays in frame for many frames).
function nuScanHit(raw) {
  var code = String(raw || '').replace(/\D/g, '');
  if (code.length < 8 || code.length > 14) return;
  var now = Date.now();
  if (nu_scanBusy) return;
  if (nu_scanTried[code]) return;
  if (nu_lastScan.code === code && now - nu_lastScan.at < NU_SCAN_COOLDOWN) return;
  nu_lastScan = { code: code, at: now };
  nuBarcodeLookup(code);
}

// Manual barcode entry fallback (works even when the camera never started).
function nuManualBarcode() {
  var code = document.getElementById('nuScanCode').value.replace(/\D/g, '');
  if (code.length < 8 || code.length > 14) {
    nuScanSetStatus('Enter the 8–14 digit barcode number.', 'error');
    return;
  }
  if (!nu_scanBusy) nuBarcodeLookup(code);
}

// Look the code up through the server proxy. Success stops the camera and opens
// the EXISTING selected-food card (nuPickUsda) with the matched food.
async function nuBarcodeLookup(code) {
  nu_scanBusy = true;
  nuScanSetStatus('Looking up ' + code + '…', 'loading');
  try {
    var s = await supabaseClient.auth.getSession();
    var token = s.data.session && s.data.session.access_token;
    if (!token) throw new Error('Not authenticated');
    var res = await fetch('/api/usda-barcode?code=' + encodeURIComponent(code), {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!res.ok) {
      var msg = 'Lookup failed. Try again.';
      try { var j = await res.json(); if (j && j.error) msg = j.error; } catch (e) {}
      throw new Error(msg);
    }
    var data = await res.json();
    if (!data || !data.food) {
      nu_scanTried[code] = true;                  // don't re-hit USDA while it stays in frame
      nuScanSetStatus('Food not found. Search manually instead.', 'error');
      document.getElementById('nuScanSearchBtn').style.display = 'block';
      return;
    }
    // Matched — stop the camera, hand the food to the normal USDA pick flow.
    nuStopScanner();
    document.getElementById('nuScanView').style.display = 'none';
    nu_usdaResults = [nuNormalizeUsdaFood(data.food)];
    nuRenderUsdaResults();                        // back arrow lands on this result
    nuPickUsda(0);
  } catch (err) {
    console.error('nuBarcodeLookup error:', err);
    nuScanSetStatus(err && err.message ? err.message : 'Lookup failed. Try again.', 'error');
  } finally {
    nu_scanBusy = false;
  }
}

/* ── Favorites + Recent foods (Phase 3.3) ───────────────────────────────────
 * Identity (nuFoodKey) lives in food-core.js — PERSISTED format, pinned by
 * regression test. Favorites persist in public.user_food_favorites (RLS:
 * own rows only) and keep the trimmed USDA raw payload, so tapping one
 * reopens the full serving-aware food card through the EXISTING
 * nuNormalizeUsdaFood → nuPickUsda path. Recent foods are derived from
 * food_logs history — no extra save action.
 * ─────────────────────────────────────────────────────────────────────────── */

var nu_favorites  = null;  // favorite rows (newest first); null until first load
var nu_favKeys    = {};    // food_key → true, for O(1) star state
var nu_favBusy    = false; // one toggle in flight at a time
var nu_favLoad    = null;  // in-flight first load (concurrent callers share it)
var nu_editSource = null;  // USDA identity of the log being edited — favorites only

// Shared modal reset: clear carried state and hide every sub-panel. Used by
// BOTH modal entry points (nuOpenModal, nuOpenModalWithFood) so they can't drift.
function nuResetModalState() {
  nu_pendingSource = null;
  nu_editSource = null;
  nu_formBackTo = null;
  document.getElementById('nuSearchView').style.display = 'none';
  var usdaView = document.getElementById('nuUsdaView');
  if (usdaView) usdaView.style.display = 'none';
  var scanView = document.getElementById('nuScanView');
  if (scanView) { nuStopScanner(); scanView.style.display = 'none'; }
  document.getElementById('nuAddView').style.display = 'none';
}

async function nuLoadFavorites(force) {
  if (nu_favorites && !force) return nu_favorites;
  if (nu_favLoad) return nu_favLoad;      // first load in flight — share it
  nu_favLoad = nuRunFavoritesLoad();
  try { return await nu_favLoad; } finally { nu_favLoad = null; }
}

async function nuRunFavoritesLoad() {
  try {
    var s = await supabaseClient.auth.getSession();
    var uid = s.data.session && s.data.session.user && s.data.session.user.id;
    if (!uid) { nu_favorites = []; nu_favKeys = {}; return nu_favorites; }
    var res = await supabaseClient
      .from('user_food_favorites')
      .select('food_key, food_name, brand_name, source, fdc_id, gtin_upc, serving_unit, serving_qty, calories, protein_g, carbs_g, fat_g, raw_food')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    if (res.error) throw res.error;
    nu_favorites = res.data || [];
    nu_favKeys = {};
    nu_favorites.forEach(function (f) { nu_favKeys[f.food_key] = true; });
  } catch (e) {
    console.error('nuLoadFavorites error:', e);
    nu_favorites = nu_favorites || [];
  }
  return nu_favorites;
}

// The food currently shown in the Add/Edit form, as a favorites row (or null
// when there is nothing favoritable yet — e.g. blank manual form). USDA macros
// are the currently selected serving's per-unit values; the raw payload lets the
// card rebuild every serving option regardless.
function nuFavCandidate() {
  function num(id) { var v = parseFloat(document.getElementById(id).value); return isNaN(v) ? null : v; }
  var f = nu_pendingSource;
  if (f && f.usda_fdc_id != null) {
    return {
      food_key: nuFoodKey(f),
      food_name: f.name,
      brand_name: f.brand || null,
      source: 'usda',
      fdc_id: parseInt(f.usda_fdc_id, 10) || null,
      gtin_upc: f.gtin_upc || null,
      serving_unit: f.serving_unit || null,
      serving_qty: f.serving_amount != null ? f.serving_amount : null,
      calories: f.calories, protein_g: f.protein, carbs_g: f.carbs, fat_g: f.fat,
      raw_food: f.raw || null,
    };
  }
  var name = document.getElementById('nuName').value.trim();
  // Editing a USDA-logged entry: keep the food's USDA identity as long as the
  // name is untouched — the SAME rule nuSave uses for provenance. A renamed
  // entry is a different food, so it falls through to the custom key.
  if (nu_editSource && name && name === nu_editSource.name) {
    return {
      food_key: nuFoodKey(nu_editSource),
      food_name: name,
      brand_name: nu_editSource.brand,
      source: 'usda',
      fdc_id: parseInt(nu_editSource.usda_fdc_id, 10) || null,
      gtin_upc: nu_editSource.gtin_upc,
      serving_unit: nu_editSource.serving_unit,
      serving_qty: nu_editSource.serving_amount,
      calories: num('nuCalories'), protein_g: num('nuProtein'),
      carbs_g: num('nuCarbs'), fat_g: num('nuFat'),
      raw_food: null,     // attached at toggle time from the log row (best effort)
    };
  }
  if (!name) return null;
  return {
    food_key: nuFoodKey({ name: name }),
    food_name: name, brand_name: null, source: 'custom',
    fdc_id: null, gtin_upc: null, serving_unit: null, serving_qty: null,
    calories: num('nuCalories'), protein_g: num('nuProtein'),
    carbs_g: num('nuCarbs'), fat_g: num('nuFat'),
    raw_food: null,
  };
}

// Header star: shown only while the Add/Edit form is visible AND the current
// food has an identity. Filled ★ = favorited. Safe to call from any view.
function nuSyncFavBtn() {
  var btn = document.getElementById('nuFavBtn');
  if (!btn) return;
  var formView = document.getElementById('nuAddView');
  var cand = (formView && formView.style.display !== 'none') ? nuFavCandidate() : null;
  if (!cand) { btn.style.display = 'none'; return; }
  btn.style.display = 'inline-block';
  var on = !!nu_favKeys[cand.food_key];
  btn.textContent = on ? '★' : '☆';
  btn.classList.toggle('on', on);
  btn.title = on ? 'Remove from favorites' : 'Save to favorites';
  btn.setAttribute('aria-label', btn.title);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  // First open: favorites may not be loaded yet — refresh the star when they land.
  if (!nu_favorites) nuLoadFavorites().then(function () { nuSyncFavBtn(); });
}

async function nuToggleFavorite() {
  if (nu_favBusy) return;
  var cand = nuFavCandidate();
  if (!cand) { showToast('Enter a food name first.'); return; }
  nu_favBusy = true;
  try {
    var s = await supabaseClient.auth.getSession();
    var uid = s.data.session && s.data.session.user && s.data.session.user.id;
    if (!uid) throw new Error('Not authenticated');
    await nuLoadFavorites();
    if (nu_favKeys[cand.food_key]) {
      var del = await supabaseClient
        .from('user_food_favorites')
        .delete().eq('user_id', uid).eq('food_key', cand.food_key);
      if (del.error) throw del.error;
      delete nu_favKeys[cand.food_key];
      nu_favorites = nu_favorites.filter(function (x) { return x.food_key !== cand.food_key; });
      showToast('Removed from favorites.');
    } else {
      // Favorited from an edited log entry — pull the stored USDA payload so the
      // favorite reopens the full serving card. Best effort: null raw_food just
      // means the favorite opens the prefilled manual form instead.
      if (!cand.raw_food && nu_editSource && nu_editSource.log_id &&
          nuFoodKey(nu_editSource) === cand.food_key) {
        try {
          var rawRes = await supabaseClient
            .from('food_logs')
            .select('raw_source_data')
            .eq('id', nu_editSource.log_id)
            .maybeSingle();
          if (!rawRes.error && rawRes.data && rawRes.data.raw_source_data) {
            cand.raw_food = rawRes.data.raw_source_data;
          }
        } catch (rawErr) { /* non-fatal */ }
      }
      var ins = await supabaseClient
        .from('user_food_favorites')
        .upsert(Object.assign({ user_id: uid }, cand), { onConflict: 'user_id,food_key' })
        .select('food_key').single();
      if (ins.error) throw ins.error;
      nu_favKeys[cand.food_key] = true;
      nu_favorites.unshift(cand);
      showToast('Added to favorites.');
    }
    nuSyncFavBtn();
    if (typeof window.onFavoritesChanged === 'function') window.onFavoritesChanged();
  } catch (e) {
    console.error('nuToggleFavorite error:', e);
    showToast('Error updating favorites — try again.');
  } finally {
    nu_favBusy = false;
  }
}

// Recently LOGGED foods from food_logs history, newest first, de-duplicated by
// nuFoodKey. Macros come back PER SERVING (log snapshots are total, so divide by
// servings) — the same shape favorites use, so both feed nuOpenModalWithFood.
async function nuFetchRecentLogged(userId, limit) {
  try {
    var res = await supabaseClient
      .from('food_logs')
      .select('name, brand, source, usda_fdc_id, gtin_upc, serving_amount, serving_unit, servings, calories, protein, carbs, fat, raw_source_data')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(60);
    if (res.error) throw res.error;
    var seen = {}, out = [];
    (res.data || []).forEach(function (l) {
      var key = nuFoodKey({ usda_fdc_id: l.usda_fdc_id, name: l.name });
      if (!key || seen[key]) return;
      seen[key] = true;
      var div = (+l.servings > 0) ? +l.servings : 1;
      out.push({
        food_key: key,
        name: l.name,
        calories: nuRound1((+l.calories || 0) / div),
        protein:  nuRound1((+l.protein  || 0) / div),
        carbs:    nuRound1((+l.carbs    || 0) / div),
        fat:      nuRound1((+l.fat      || 0) / div),
        raw_food: l.raw_source_data || null,
        // USDA identity — keeps the star on 'usda:<fdcId>' even when the log
        // has no raw payload and reopens as the plain form.
        usda_fdc_id: l.usda_fdc_id != null ? l.usda_fdc_id : null,
        brand: l.brand || null, gtin_upc: l.gtin_upc || null,
        serving_unit: l.serving_unit || null,
        serving_amount: l.serving_amount != null ? l.serving_amount : null,
      });
    });
    return out.slice(0, limit || 10);
  } catch (e) {
    console.error('nuFetchRecentLogged error:', e);
    return [];
  }
}

// Open the shared modal directly on a known food (Recent / Favorites tap).
// item: { name, calories, protein, carbs, fat, raw_food } with PER-SERVING macros.
// A stored USDA payload goes through the SAME normalize → pick path search and
// barcode use (full serving card); anything else opens the manual form prefilled.
function nuOpenModalWithFood(item, opts) {
  opts = opts || {};
  nu_modalDate = opts.date || nuToday();
  document.getElementById('nuFoodId').value = '';
  document.getElementById('nuMeal').value =
    NU_MEALS.indexOf(opts.meal) >= 0 ? opts.meal : 'breakfast';
  document.getElementById('nuModalTitle').textContent = 'Add Food';
  document.getElementById('nuDeleteBtn').style.display = 'none';
  document.getElementById('nuRecentWrap').style.display = 'none';
  nu_recentLoaded = false;
  nuResetModalState();
  document.getElementById('foodModal').classList.add('open');

  var raw = item && item.raw_food;
  if (raw && raw.fdcId != null) {
    // Stored household portions open the card instantly (and stay consistent
    // with any later fetch, which would return the same trimmed portions).
    if (raw.portions && raw.portions.length && !nu_detailCache[raw.fdcId]) {
      nu_detailCache[raw.fdcId] = raw.portions;
    }
    nu_usdaIsRoot = true;                       // back arrow lands on this single result
    nu_usdaResults = [nuNormalizeUsdaFood(raw)];
    nuRenderUsdaResults();
    nuUsdaSetStatus('');
    nuPickUsda(0);
    return;
  }
  // Manual/custom food → plain form, per-serving macros prefilled, quantity 1.
  // A USDA food without a raw payload can't rebuild the serving card, but its
  // identity still matters: the star must keep the 'usda:<fdcId>' key, or
  // re-starring here would create a duplicate 'custom:' favorite. Same
  // name-intact rule as edit mode (nu_editSource).
  if (item && item.usda_fdc_id != null) {
    nu_editSource = {
      log_id: null, name: item.name || '',
      usda_fdc_id: item.usda_fdc_id, brand: item.brand || null,
      gtin_upc: item.gtin_upc || null, serving_unit: item.serving_unit || null,
      serving_amount: item.serving_amount != null ? item.serving_amount : null,
    };
  }
  document.getElementById('nuName').value     = item.name || '';
  document.getElementById('nuCalories').value = item.calories != null ? item.calories : '';
  document.getElementById('nuProtein').value  = item.protein  != null ? item.protein  : '';
  document.getElementById('nuCarbs').value    = item.carbs    != null ? item.carbs    : '';
  document.getElementById('nuFat').value       = item.fat      != null ? item.fat      : '';
  document.getElementById('nuServings').value = 1;
  nuShowForm(false);
  setTimeout(function () { document.getElementById('nuServings').focus(); }, 60);
}

// Apply a chosen serving: compute its PER-UNIT macros, fill the (hidden) macro
// inputs so nuSave is unchanged, sync the USDA provenance to the chosen serving,
// and refresh the live readout. 'custom' reveals a grams field.
function nuApplyServing(key) {
  if (!nu_pendingSource) return;
  var per100 = nu_pendingSource.raw && nu_pendingSource.raw.nutrients;
  var customEl = document.getElementById('nuCustomGrams');
  var pu, grams, amount, unit, desc;

  if (key === 'custom') {
    // Unit follows the food: grams for weight foods, ml for liquids (per-100
    // basis matches — nutrients are per 100 g or per 100 ml respectively).
    var isMl = !!nu_pendingSource.is_liquid;
    if (customEl) {
      customEl.style.display = 'block';
      customEl.placeholder = isMl ? 'ml' : 'grams';
    }
    var g = parseFloat(customEl && customEl.value);
    if (!g || g <= 0) g = 100;
    pu = nuScalePer100(per100, g);
    grams = isMl ? null : g; amount = g; unit = isMl ? 'ml' : 'g';
    desc = nuRound1(g) + (isMl ? ' ml' : ' g');
  } else {
    if (customEl) customEl.style.display = 'none';
    var opt = null;
    for (var i = 0; i < nu_servingOptions.length; i++) {
      if (nu_servingOptions[i].key === key) { opt = nu_servingOptions[i]; break; }
    }
    if (!opt) return;
    pu = opt.perUnit; grams = opt.grams; amount = opt.amount; unit = opt.unit; desc = opt.description;
  }

  // Hidden per-unit inputs (the unchanged save path reads these).
  document.getElementById('nuCalories').value = pu.calories;
  document.getElementById('nuProtein').value  = pu.protein;
  document.getElementById('nuCarbs').value    = pu.carbs;
  document.getElementById('nuFat').value      = pu.fat;
  // Keep provenance in lockstep with the chosen serving.
  nu_pendingSource.calories = pu.calories; nu_pendingSource.protein = pu.protein;
  nu_pendingSource.carbs = pu.carbs; nu_pendingSource.fat = pu.fat;
  nu_pendingSource.fiber = pu.fiber; nu_pendingSource.sugar = pu.sugar;
  nu_pendingSource.grams = (grams != null ? grams : null);
  nu_pendingSource.serving_amount = amount;
  nu_pendingSource.serving_unit = unit;
  nu_pendingSource.serving_description = desc;

  nuUpdateTotalPreview();
}

// Quantity stepper — one centralized 0.25 step. `dir` is a direction (+1 / −1),
// so − then + (or + then −) always returns to the previous value. Rounded to 2dp
// to avoid float drift; never below the 0.25 minimum. Typing still allows decimals.
var NU_SERVING_STEP = 0.25;
var NU_SERVING_MIN  = 0.25;
function nuQtyStep(dir) {
  var el = document.getElementById('nuServings');
  var v = parseFloat(el.value);
  if (isNaN(v)) v = 1;
  v = Math.round((v + dir * NU_SERVING_STEP) * 100) / 100;
  if (v < NU_SERVING_MIN) v = NU_SERVING_MIN;
  el.value = v;
  nuUpdateTotalPreview();          // live macro refresh from the new serving state
}

// Live nutrition = per-unit inputs × quantity. Updates BOTH the manual preview
// line and the big USDA readout (whichever is visible); cheap and idempotent.
function nuUpdateTotalPreview() {
  var sv = parseFloat(document.getElementById('nuServings').value);
  if (!sv || sv <= 0) sv = 1;
  var src = nu_pendingSource;
  // Base per serving: macros from the (hidden) inputs; fiber/sugar from the USDA
  // source when present. Scaled with the SAME function the save path uses.
  var base = {
    calories: parseFloat(document.getElementById('nuCalories').value) || 0,
    protein:  parseFloat(document.getElementById('nuProtein').value)  || 0,
    carbs:    parseFloat(document.getElementById('nuCarbs').value)    || 0,
    fat:      parseFloat(document.getElementById('nuFat').value)      || 0,
    fiber:    src ? (+src.fiber || 0) : 0,
    sugar:    src ? (+src.sugar || 0) : 0,
  };
  var t = nuScaleMacros(base, sv);

  var prev = document.getElementById('nuTotalPreview');
  if (prev) prev.innerHTML = 'Total: <strong>' + t.calories + ' kcal</strong>' +
    ' · P ' + t.protein + ' · C ' + t.carbs + ' · F ' + t.fat;

  function set(id, v) { var e = document.getElementById(id); if (e) e.textContent = v; }
  set('nuRoCal', t.calories); set('nuRoPro', t.protein + 'g'); set('nuRoCarb', t.carbs + 'g'); set('nuRoFat', t.fat + 'g');

  // Second row inside the card: fiber + sugar (USDA only; 0 when USDA has no data).
  var micros = document.getElementById('nuMicros');
  if (micros) {
    if (src) {
      set('nuRoFiber', t.fiber + 'g'); set('nuRoSugar', t.sugar + 'g');
      micros.style.display = 'block';
    } else {
      micros.style.display = 'none';
    }
  }
}

// Clears carried USDA provenance the moment the user hand-edits the food name
// (manual mode only — the name input is hidden during a USDA pick).
function nuNameEdited() {
  if (nu_pendingSource &&
      document.getElementById('nuName').value !== nu_pendingSource.name) {
    nu_pendingSource = null;
  }
  nuSyncFavBtn();          // manual identity is the name — keep the star honest
}

// Reusable modal markup (kept identical on every page that logs food).
/* ── saved meals (Phase 3.4) ───────────────────────────────────────────── */
// A saved meal snapshots one logged meal so the whole thing re-logs in two
// taps. items = array of per-food snapshots with PER-SERVING macros plus the
// serving count and USDA identity (+ raw_food when the log kept one):
//   { food_key, name, servings, calories, protein, carbs, fat, source,
//     usda_fdc_id, brand, gtin_upc, serving_amount, serving_unit,
//     serving_description, grams, fiber, sugar, raw_food }
// Re-adding replays each item through the untouched nuSaveLog path, so
// identity/provenance rules stay exactly the ones single foods use.

async function nuFetchSavedMeals() {
  try {
    var s = await supabaseClient.auth.getSession();
    var uid = s.data.session && s.data.session.user && s.data.session.user.id;
    if (!uid) return [];
    var res = await supabaseClient
      .from('saved_meals')
      .select('id, name, items, updated_at')
      .eq('user_id', uid)
      .order('updated_at', { ascending: false });
    if (res.error) throw res.error;
    return res.data || [];
  } catch (e) {
    console.error('nuFetchSavedMeals error:', e);
    return [];
  }
}

// Snapshot one meal's log rows into items. One extra query pulls the columns
// nuFetchLogs deliberately skips (raw payload, fiber, sugar, grams, serving
// description) — best effort: on failure the items still save without them.
async function nuSnapshotMealItems(rows) {
  var extras = {};
  try {
    var res = await supabaseClient
      .from('food_logs')
      .select('id, fiber, sugar, grams, serving_description, raw_source_data')
      .in('id', rows.map(function (r) { return r.id; }));
    if (!res.error) (res.data || []).forEach(function (x) { extras[x.id] = x; });
  } catch (e) { console.error('nuSnapshotMealItems extras error:', e); }
  return rows.map(function (l) {
    var div = (+l.servings > 0) ? +l.servings : 1;
    var ex = extras[l.id] || {};
    return {
      food_key: nuFoodKey({ usda_fdc_id: l.usda_fdc_id, name: l.name }),
      name: l.name,
      servings: div,
      calories: nuRound1((+l.calories || 0) / div),
      protein:  nuRound1((+l.protein  || 0) / div),
      carbs:    nuRound1((+l.carbs    || 0) / div),
      fat:      nuRound1((+l.fat      || 0) / div),
      source: l.source || null,
      usda_fdc_id: l.usda_fdc_id != null ? l.usda_fdc_id : null,
      brand: l.brand || null,
      gtin_upc: l.gtin_upc || null,
      serving_amount: l.serving_amount != null ? l.serving_amount : null,
      serving_unit: l.serving_unit || null,
      serving_description: ex.serving_description || null,
      grams: ex.grams != null ? nuRound1((+ex.grams || 0) / div) : null,
      fiber: ex.fiber != null ? nuRound1((+ex.fiber || 0) / div) : null,
      sugar: ex.sugar != null ? nuRound1((+ex.sugar || 0) / div) : null,
      raw_food: ex.raw_source_data || null,
    };
  });
}

// Insert-or-update by name (plain unique user_id,name) — re-saving an existing
// name replaces its items, which is v1's "edit saved meal".
async function nuUpsertSavedMeal(name, items) {
  var s = await supabaseClient.auth.getSession();
  var uid = s.data.session && s.data.session.user && s.data.session.user.id;
  if (!uid) throw new Error('Not authenticated');
  var res = await supabaseClient
    .from('saved_meals')
    .upsert(
      { user_id: uid, name: name, items: items, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,name' })
    .select('id').single();
  if (res.error) throw res.error;
  return res.data;
}

async function nuDeleteSavedMeal(id) {
  var res = await supabaseClient.from('saved_meals').delete().eq('id', id);
  if (res.error) throw res.error;
}

function nuSavedMealTotals(items) {
  return (items || []).reduce(function (t, it) {
    var q = (+it.servings > 0) ? +it.servings : 1;
    t.calories += (+it.calories || 0) * q;
    t.protein  += (+it.protein  || 0) * q;
    return t;
  }, { calories: 0, protein: 0 });
}

// Log every item of a saved meal into `meal` on `date`. USDA items rebuild the
// same src shape nuSave passes, so nuSaveLog stamps identity + provenance (and
// re-attaches raw_source_data) exactly as if each food were picked by hand.
async function nuLogSavedMeal(savedMeal, meal, date) {
  var s = await supabaseClient.auth.getSession();
  var uid = s.data.session && s.data.session.user && s.data.session.user.id;
  if (!uid) throw new Error('Not authenticated');
  var items = (savedMeal && savedMeal.items) || [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    // Shape shared with nuAiLogItems via the core's nuBuildSaveSrc — saved-meal
    // items carry every canonical field flat, with the raw payload as raw_food.
    var src = null;
    if (it.usda_fdc_id != null) {
      src = nuBuildSaveSrc({
        name: it.name, usda_fdc_id: it.usda_fdc_id,
        brand: it.brand, gtin_upc: it.gtin_upc,
        serving_amount: it.serving_amount, serving_unit: it.serving_unit,
        serving_description: it.serving_description, grams: it.grams,
        fiber: it.fiber, sugar: it.sugar,
        calories: it.calories, protein: it.protein, carbs: it.carbs, fat: it.fat,
        raw: it.raw_food,
      });
    }
    var res = await nuSaveLog(uid, {
      id: null, name: it.name, meal: meal, date: date,
      servings: (+it.servings > 0) ? +it.servings : 1,
      calories: +it.calories || 0, protein: +it.protein || 0,
      carbs: +it.carbs || 0, fat: +it.fat || 0,
      src: src,
    });
    if (res.error) throw res.error;
  }
  return items.length;
}

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
        '<button class="nu-fav" id="nuFavBtn" style="display:none;" onclick="nuToggleFavorite()" title="Save to favorites">☆</button>' +
        '<button class="modal-close" onclick="nuStopScanner();document.getElementById(\'foodModal\').classList.remove(\'open\')">✕</button>' +
      '</div>' +
      '<div id="nuAddView">' +
        '<input type="hidden" id="nuFoodId">' +
        // manual/edit only — jump (back) to the food-database search
        '<button type="button" class="nu-dbsearch" id="nuDbSearchBtn" onclick="nuOpenUsda()">' +
          '<span class="nu-dbsearch-ico">🔍</span>' +
          '<span>Search food database</span>' +
        '</button>' +
        '<div class="nu-recent" id="nuRecentWrap" style="display:none;">' +
          '<div class="nu-recent-label">Recent foods</div>' +
          '<div class="nu-recent-chips" id="nuRecentChips"></div>' +
        '</div>' +
        // USDA pick only — selected-food card header
        '<div class="nu-card-header" id="nuCardHeader" style="display:none;">' +
          '<div class="nu-card-name" id="nuCardName"></div>' +
          '<div class="nu-card-meta">' +
            '<span class="nu-card-brand" id="nuCardBrand" style="display:none;"></span>' +
            '<span class="nu-verified">✓ USDA</span>' +
          '</div>' +
        '</div>' +
        // manual/edit only — editable food name
        '<div class="field-group" id="nuNameGroup">' +
          '<label class="field-label">Food</label>' +
          '<input type="text" id="nuName" maxlength="80" placeholder="e.g. Chicken breast, 6 oz" oninput="nuNameEdited()">' +
        '</div>' +
        // USDA pick only — serving-size dropdown (+ optional custom grams)
        '<div class="field-group" id="nuServingRow" style="display:none;">' +
          '<label class="field-label">Serving</label>' +
          '<select id="nuServingSelect" onchange="nuServingChanged(this.value)"></select>' +
          '<input type="number" id="nuCustomGrams" class="nu-custom-grams" style="display:none;" inputmode="decimal" step="1" min="1" placeholder="grams" oninput="nuApplyServing(\'custom\')">' +
        '</div>' +
        // common — meal + quantity stepper
        '<div class="nu-row" id="nuMealQtyRow">' +
          '<div class="field-group">' +
            '<label class="field-label">Meal</label>' +
            '<select id="nuMeal">' + mealOpts + '</select>' +
          '</div>' +
          '<div class="field-group">' +
            '<label class="field-label">Quantity</label>' +
            '<div class="nu-stepper">' +
              '<button type="button" class="nu-step" onclick="nuQtyStep(-1)" aria-label="Decrease quantity">−</button>' +
              '<input type="number" id="nuServings" inputmode="decimal" step="0.25" min="0.25" value="1" oninput="nuUpdateTotalPreview()">' +
              '<button type="button" class="nu-step" onclick="nuQtyStep(1)" aria-label="Increase quantity">+</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        // manual/edit only — editable per-serving macro inputs + small preview
        '<div id="nuManualMacros">' +
          '<div class="field-hint">Values below are per serving — quantity scales them.</div>' +
          '<div class="nu-row nu-row-4">' +
            '<div class="field-group">' +
              '<label class="field-label">Calories</label>' +
              '<input type="number" id="nuCalories" inputmode="numeric" step="1" min="0" placeholder="0" oninput="nuUpdateTotalPreview()">' +
            '</div>' +
            '<div class="field-group">' +
              '<label class="field-label">Protein (g)</label>' +
              '<input type="number" id="nuProtein" inputmode="decimal" step="0.1" min="0" placeholder="0" oninput="nuUpdateTotalPreview()">' +
            '</div>' +
            '<div class="field-group">' +
              '<label class="field-label">Carbs (g)</label>' +
              '<input type="number" id="nuCarbs" inputmode="decimal" step="0.1" min="0" placeholder="0" oninput="nuUpdateTotalPreview()">' +
            '</div>' +
            '<div class="field-group">' +
              '<label class="field-label">Fat (g)</label>' +
              '<input type="number" id="nuFat" inputmode="decimal" step="0.1" min="0" placeholder="0" oninput="nuUpdateTotalPreview()">' +
            '</div>' +
          '</div>' +
          '<div class="nu-total-preview" id="nuTotalPreview"></div>' +
        '</div>' +
        // USDA pick only — live nutrition card (chosen serving × quantity).
        // Primary macros up top; fiber + sugar on a quieter second row inside the card.
        '<div class="nu-readout" id="nuMacroReadout" style="display:none;">' +
          '<div class="nu-readout-row">' +
            '<div class="nu-readout-cell cal"><div class="nu-readout-num" id="nuRoCal">0</div><div class="nu-readout-lab">Calories</div></div>' +
            '<div class="nu-readout-cell"><div class="nu-readout-num" id="nuRoPro">0g</div><div class="nu-readout-lab">Protein</div></div>' +
            '<div class="nu-readout-cell"><div class="nu-readout-num" id="nuRoCarb">0g</div><div class="nu-readout-lab">Carbs</div></div>' +
            '<div class="nu-readout-cell"><div class="nu-readout-num" id="nuRoFat">0g</div><div class="nu-readout-lab">Fat</div></div>' +
          '</div>' +
          '<div class="nu-readout-sub" id="nuMicros" style="display:none;">' +
            '<div class="nu-readout-divider"></div>' +
            '<div class="nu-readout-row nu-readout-row-2">' +
              '<div class="nu-readout-cell nu-readout-cell-sm"><div class="nu-readout-num" id="nuRoFiber">0g</div><div class="nu-readout-lab">Fiber</div></div>' +
              '<div class="nu-readout-cell nu-readout-cell-sm"><div class="nu-readout-num" id="nuRoSugar">0g</div><div class="nu-readout-lab">Sugar</div></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<button class="btn-calc" id="nuSaveBtn" onclick="nuSave()">Add Food</button>' +
        '<button class="btn-delete-log" id="nuDeleteBtn" style="display:none;" onclick="nuDeleteFromModal()">Delete Entry</button>' +
      '</div>' +
      '<div id="nuSearchView" style="display:none;">' +
        '<input type="text" class="nu-search-input" id="nuSearch" maxlength="80" placeholder="Search saved foods…" oninput="nuFilterSaved()">' +
        '<div class="nu-saved-list" id="nuSearchList"></div>' +
      '</div>' +
      '<div id="nuUsdaView" style="display:none;">' +
        '<input type="text" class="nu-search-input" id="nuUsdaInput" maxlength="80" autocomplete="off" placeholder="Search foods (e.g. chicken breast)…" oninput="nuUsdaInputChanged()">' +
        '<button type="button" class="nu-dbsearch nu-scan-btn" onclick="nuOpenScanner()">' +
          '<span class="nu-dbsearch-ico">📷</span>' +
          '<span>Scan a barcode</span>' +
        '</button>' +
        '<div class="nu-usda-status" id="nuUsdaStatus"></div>' +
        '<div class="nu-usda-list" id="nuUsdaResults"></div>' +
        '<button type="button" class="nu-usda-manual" onclick="nuManualEntry()">Can\'t find it? Enter food manually →</button>' +
      '</div>' +
      '<div id="nuScanView" style="display:none;">' +
        '<div class="nu-scan-frame">' +
          '<video id="nuScanVideo" playsinline muted autoplay></video>' +
        '</div>' +
        '<div class="nu-scan-status" id="nuScanStatus"></div>' +
        '<button type="button" class="nu-usda-manual" id="nuScanSearchBtn" style="display:none;" onclick="nuScanToSearch()">Search manually instead →</button>' +
        '<div class="field-group nu-scan-manual">' +
          '<label class="field-label">Or type the barcode number</label>' +
          '<div class="nu-scan-manual-row">' +
            '<input type="text" id="nuScanCode" inputmode="numeric" autocomplete="off" maxlength="14" placeholder="e.g. 016000275287" onkeydown="if(event.key===\'Enter\')nuManualBarcode()">' +
            '<button type="button" class="nu-scan-lookup" onclick="nuManualBarcode()">Look up</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

/* ── Phase 4.2: natural-language quick log (AI parse → USDA match) ──────────
 * "2 eggs and toast with peanut butter" → /api/ai-food-parse returns
 * structured items (search query + quantity/unit ONLY — never nutrition), and
 * each item is resolved through the SAME pipeline as a hand-picked food:
 * nuUsdaSearch → nuNormalizeUsdaFood → portions from nu_detailCache →
 * nuBuildServingOptions. Logging replays nuSaveLog with the exact src shape
 * nuLogSavedMeal uses, so identity/provenance/foods-dedupe stay shared.
 * Self-contained section — nothing above this line changed.
 * ────────────────────────────────────────────────────────────────────────── */

// POST the raw text to the parse route (auth mirrors nuUsdaSearch).
async function nuAiParse(text) {
  var s = await supabaseClient.auth.getSession();
  var token = s.data.session && s.data.session.access_token;
  if (!token) throw new Error('Not authenticated');
  var res = await fetch('/api/ai-food-parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ text: text }),
  });
  var data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    var err = new Error((data && data.error) || 'AI logging failed.');
    err.status = res.status;
    throw err;
  }
  return data; // { items, meal, remaining }
}

// Measure tables, serving choice, and confidence (NU_APPROX_UNITS,
// NU_VOLUME_ML, NU_CUP_GRAMS, nuAiCupServing, nuAiLabelCount,
// nuAiChooseServing, NU_ASK_CATEGORIES, nuAiIsConfident) live in
// food-core.js.

// Chooser dedupe (nuAiChoicesAlike, NU_SIG_FILLER, nuAiNameSig,
// nuAiDedupeChoices) lives in food-core.js.

// The resolution pipeline itself lives in food-core.js (nuCreateResolver) —
// this file binds the BROWSER source adapter (the authenticated proxy fetch
// wrappers above) and keeps the original global names for every call site.
var nu_resolver = nuCreateResolver({ search: nuUsdaSearch, portions: nuFetchUsdaDetail });
function nuAiResolveFood(rawFood, parsed) { return nu_resolver.resolveFood(rawFood, parsed); }
function nuAiResolveItem(parsed) { return nu_resolver.resolveItem(parsed); }
function nuAiResolveChoice(item, ci) { return nu_resolver.resolveChoice(item, ci); }
function nuAiResolveClarification(item, choice) { return nu_resolver.resolveClarification(item, choice); }

/* ── Correction memory capture (Phase 4.2.4) ─────────────────────────────────
 * A bounded, request-scoped SESSION store of explicit corrections, plus a
 * best-effort PERSISTENT write under RLS (same client-write pattern as
 * favorites). The resolver never reranks — captured corrections reach ranking
 * only via nuUsdaSearch's X-Correction-Context header + the server's persistent
 * lookup, both feeding the shared nmCorrectionSignal. Every step is guarded:
 * capturing/persisting a correction can never break logging. */
var nu_corrections = [];   // in-memory session store (bounded by nmSessionAdd)

// Record an explicit chooser correction: the user picked a candidate OTHER than
// the top hit. Updates the session store immediately, then persists best-effort.
function nuRecordCorrection(item, ci) {
  if (typeof nmIsExplicitCorrection !== 'function' || !nmIsExplicitCorrection(item, ci)) return;
  var ev;
  try {
    ev = nmBuildCorrectionEvent({
      request: item.parsed || {}, choices: item.choices, chosenIndex: ci,
      sourceSurface: 'ai_quick_log', provenance: 'choose_candidate',
    });
  } catch (e) { return; }
  if (!ev || !ev.corrected_key || !ev.norm_query) return;
  nu_corrections = nmSessionAdd(nu_corrections, ev);
  nuPersistCorrection(ev);   // fire-and-forget; session learning already applied
}

// Persist a correction for the authenticated user (RLS enforces ownership).
// Idempotent by (user_id, norm_query, corrected_key): a repeat REINFORCES the
// row; a contradictory correction for the same query supersedes the old ones.
// Never throws — a storage failure leaves session learning fully intact.
async function nuPersistCorrection(ev) {
  try {
    var s = await supabaseClient.auth.getSession();
    var uid = s.data.session && s.data.session.user && s.data.session.user.id;
    if (!uid) return;
    // Contradiction policy: same query, a DIFFERENT corrected food → retire the
    // prior active rows for this query so exactly one preference stays dominant.
    await supabaseClient.from('food_corrections')
      .update({ status: 'superseded', updated_at: new Date().toISOString() })
      .eq('user_id', uid).eq('norm_query', ev.norm_query).eq('status', 'active')
      .neq('corrected_key', ev.corrected_key);
    // Reinforce an identical prior correction, else insert a fresh one.
    var found = await supabaseClient.from('food_corrections')
      .select('id, reinforcement_count')
      .eq('user_id', uid).eq('norm_query', ev.norm_query).eq('corrected_key', ev.corrected_key)
      .limit(1).maybeSingle();
    if (found.data && found.data.id) {
      await supabaseClient.from('food_corrections').update({
        reinforcement_count: (+found.data.reinforcement_count || 1) + 1,
        status: 'active',
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', found.data.id);
    } else {
      await supabaseClient.from('food_corrections').insert({
        user_id: uid,
        schema_version: ev.schema_version,
        status: 'active',
        raw_query: ev.raw_query,
        norm_query: ev.norm_query,
        intent_key: ev.intent_key,
        incorrect_key: ev.incorrect_key,
        corrected_key: ev.corrected_key,
        incorrect_meta: ev.incorrect_meta,
        corrected_meta: ev.corrected_meta,
        source_surface: ev.source_surface,
        provenance: ev.provenance,
        confidence_before: ev.confidence_before,
        ambiguity: ev.ambiguity,
        reinforcement_count: 1,
        last_used_at: ev.last_used_at,
      });
    }
  } catch (e) {
    console.error('nuPersistCorrection error (non-fatal):', e);
  }
}

// Friendly display names (nuAiDisplayName + its tables, nuNameSingular,
// nuTitleCase) and nuAiTotals live in food-core.js.

// Log every CONFIRMED item into `meal` on `date`. Rebuilds the same src shape
// nuSave passes for a hand-picked USDA food (see nuLogSavedMeal), so nuSaveLog
// stamps identity + provenance identically. Returns the number logged.
async function nuAiLogItems(items, meal, date) {
  var s = await supabaseClient.auth.getSession();
  var uid = s.data.session && s.data.session.user && s.data.session.user.id;
  if (!uid) throw new Error('Not authenticated');
  var count = 0;
  for (var i = 0; i < (items || []).length; i++) {
    var it = items[i];
    if (it.unmatched || it.needsChoice || it.needsClarification) continue;
    var f = it.food, pu = it.perUnit || {};
    // Shape shared with nuLogSavedMeal via the core's nuBuildSaveSrc — identity
    // from the resolved food, serving from the ResolvedItem, macros per-unit.
    var src = nuBuildSaveSrc({
      name: f.name, usda_fdc_id: f.usda_fdc_id,
      brand: f.brand, gtin_upc: f.gtin_upc,
      serving_amount: it.serving_amount, serving_unit: it.serving_unit,
      serving_description: it.serving_description, grams: it.grams,
      fiber: pu.fiber, sugar: pu.sugar,
      calories: pu.calories, protein: pu.protein, carbs: pu.carbs, fat: pu.fat,
      raw: f.raw,
    });
    var res = await nuSaveLog(uid, {
      id: null, name: f.name, meal: meal, date: date,
      servings: (+it.servings > 0) ? +it.servings : 1,
      calories: +pu.calories || 0, protein: +pu.protein || 0,
      carbs: +pu.carbs || 0, fat: +pu.fat || 0,
      src: src,
    });
    if (res.error) throw res.error;
    count++;
  }
  return count;
}
