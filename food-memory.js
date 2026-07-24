// food-memory.js — Shared Correction Memory core (Phase 4.2.4)
//
// The pure, DOM-free, fetch-free intelligence that lets food resolution LEARN
// from explicit user corrections. Like food-core.js / food-ranking.js it runs in
// two runtimes:
//   • Browser — loaded via <script> AFTER food-core.js and food-ranking.js (it
//     reuses their globals: nuFoodKey, NU_PREP_STATE, nuAiNameSig, nText,
//     tokenize, stem, stemTokens, queryBrandEntries).
//   • Node — guarded module.exports (same pattern as the other shared modules);
//     api/usda-search.js, tests, and benchmarks require() the EXACT production
//     logic and run it offline.
//
// ── Where this sits in the architecture (server-authoritative, one seam) ──────
// rankFoodCandidates (food-ranking.js) stays the ONLY ranking authority, and it
// runs SERVER-SIDE inside /api/usda-search. Correction memory never reranks on a
// surface and nuCreateResolver still trusts the returned order. Instead:
//   1. A correction is recorded into a bounded client SESSION store immediately,
//      and best-effort PERSISTED (RLS) to public.food_corrections.
//   2. On later searches in that session the client sends only the RELEVANT
//      bounded correction context with the request (nmSelectRelevant + nmSerialize).
//   3. usda-search validates/dedupes that session context against the user's
//      persisted corrections (loaded under their RLS token) and builds ONE shared
//      nmCorrectionSignal, injected through the existing options.signals seam.
// Client session context is request-scoped user-preference EVIDENCE only — never
// trusted food data, never an authorization source. The corrected food must
// already exist in the normally retrieved candidate set to receive any boost.
//
// ── Scope discipline (Phase 4.2.4 non-goals) ─────────────────────────────────
// This is USER-SPECIFIC learning. It must not be used to paper over GLOBAL
// ranking defects (chicken breast → turkey, fairlife bar → milk). Those stay
// separate ranking-quality work; a user CORRECTING one of them is learned here,
// but the global defect is not thereby "solved".

'use strict';

/* ── Shared primitives (reused, never re-implemented) ─────────────────────────
 * In Node we require the sibling modules; in the browser their top-level
 * declarations are already globals loaded before this file. Acquire once. */
var _rank = (typeof require === 'function') ? require('./food-ranking.js') : null;
var _core = (typeof require === 'function') ? require('./food-core.js') : null;

function _nText(s)        { return _rank ? _rank.nText(s)        : nText(s); }
function _tokenize(s)     { return _rank ? _rank.tokenize(s)     : tokenize(s); }
function _stem(s)         { return _rank ? _rank.stem(s)         : stem(s); }
function _stemTokens(a)   { return _rank ? _rank.stemTokens(a)   : stemTokens(a); }
function _brandEntries(t) { return _rank ? _rank.queryBrandEntries(t) : queryBrandEntries(t); }
function _foodKey(o)      { return _core ? _core.nuFoodKey(o)    : nuFoodKey(o); }
function _prepState()     { return _core ? _core.NU_PREP_STATE   : NU_PREP_STATE; }
function _sigFiller()     { return _core ? _core.NU_SIG_FILLER   : NU_SIG_FILLER; }

/* ── Centralized policy — every correction-memory constant lives here ─────────
 * Boost magnitudes are sized against RANK_WEIGHTS (food-ranking.js): strong
 * signals there are ~1000–2000, the two HARD safety demotions are implausibleKcal
 * (-2000) and emptyMacroPanel (-1500). Correction contribution is capped BELOW
 * those floors (totalCap 1800) so a correction can flip an ordinary ranking gap
 * to the corrected food but can NEVER punch a label-error/empty-panel candidate
 * to the top — correction memory does not bypass ranking safety. */
