// api/_off.js — Open Food Facts helpers shared by two routes. The leading
// underscore keeps Vercel from serving this file as a function.
//
// Open Food Facts is a free, crowd-sourced database ("no assurances that the
// data is accurate"). Owner-approved uses (AGENTS.md §17):
//   • /api/usda-barcode — when USDA has no product for a scanned barcode;
//   • /api/usda-search  — when USDA has nothing for a word the member typed
//     (usually a brand USDA does not carry, e.g. "royo"). Returned as a
//     SEPARATE `community` list, never mixed into the ranked `foods`, so
//     ranking, Quick Log and every benchmark see exactly what they saw before.
// Every food from here passes offToFood's completeness + plausibility gate, is
// flagged `unverified`, is labelled "Unverified · Open Food Facts" in the UI,
// and is logged as a MANUAL entry — never with USDA provenance.

'use strict';

const OFF_USER_AGENT = 'MuscleMotivation/1.0 (https://musclemotivation.fit)';

function offNumber(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null;
  const n = +v;
  return (isFinite(n) && n >= 0) ? n : null;
}
function round1(n) { return Math.round(n * 10) / 10; }

// The product's label serving, or null when it is missing or unusable. Pure.
function offServing(product) {
  const size = offNumber(product && product.serving_quantity);
  const unit = String((product && product.serving_quantity_unit) || 'g').toLowerCase();
  if (size === null || !(size > 0) || size > 2000 || (unit !== 'g' && unit !== 'ml')) return null;
  return { servingSize: size, servingSizeUnit: unit,
    householdServing: String(product.serving_size || '').replace(/\s+/g, ' ').trim().slice(0, 60) };
}

// Open Food Facts product → the SAME trimmed shape trimFood returns, plus
// `source: 'off'` / `unverified: true`. Returns null unless the panel is
// complete and plausible. Pure.
function offToFood(product, code) {
  if (!product || typeof product !== 'object') return null;
  const name = String(product.product_name || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!name) return null;
  const n = (product.nutriments && typeof product.nutriments === 'object') ? product.nutriments : {};

  let kcal = offNumber(n['energy-kcal_100g']);
  if (kcal === null) {
    const kj = offNumber(n['energy-kj_100g']) !== null ? offNumber(n['energy-kj_100g']) : offNumber(n['energy_100g']);
    if (kj !== null) kcal = kj / 4.184;
  }
  const protein = offNumber(n['proteins_100g']);
  const carbs   = offNumber(n['carbohydrates_100g']);
  const fat     = offNumber(n['fat_100g']);
  if (kcal === null || protein === null || carbs === null || fat === null) return null;   // incomplete panel
  if (kcal > 900 || protein > 100 || carbs > 100 || fat > 100 || protein + carbs + fat > 105) return null;
  // Energy must roughly agree with the macros (Atwater). US labels count fiber
  // and sugar alcohols inside total carbs, yet they carry ~0–2 kcal/g, so a
  // high-fiber or keto product (Royo bread: 50 g carbs, 38 g of it fiber) is
  // legitimately far below 4 kcal per carb gram. Accept energy anywhere in the
  // band from "those carbs count zero" to "every carb counts 4", with the
  // usual tolerance at each end. Without fiber/polyol data the band collapses
  // to the original single estimate.
  const fiber   = offNumber(n['fiber_100g']) || 0;
  const polyols = offNumber(n['polyols_100g']) || 0;
  const lowCarbs = Math.max(0, carbs - Math.min(carbs, fiber + polyols));
  const high = 4 * protein + 4 * carbs + 9 * fat;
  const low  = 4 * protein + 4 * lowCarbs + 9 * fat;
  const tol = (e) => Math.max(0.25 * Math.max(kcal, e), 30);
  if (kcal < low - tol(low) || kcal > high + tol(high)) return null;   // energy disagrees with macros

  const sv = offServing(product);
  const brand = String(product.brands || '').split(',')[0].replace(/\s+/g, ' ').trim().slice(0, 60);

  return {
    fdcId: null,                              // not a USDA food — no USDA identity
    description: name,
    dataType: 'Open Food Facts',
    foodCategory: '',
    brand: brand,
    gtinUpc: String(code || product.code || '').replace(/\D/g, ''),
    servingSize: sv ? sv.servingSize : null,
    servingSizeUnit: sv ? sv.servingSizeUnit : '',
    householdServing: sv ? sv.householdServing : '',
    nutrients: {
      kcal: Math.round(kcal),
      protein: round1(protein), carbs: round1(carbs), fat: round1(fat),
      fiber: round1(offNumber(n['fiber_100g']) || 0),
      sugar: round1(offNumber(n['sugars_100g']) || 0),
    },
    group: 'branded',
    source: 'off',
    unverified: true,
  };
}

