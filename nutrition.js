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
async function nuUpsertFood(userId, food) {
  try {
    var res = await supabaseClient
      .from('foods')
      .upsert(
        {
          user_id: userId,
          name: food.name,
          default_calories: food.calories,
          default_protein: food.protein,
          default_carbs: food.carbs,
          default_fat: food.fat,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,name' } // matches the plain unique index on (user_id, name)
      )
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
async function nuSaveLog(userId, entry) {
  var servings = entry.servings != null ? +entry.servings : 1;
  var perCal = +entry.calories || 0, perP = +entry.protein || 0, perC = +entry.carbs || 0, perF = +entry.fat || 0;

  // Keep a reusable food definition in sync (best-effort; null is acceptable).
  var foodId = await nuUpsertFood(userId, {
    name: entry.name, calories: perCal, protein: perP, carbs: perC, fat: perF,
  });

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
    var res = await nuSaveLog(uid, {
      id: document.getElementById('nuFoodId').value || null,
      name: name, meal: meal, servings: servings,
      date: nu_modalDate || nuToday(),
      calories: calories,
      protein: isNaN(protein) ? 0 : protein,
      carbs:   isNaN(carbs)   ? 0 : carbs,
      fat:     isNaN(fat)     ? 0 : fat,
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
// Fire-and-forget loader: the modal opens immediately, chips fill in when ready.
async function nuLoadRecent() {
  try {
    var s = await supabaseClient.auth.getSession();
    var uid = s.data.session && s.data.session.user && s.data.session.user.id;
    if (!uid) { nuRenderRecent([]); return; }
    var foods = await nuFetchRecentFoods(uid, 12);
    nuRenderRecent(foods);
  } catch (e) {
    console.error('nuLoadRecent error:', e);
    nuRenderRecent([]);
  }
}

function nuRenderRecent(foods) {
  var wrap = document.getElementById('nuRecentWrap');
  var chips = document.getElementById('nuRecentChips');
  if (!wrap || !chips) return;
  if (!foods || !foods.length) { wrap.style.display = 'none'; chips.innerHTML = ''; return; }
  chips.innerHTML = foods.map(function (f) {
    return '<button type="button" class="nu-chip"' +
      ' data-name="' + nuEsc(f.name) + '"' +
      ' data-cal="' + (+f.default_calories || 0) + '"' +
      ' data-p="' + (+f.default_protein || 0) + '"' +
      ' data-c="' + (+f.default_carbs || 0) + '"' +
      ' data-f="' + (+f.default_fat || 0) + '"' +
      ' onclick="nuPickRecent(this)">' +
      '<span class="nu-chip-name">' + nuEsc(f.name) + '</span>' +
      '<span class="nu-chip-cal">' + nuRound(f.default_calories) + '</span>' +
    '</button>';
  }).join('');
  wrap.style.display = 'block';
}

// Prefill name + per-serving macros from a saved food. Servings resets to 1 and
// the meal selection is left as-is so the user can still adjust before saving.
function nuPickRecent(el) {
  document.getElementById('nuName').value     = el.getAttribute('data-name');
  document.getElementById('nuCalories').value = el.getAttribute('data-cal');
  document.getElementById('nuProtein').value  = el.getAttribute('data-p');
  document.getElementById('nuCarbs').value    = el.getAttribute('data-c');
  document.getElementById('nuFat').value      = el.getAttribute('data-f');
  document.getElementById('nuServings').value = 1;
  document.getElementById('nuServings').focus();
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
        '<div class="modal-title" id="nuModalTitle">Add Food</div>' +
        '<button class="modal-close" onclick="document.getElementById(\'foodModal\').classList.remove(\'open\')">✕</button>' +
      '</div>' +
      '<input type="hidden" id="nuFoodId">' +
      '<div class="nu-recent" id="nuRecentWrap" style="display:none;">' +
        '<div class="nu-recent-label">Recent foods</div>' +
        '<div class="nu-recent-chips" id="nuRecentChips"></div>' +
      '</div>' +
      '<div class="field-group">' +
        '<label class="field-label">Food</label>' +
        '<input type="text" id="nuName" maxlength="80" placeholder="e.g. Chicken breast, 6 oz">' +
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
  '</div>';
}