var NU_CORRECTION = {
  SCHEMA_VERSION: 1,

  // Base boost by match tier (added to the corrected candidate's score).
  boost: { exact: 1400, normalized: 1000, intent: 550 },

  // The exact/normalized rejected food is also demoted (only that one food, only
  // for a same-query match) so the corrected food wins decisively and reversibly.
  demoteIncorrect: -700,

  // Reinforcement: each repeat past the first adds `step`, multiplier capped at
  // `cap`. Deterministic, bounded — never unbounded score growth.
  reinforce: { step: 0.12, cap: 1.6 },

  // Absolute cap on the (boost × reinforce × stale) contribution for one memory,
  // kept under the -1500/-2000 safety floors above.
  totalCap: 1800,

  // Recency: a memory not used in `ms` keeps `factor` of its strength (a stale
  // guess shouldn't dominate forever; a reinforced/fresh one stays full).
  stale: { ms: 1000 * 60 * 60 * 24 * 180, factor: 0.5 },

  // Hard bounds on session payload / lookup (validation, DoS-resistance).
  limits: {
    maxSessionRecords: 20,   // client session store + request context cap
    maxRawQueryLen: 200,     // stored/echoed raw query (matches ai-food-parse input cap)
    maxPayloadChars: 6000,   // reject an oversized serialized context outright
    maxLookupRecords: 60,    // server persistent-lookup ceiling
    maxReinforcement: 100000, // sanity clamp on a claimed reinforcement_count
  },

  STATUS: { ACTIVE: 'active', SUPERSEDED: 'superseded', DEACTIVATED: 'deactivated' },
};

// Product-FORM nouns: the "what kind of product" axis. A brand's bar is not its
// milk — a product-type MISMATCH blocks generalization ("fairlife protein bar"
// must never generalize to "fairlife whole milk"). Extend here, not in code.
var NM_PRODUCT_TYPES = {
  bar: 1, shake: 1, drink: 1, milk: 1, powder: 1, yogurt: 1, cheese: 1, bread: 1,
  juice: 1, cereal: 1, sauce: 1, spread: 1, butter: 1, oil: 1, water: 1, soda: 1,
  cookie: 1, chip: 1, cracker: 1, oat: 1, rice: 1, pasta: 1, noodle: 1, wrap: 1,
  bagel: 1, muffin: 1, roll: 1, nugget: 1, patty: 1, sausage: 1, jerky: 1,
};

// Derivative/form markers that, when a query ADDS them on top of a matched
// memory, break the "same food, more specific" assumption (a breaded/fried/juiced
// form is a different food, not a flavor). Blocks intent generalization.
var NM_DERIVATIVE = {
  breaded: 1, fried: 1, juice: 1, powder: 1, isolate: 1, nugget: 1, patty: 1,
  sausage: 1, jerky: 1, spread: 1, sauce: 1, chip: 1, canned: 1, dried: 1,
};

/* ── Identity ─────────────────────────────────────────────────────────────
 * ONE key per food, delegating to nuFoodKey so correction identity is the SAME
 * identity favorites and saved-meal items persist. Candidates arrive in two
 * shapes — trimmed USDA (fdcId/description) and normalized (usda_fdc_id/name) —
 * so map both onto nuFoodKey's contract. */
function nmCandidateKey(f) {
  if (!f) return null;
  var id = (f.usda_fdc_id != null && f.usda_fdc_id !== '') ? f.usda_fdc_id : f.fdcId;
  var name = (f.name != null && f.name !== '') ? f.name : f.description;
  return _foodKey({ usda_fdc_id: id, name: name });
}

// A stable identity string is 'usda:<digits>' or 'custom:<name>' — the persisted
// nuFoodKey format. Reject anything else (forged/oversized) before it can drive
// a boost or reach the database.
function nmValidKey(k) {
  if (typeof k !== 'string') return false;
  if (/^usda:\d{1,15}$/.test(k)) return true;
  if (/^custom:.{1,120}$/.test(k)) return true;
  return false;
}