/* ── search fallback ─────────────────────────────────────────────────────── */

// Words that never name a food on their own: measures and sizes the member
// may type with a search ("2 slices royo bread").
const OFF_IGNORE_WORDS = new Set(['and', 'with', 'the', 'for', 'cup', 'cups', 'slice', 'slices', 'tbsp', 'tsp',
  'gram', 'grams', 'piece', 'pieces', 'serving', 'servings', 'large', 'small', 'medium', 'scoop', 'scoops',
  'ounce', 'ounces', 'half', 'whole', 'plain']);

function offWords(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}
// The query words worth checking: 4+ letters, no digits, not a measure word.
function offQueryWords(query) {
  return offWords(query).filter(function (w) { return w.length >= 4 && !/\d/.test(w) && !OFF_IGNORE_WORDS.has(w); });
}
// A food "covers" a word when one of its words starts with it, or the word
// starts with one of its words of 4+ letters (plural/singular: bagel ~ bagels).
function offCovers(foodWords, w) {
  return foodWords.some(function (fw) { return fw.startsWith(w) || (fw.length >= 4 && w.startsWith(fw)); });
}
function offFoodWords(f) {
  return offWords((f && f.description || '') + ' ' + (f && f.brand || ''));
}

// The query words NO USDA result mentions — the trigger for the fallback.
// "royo" against a Rolo-only result list → ['royo']; "chicken breast" → [].
// Pure.
function missingQueryWords(query, foods) {
  const words = offQueryWords(query);
  if (!words.length) return [];
  const pool = (foods || []).slice(0, 25).map(offFoodWords);
  return words.filter(function (w) { return !pool.some(function (fw) { return offCovers(fw, w); }); });
}

// Search-a-licious, Open Food Facts' current search service. Checked live
// 2026-11-22: ~0.12 s a call, no throttling over repeated calls, while the
// legacy cgi/search.pl answered 503 on the second call within seconds. Its
// index carries names, brands and nutriments but NO serving fields, so the top
// results' label servings come from the product API (same endpoint and fields
// as the barcode fallback).
const OFF_SEARCH_ENDPOINT = 'https://search.openfoodfacts.org/search';
const OFF_SEARCH_FIELDS   = 'code,product_name,brands,nutriments';
const OFF_PRODUCT_ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product/';
const OFF_SEARCH_TIMEOUT_MS = 2000;
const OFF_SERVING_TIMEOUT_MS = 1500;
const OFF_SEARCH_PAGE = 24;
const OFF_SEARCH_MAX  = 8;
const OFF_SERVING_DETAIL = 4;       // label servings fetched for this many top results
// Polite per-warm-instance caps; answers (hits AND misses) memoized an hour.
const OFF_SEARCH_PER_MIN = 20;
const OFF_PRODUCT_PER_MIN = 12;     // the product API asks for ≤15/minute per IP
const OFF_SEARCH_MEMO_TTL_MS = 60 * 60 * 1000;
const OFF_SEARCH_MEMO_MAX = 200;
const offSearchMemo = new Map();   // normalized query → { at, foods }
const offSearchCalls = [];         // timestamps of recent search calls
const offServingMemo = new Map();  // barcode → { at, serving }  (serving may be null)
const offProductCalls = [];        // timestamps of recent product calls

// Sliding one-minute budget. Returns false (and records nothing) when spent.
function offTake(calls, perMin) {
  const now = Date.now();
  while (calls.length && now - calls[0] > 60 * 1000) calls.shift();
  if (calls.length >= perMin) return false;
  calls.push(now);
  return true;
}

function offSearchUrl(query) {
  return OFF_SEARCH_ENDPOINT + '?q=' + encodeURIComponent(query + ' countries_tags:"en:united-states"') +
    '&page_size=' + OFF_SEARCH_PAGE + '&fields=' + OFF_SEARCH_FIELDS;
}

async function offFetchJson(url, ms) {
  const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  const timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': OFF_USER_AGENT, Accept: 'application/json' },
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (!r.ok) { const e = new Error('upstream ' + r.status); e.status = r.status; throw e; }
    return await r.json();
  } finally { clearTimeout(timer); }
}