/* ── Query normalization + intent signature (reuse, don't duplicate) ──────────
 * nmNormQuery is the CANONICAL exact-match key: lowercased, punctuation-stripped,
 * stemmed, filler/number-dropped, order-insensitive (sorted). It absorbs
 * capitalization, punctuation, spacing, singular/plural, word order, and noise
 * words ("organic", "original") so "Fairlife protein bar" and "fairlife protein
 * bars" map to ONE key. Quantity is already separated upstream (ResolveRequest
 * splits query from quantity/unit); digits are dropped defensively. */
function nmNormQuery(q) {
  var toks = _tokenize(_nText(q || ''));
  var filler = _sigFiller();
  var out = [];
  var seen = {};
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i];
    if (/^\d+(\.\d+)?$/.test(t)) continue;
    var s = _stem(t);
    if (!s || filler[s] || filler[t]) continue;
    if (!seen[s]) { seen[s] = 1; out.push(s); }
  }
  out.sort();
  return out.join(' ');
}

// Structured intent axes used for conflict detection + conservative
// generalization. brandToks: canonical brand token set; prep: raw|cooked|dry|…;
// product: product-FORM stems; content: all non-brand non-filler stems; base:
// content minus product (the core food noun[s]).
function nmSig(q) {
  var toks = _tokenize(_nText(q || ''));
  var filler = _sigFiller();
  var prepMap = _prepState();
  var brandToks = {};
  _brandEntries(toks).forEach(function (entry) {
    (entry || []).forEach(function (w) { brandToks[_stem(w)] = 1; });
  });
  var prep = null, product = {}, content = {}, base = {};
  for (var i = 0; i < toks.length; i++) {
    var t = toks[i];
    if (/^\d+(\.\d+)?$/.test(t)) continue;
    if (prepMap[t] && !prep) prep = prepMap[t];
    var s = _stem(t);
    if (!s || filler[s] || filler[t]) continue;
    if (brandToks[s]) continue;               // brand handled on its own axis
    if (prepMap[t]) continue;                 // prep handled on its own axis
    content[s] = 1;
    if (NM_PRODUCT_TYPES[s]) product[s] = 1; else base[s] = 1;
  }
  return { brandToks: brandToks, prep: prep, product: product, content: content, base: base };
}

function nmKeys(o) { return Object.keys(o || {}); }
function nmHasKeys(o) { return nmKeys(o).length > 0; }
function nmSetEqual(a, b) {
  var ka = nmKeys(a), kb = nmKeys(b);
  if (ka.length !== kb.length) return false;
  for (var i = 0; i < ka.length; i++) if (!b[ka[i]]) return false;
  return true;
}
// Every key of `sub` present in `sup` (sub ⊆ sup). Empty sub is a subset.
function nmSubset(sub, sup) {
  var k = nmKeys(sub);
  for (var i = 0; i < k.length; i++) if (!sup[k[i]]) return false;
  return true;
}
// Two non-empty token sets that share nothing are DISJOINT (a real conflict).
function nmDisjoint(a, b) {
  if (!nmHasKeys(a) || !nmHasKeys(b)) return false;
  var k = nmKeys(a);
  for (var i = 0; i < k.length; i++) if (b[k[i]]) return false;
  return true;
}

/* ── Tiered matching ──────────────────────────────────────────────────────
 * Returns { tier, conflict } where tier ∈ exact|normalized|intent|null.
 *   • exact       — canonical queries identical (strongest). Absorbs case,
 *                   punctuation, spacing, plural, order, noise words.
 *   • normalized  — same base + same product form, prep differs only by PRESENCE
 *                   (one specifies cooked, the other is silent) — a compatible
 *                   qualifier, slightly weaker than identical.
 *   • intent      — conservative generalization: an ANCHORED memory (names a
 *                   brand or product form) whose whole signature is a subset of a
 *                   MORE-SPECIFIC current query, with no conflicting axis and no
 *                   newly-introduced derivative. "Fairlife protein bar" →
 *                   "Fairlife caramel protein bar", never → "Fairlife whole milk"
 *                   (product conflict) and never fired by the bare "protein bar"
 *                   query (memory not a subset — its brand is missing).
 * Conflicts (brand / prep / product / base) HARD-block generalization. */
function nmMatch(memory, request) {
  if (!memory) return { tier: null };
  var reqQ = (request && (request.query || request.text)) || '';
  var memQ = memory.raw_query || '';
  var nq = nmNormQuery(reqQ);
  if (memory.norm_query && nq && nq === memory.norm_query) return { tier: 'exact' };

  var rs = nmSig(reqQ), ms = nmSig(memQ);

  // Hard conflicts — both name the axis and they differ / are disjoint.
  if (nmHasKeys(rs.brandToks) && nmHasKeys(ms.brandToks) && !nmSetEqual(rs.brandToks, ms.brandToks) && nmDisjoint(rs.brandToks, ms.brandToks))
    return { tier: null, conflict: 'brand' };
  if (rs.prep && ms.prep && rs.prep !== ms.prep) return { tier: null, conflict: 'prep' };
  if (nmDisjoint(rs.product, ms.product)) return { tier: null, conflict: 'product' };
  // Base conflict: both name a core noun set and NEITHER is a subset of the
  // other (chicken breast vs turkey breast — they share "breast" but diverge on
  // the principal). A subset relationship is refinement, not conflict, so it is
  // left for the normalized/intent tiers to judge.
  if (nmHasKeys(rs.base) && nmHasKeys(ms.base) &&
      !nmSubset(rs.base, ms.base) && !nmSubset(ms.base, rs.base)) return { tier: null, conflict: 'base' };

  // normalized — same brand, same core noun(s), same product form; prep is
  // compatible (checked above) and may be present on only one side. Brand-set
  // EQUALITY is required so a brand-specific memory ("fairlife protein bar")
  // never collapses onto the brandless broad query ("protein bar"), and vice
  // versa — a brand is a refinement, not a formatting difference.
  if (nmSetEqual(rs.brandToks, ms.brandToks) &&
      nmSetEqual(rs.base, ms.base) && nmSetEqual(rs.product, ms.product)) return { tier: 'normalized' };

  // intent — anchored memory that is a subset of a strictly more specific query,
  // introducing only benign qualifiers (no derivative/form change).
  var anchored = nmHasKeys(ms.brandToks) || nmHasKeys(ms.product);
  if (anchored && nmSubset(ms.brandToks, rs.brandToks) && nmSubset(ms.content, rs.content)) {
    var extra = {}, added = false;
    nmKeys(rs.content).forEach(function (k) { if (!ms.content[k]) { extra[k] = 1; added = true; } });
    // A subset with NO additions is really a normalized match handled above; an
    // addition that is a derivative form breaks "same food, more specific".
    var derivative = nmKeys(extra).some(function (k) { return NM_DERIVATIVE[k]; });
    if (added && !derivative) return { tier: 'intent' };
  }
  return { tier: null };
}

/* ── Contribution math (bounded, deterministic) ──────────────────────────── */
function nmReinforceMult(count) {
  var n = Math.max(1, Math.min(NU_CORRECTION.limits.maxReinforcement, +count || 1));
  var m = 1 + NU_CORRECTION.reinforce.step * (n - 1);
  return Math.min(NU_CORRECTION.reinforce.cap, m);
}
function nmStaleFactor(lastUsedAt, now) {
  if (!lastUsedAt) return 1;
  var t = (typeof lastUsedAt === 'number') ? lastUsedAt : Date.parse(lastUsedAt);
  if (!isFinite(t)) return 1;
  var age = (now || Date.now()) - t;
  return age > NU_CORRECTION.stale.ms ? NU_CORRECTION.stale.factor : 1;
}
function nmContribution(tier, count, lastUsedAt, now) {
  var base = NU_CORRECTION.boost[tier];
  if (!base) return 0;
  var v = base * nmReinforceMult(count) * nmStaleFactor(lastUsedAt, now);
  return Math.min(NU_CORRECTION.totalCap, v);
}