// The label serving for one barcode, or null. Never throws; memoized.
async function offFetchServing(code) {
  const key = String(code || '').replace(/\D/g, '');
  if (!key) return null;
  const hit = offServingMemo.get(key);
  if (hit && Date.now() - hit.at < OFF_SEARCH_MEMO_TTL_MS) return hit.serving;
  if (!offTake(offProductCalls, OFF_PRODUCT_PER_MIN)) return null;
  try {
    const d = await offFetchJson(OFF_PRODUCT_ENDPOINT + key + '?fields=code,serving_size,serving_quantity,serving_quantity_unit',
      OFF_SERVING_TIMEOUT_MS);
    const serving = (d && d.product) ? offServing(d.product) : null;
    offServingMemo.set(key, { at: Date.now(), serving: serving });
    while (offServingMemo.size > OFF_SEARCH_MEMO_MAX) offServingMemo.delete(offServingMemo.keys().next().value);
    return serving;
  } catch (e) {
    return null;                                    // not remembered: try again next time
  }
}

// Fill label servings for the first OFF_SERVING_DETAIL foods (in place).
async function addServings(foods) {
  const top = foods.slice(0, OFF_SERVING_DETAIL).filter(function (f) { return !f.servingSize && f.gtinUpc; });
  const servings = await Promise.all(top.map(function (f) { return offFetchServing(f.gtinUpc); }));
  top.forEach(function (f, i) {
    const sv = servings[i];
    if (sv) { f.servingSize = sv.servingSize; f.servingSizeUnit = sv.servingSizeUnit; f.householdServing = sv.householdServing; }
  });
  return foods;
}

// Raw OFF products → at most OFF_SEARCH_MAX plausible foods that mention every
// word USDA was missing, best match first, duplicates (same name + brand) once.
// Pure.
function communityFoods(products, query, missing) {
  const want = (missing && missing.length) ? missing : offQueryWords(query);
  const all = offQueryWords(query);
  const seen = new Set();
  const out = [];
  (products || []).forEach(function (p, i) {
    const f = offToFood(p, p && p.code);
    if (!f) return;
    const fw = offFoodWords(f);
    if (!want.every(function (w) { return offCovers(fw, w); })) return;   // must be about what was missing
    const key = (f.brand + '|' + f.description).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    f.group = 'community';
    out.push({ f: f, hits: all.filter(function (w) { return offCovers(fw, w); }).length, i: i });
  });
  out.sort(function (a, b) { return (b.hits - a.hits) || (a.i - b.i); });
  return out.slice(0, OFF_SEARCH_MAX).map(function (x) { return x.f; });
}

// → { foods, ok }. ok=false means "could not ask" (rate cap, timeout, network):
// the caller must not store that answer durably. Never throws.
async function searchOpenFoodFacts(query, missing) {
  const key = offWords(query).join(' ');
  if (!key) return { foods: [], ok: true };
  const hit = offSearchMemo.get(key);
  if (hit && Date.now() - hit.at < OFF_SEARCH_MEMO_TTL_MS) return { foods: JSON.parse(JSON.stringify(hit.foods)), ok: true };

  if (!offTake(offSearchCalls, OFF_SEARCH_PER_MIN)) return { foods: [], ok: false };

  try {
    const d = await offFetchJson(offSearchUrl(key), OFF_SEARCH_TIMEOUT_MS);
    const foods = await addServings(communityFoods(d && (d.hits || d.products), key, missing));
    offSearchMemo.set(key, { at: Date.now(), foods: JSON.parse(JSON.stringify(foods)) });
    while (offSearchMemo.size > OFF_SEARCH_MEMO_MAX) offSearchMemo.delete(offSearchMemo.keys().next().value);
    return { foods: foods, ok: true };
  } catch (e) {
    return { foods: [], ok: false };
  }
}

module.exports = {
  OFF_USER_AGENT, offNumber, offToFood,
  missingQueryWords, communityFoods, searchOpenFoodFacts, offSearchUrl,
  offServing, offFetchServing, addServings,
  offSearchMemo, offSearchCalls, offServingMemo, offProductCalls,
  OFF_SEARCH_PER_MIN, OFF_PRODUCT_PER_MIN, OFF_SEARCH_MAX, OFF_SERVING_DETAIL, OFF_SEARCH_ENDPOINT, OFF_PRODUCT_ENDPOINT,
};