/* ── The ranking signal ───────────────────────────────────────────────────
 * Build a pure (candidate, features, ctx) → number pass for options.signals.
 * Pre-matches every memory against the request ONCE; per candidate it grants the
 * STRONGEST matching memory's bounded boost to the corrected food (never summed
 * across memories — a repeated correction reinforces via count, not by stacking),
 * and the paired demotion to the exact/normalized rejected food. A candidate not
 * in the retrieved set simply never appears here, so memory can neither fabricate
 * a candidate nor bypass eligibility, dedupe, or verification. */
function nmCorrectionSignal(memories, request, opts) {
  var now = (opts && opts.now) || Date.now();
  var active = [];
  (memories || []).forEach(function (m) {
    if (!m || (m.status && m.status !== NU_CORRECTION.STATUS.ACTIVE)) return;
    if (!nmValidKey(m.corrected_key)) return;
    var res = nmMatch(m, request);
    if (!res.tier) return;
    active.push({
      tier: res.tier,
      corrected_key: m.corrected_key,
      incorrect_key: nmValidKey(m.incorrect_key) ? m.incorrect_key : null,
      contribution: nmContribution(res.tier, m.reinforcement_count, m.last_used_at, now),
    });
  });

  return function (f) {
    if (!active.length) return 0;
    var key = nmCandidateKey(f);
    if (!key) return 0;
    var boost = 0, demote = 0;
    for (var i = 0; i < active.length; i++) {
      var a = active[i];
      if (a.corrected_key === key && a.contribution > boost) boost = a.contribution;
      // Demote the rejected food only on a same-query (exact/normalized) match.
      if (a.incorrect_key === key && (a.tier === 'exact' || a.tier === 'normalized')) {
        demote = NU_CORRECTION.demoteIncorrect;
      }
    }
    // A food that is BOTH someone's corrected pick and another memory's rejected
    // food keeps its boost (a real preference outranks a stale rejection).
    return boost > 0 ? boost : demote;
  };
}

/* ── Explicit-correction capture ──────────────────────────────────────────
 * The ONLY correction we record: a needsChoice chooser where the user tapped a
 * candidate OTHER than the implicit top (index 0) — the system's would-be pick.
 * That is provably not a cancel, a quantity/serving edit, a clarification answer,
 * or a confirmation of the top hit. Both identities are known and differ. */
function nmIsExplicitCorrection(item, chosenIndex) {
  if (!item || !item.needsChoice) return false;
  var choices = item.choices;
  if (!Array.isArray(choices) || choices.length < 2) return false;
  var ci = +chosenIndex;
  if (!(ci >= 1 && ci < choices.length)) return false;   // index 0 = confirming the top hit, not a correction
  var top = choices[0] && choices[0].raw;
  var picked = choices[ci] && choices[ci].raw;
  if (!top || !picked) return false;
  var tk = nmCandidateKey(top), pk = nmCandidateKey(picked);
  return !!(tk && pk && tk !== pk);
}

// Minimal display snapshot — name + brand only, never a full candidate payload
// (data minimization; enough for later inspection/undo UI).
function nmMeta(raw) {
  if (!raw) return null;
  return {
    name: String((raw.description != null ? raw.description : raw.name) || '').slice(0, 160),
    brand: raw.brand ? String(raw.brand).slice(0, 80) : null,
  };
}

// Coarse DB lookup bucket for generalization: brand + product-form stems. Null
// for generic (no-anchor) corrections — those match by norm_query only, which
// also bounds the otherwise-huge generic bucket and keeps generalization
// conservative (a bare "chicken breast cooked" correction never generalizes).
function nmIntentKey(q) {
  var s = nmSig(q);
  if (!nmHasKeys(s.brandToks) && !nmHasKeys(s.product)) return null;
  var brand = nmKeys(s.brandToks).sort().join(',');
  var product = nmKeys(s.product).sort().join(',');
  return brand + '|' + product;
}

// Build a correction record from an explicit chooser correction. Provenance-rich
// but data-minimal; schema-versioned so persisted records can evolve safely.
function nmBuildCorrectionEvent(o) {
  o = o || {};
  var request = o.request || {};
  var choices = o.choices || [];
  var ci = +o.chosenIndex;
  var top = choices[0] && choices[0].raw;
  var picked = choices[ci] && choices[ci].raw;
  var reqQ = String(request.query || request.text || '').slice(0, NU_CORRECTION.limits.maxRawQueryLen);
  return {
    schema_version: NU_CORRECTION.SCHEMA_VERSION,
    status: NU_CORRECTION.STATUS.ACTIVE,
    raw_query: reqQ,
    norm_query: nmNormQuery(reqQ),
    intent_key: nmIntentKey(reqQ),
    incorrect_key: nmCandidateKey(top),
    corrected_key: nmCandidateKey(picked),
    incorrect_meta: nmMeta(top),
    corrected_meta: nmMeta(picked),
    source_surface: o.sourceSurface || 'ai_quick_log',
    provenance: o.provenance || 'choose_candidate',
    confidence_before: o.confidenceBefore || null,
    ambiguity: Array.isArray(o.ambiguity) ? o.ambiguity : [],
    reinforcement_count: 1,
    created_at: new Date().toISOString(),
    last_used_at: new Date().toISOString(),
  };
}

/* ── Session store helpers (bounded, request-scoped) ──────────────────────── */

// Merge a new correction into a bounded session list: an equivalent record
// (same norm_query + corrected_key) REINFORCES (count++, freshens last_used_at);
// a CONTRADICTORY one (same norm_query, different corrected_key) supersedes the
// old and leads. Newest-first, capped. Returns a NEW array (no mutation).
function nmSessionAdd(list, rec) {
  var out = [];
  var reinforced = false;
  (list || []).forEach(function (m) {
    if (m.norm_query === rec.norm_query && m.corrected_key === rec.corrected_key) {
      reinforced = true;
      out.push(Object.assign({}, m, {
        reinforcement_count: (+m.reinforcement_count || 1) + 1,
        last_used_at: rec.last_used_at,
        status: NU_CORRECTION.STATUS.ACTIVE,
      }));
    } else if (m.norm_query === rec.norm_query) {
      // contradictory correction for the same query → old one is superseded
      out.push(Object.assign({}, m, { status: NU_CORRECTION.STATUS.SUPERSEDED }));
    } else {
      out.push(m);
    }
  });
  if (!reinforced) out.unshift(rec);
  else out.unshift(out.splice(out.findIndex(function (m) {
    return m.norm_query === rec.norm_query && m.corrected_key === rec.corrected_key;
  }), 1)[0]);
  // Keep only active + a bounded window.
  var active = out.filter(function (m) { return m.status === NU_CORRECTION.STATUS.ACTIVE; });
  return active.slice(0, NU_CORRECTION.limits.maxSessionRecords);
}

// Records from the session store relevant to THIS query (client pre-filter so we
// transmit only what can matter). The server re-runs nmMatch — this is a
// bandwidth filter, never the authority.
function nmSelectRelevant(list, request) {
  return (list || []).filter(function (m) { return !!nmMatch(m, request).tier; });
}

// Compact, transport-safe projection of session records (only the fields the
// signal needs). Never includes internal ids or raw candidate payloads.
function nmProjectForTransport(m) {
  return {
    v: m.schema_version || NU_CORRECTION.SCHEMA_VERSION,
    q: String(m.raw_query || '').slice(0, NU_CORRECTION.limits.maxRawQueryLen),
    nq: m.norm_query,
    ik: m.intent_key || null,
    ck: m.corrected_key,
    xk: m.incorrect_key || null,
    r: Math.max(1, Math.min(NU_CORRECTION.limits.maxReinforcement, +m.reinforcement_count || 1)),
    t: m.last_used_at || null,
  };
}
function nmSerializeContext(list) {
  var arr = (list || []).slice(0, NU_CORRECTION.limits.maxSessionRecords).map(nmProjectForTransport);
  return JSON.stringify(arr);
}

// Server side: parse + STRICTLY validate a client-supplied context string into
// normalized memory records. Anything malformed/oversized/forged is dropped
// silently (invalid context → treated as empty, never an error). Returns [].
function nmParseContext(str) {
  if (typeof str !== 'string' || str.length === 0) return [];
  if (str.length > NU_CORRECTION.limits.maxPayloadChars) return [];
  var arr;
  try { arr = JSON.parse(str); } catch (e) { return []; }
  if (!Array.isArray(arr)) return [];
  var out = [];
  for (var i = 0; i < arr.length && out.length < NU_CORRECTION.limits.maxSessionRecords; i++) {
    var m = arr[i];
    if (!m || typeof m !== 'object') continue;
    if (+m.v !== NU_CORRECTION.SCHEMA_VERSION) continue;
    if (!nmValidKey(m.ck)) continue;
    if (m.xk != null && !nmValidKey(m.xk)) continue;
    if (typeof m.nq !== 'string' || m.nq.length > NU_CORRECTION.limits.maxRawQueryLen) continue;
    if (typeof m.q !== 'string' || m.q.length > NU_CORRECTION.limits.maxRawQueryLen) continue;
    out.push({
      schema_version: NU_CORRECTION.SCHEMA_VERSION,
      status: NU_CORRECTION.STATUS.ACTIVE,
      origin: 'session',
      raw_query: m.q,
      norm_query: m.nq,
      intent_key: (typeof m.ik === 'string') ? m.ik : null,
      corrected_key: m.ck,
      incorrect_key: (m.xk != null) ? m.xk : null,
      reinforcement_count: Math.max(1, Math.min(NU_CORRECTION.limits.maxReinforcement, +m.r || 1)),
      last_used_at: (typeof m.t === 'string') ? m.t : null,
    });
  }
  return out;
}

/* ── Dedupe persistent ∪ session ──────────────────────────────────────────
 * The same correction can exist BOTH persisted and in the session context (we
 * persist and mirror it). Merge by (norm_query, corrected_key): keep one, taking
 * the MAX reinforcement and the freshest last_used_at so it is never
 * double-counted by the signal. Persistent + session inputs are concatenated by
 * the caller; order within a key does not matter. */
function nmDedupeMemories(list) {
  var byKey = {};
  var order = [];
  (list || []).forEach(function (m) {
    if (!m || !m.corrected_key || !m.norm_query) return;
    var k = m.norm_query + ' ' + m.corrected_key;
    if (!byKey[k]) { byKey[k] = Object.assign({}, m); order.push(k); return; }
    var cur = byKey[k];
    cur.reinforcement_count = Math.max(+cur.reinforcement_count || 1, +m.reinforcement_count || 1);
    var a = Date.parse(cur.last_used_at || 0) || 0, b = Date.parse(m.last_used_at || 0) || 0;
    if (b > a) cur.last_used_at = m.last_used_at;
    if (!cur.incorrect_key && m.incorrect_key) cur.incorrect_key = m.incorrect_key;
  });
  return order.map(function (k) { return byKey[k]; });
}

/* ── Node exports (guarded — browsers ignore this block) ─────────────────── */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    NU_CORRECTION: NU_CORRECTION,
    NM_PRODUCT_TYPES: NM_PRODUCT_TYPES,
    NM_DERIVATIVE: NM_DERIVATIVE,
    nmCandidateKey: nmCandidateKey,
    nmValidKey: nmValidKey,
    nmNormQuery: nmNormQuery,
    nmSig: nmSig,
    nmMatch: nmMatch,
    nmReinforceMult: nmReinforceMult,
    nmStaleFactor: nmStaleFactor,
    nmContribution: nmContribution,
    nmCorrectionSignal: nmCorrectionSignal,
    nmIsExplicitCorrection: nmIsExplicitCorrection,
    nmBuildCorrectionEvent: nmBuildCorrectionEvent,
    nmIntentKey: nmIntentKey,
    nmMeta: nmMeta,
    nmSessionAdd: nmSessionAdd,
    nmSelectRelevant: nmSelectRelevant,
    nmSerializeContext: nmSerializeContext,
    nmParseContext: nmParseContext,
    nmDedupeMemories: nmDedupeMemories,
  };
}
