/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Food-search telemetry  ·  roadmap 4.5.17
 *
 * Answers three questions about REAL searches, and nothing else:
 *   1. Which searches return nothing?            (event: zero_result)
 *   2. Which result position do people pick?     (event: pick)
 *   3. How does each AI Quick Log item resolve?  (events: ql_*)
 *      ql_matched   auto-picked a food           ql_chooser  showed a chooser
 *      ql_clarify   asked a question             ql_unmatched found nothing
 *      ql_manual    user gave up on the match and searched by hand
 *      A chooser tap is a `pick` with source 'quicklog', via 'chooser'.
 *      The query for ql_* is the AI's short search term for ONE food
 *      ("greek yogurt"), never the member's full sentence.
 * Benchmarks say how the engine does on cases we thought of; this says how it
 * does on the ones we did not.
 *
 * ── WHAT IT MAY NEVER CONTAIN ─────────────────────────────────────────────
 * No user id, token, profile data, food-log content, nutrition values, food
 * names or ids of what was picked. An event carries the search text, a result
 * count and — for a pick — a position, which list it came from and whether it
 * was a row tap or a one-tap add. The search text is the one free-text field
 * (owner-approved 2026-11-11): it is lowercased, capped at 80 characters, and
 * text that looks like an email or a long number is never sent.
 *
 * ── VALIDATED TWICE, ON PURPOSE ───────────────────────────────────────────
 * buildEvent below and the insert policy on public.food_search_events
 * (migration 20261111111733) enumerate the SAME events, fields and ranges. The
 * client copy stops a bad call before it becomes a request; the database copy
 * is the boundary. Changing one means changing both.
 *
 * ── IT CAN NEVER BREAK THE PRODUCT ────────────────────────────────────────
 * Every path swallows its own failure and NOTHING awaits `emit`. Same contract
 * as analytics-core.js and mm-errors.js.
 *
 * Browser: global `FoodTelemetry`.  Node: guarded module.exports.
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  var SCHEMA_VERSION = 1;
  var TABLE = 'food_search_events';
  var QUERY_MIN = 2;
  var QUERY_MAX = 80;
  var COUNT_MAX = 200;
  var SOURCES = ['generic', 'branded', 'own', 'quicklog'];
  var VIAS = ['row', 'add', 'chooser'];
  var QL_EVENTS = ['ql_matched', 'ql_chooser', 'ql_clarify', 'ql_unmatched', 'ql_manual'];

  /* ── pure ───────────────────────────────────────────────────────────────── */

  // The search text as it will be stored, or null when it must not be sent.
  function cleanQuery(text) {
    var q = String(text == null ? '' : text).toLowerCase().replace(/\s+/g, ' ').trim();
    if (q.length < QUERY_MIN) return null;
    if (q.indexOf('@') !== -1) return null;          // looks like an email
    if (/\d{7,}/.test(q.replace(/[\s().-]/g, ''))) return null;   // phone / card / id-like number
    return q.slice(0, QUERY_MAX);
  }

  function intIn(v, lo, hi) {
    var n = +v;
    return (typeof v !== 'boolean' && v !== null && v !== '' && isFinite(n) && Math.floor(n) === n && n >= lo && n <= hi) ? n : null;
  }

  // kind: 'zero_result' | 'pick' | one of QL_EVENTS. Returns the exact row to insert, or null when
  // the event is invalid — an invalid event is dropped, never "repaired".
  function buildEvent(kind, fields) {
    var f = fields || {};
    var query = cleanQuery(f.query);
    if (!query) return null;
    if (kind === 'zero_result') {
      return { event: 'zero_result', query: query, result_count: 0,
        picked_rank: null, picked_source: null, via: null, schema_version: SCHEMA_VERSION };
    }
    if (kind === 'pick') {
      var count = intIn(f.resultCount, 0, COUNT_MAX);
      var rank = intIn(f.rank, 0, COUNT_MAX);
      if (count === null || rank === null) return null;
      if (SOURCES.indexOf(f.source) === -1 || VIAS.indexOf(f.via) === -1) return null;
      // 'chooser' belongs to Quick Log and Quick Log picks only arrive that way.
      if ((f.source === 'quicklog') !== (f.via === 'chooser')) return null;
      return { event: 'pick', query: query, result_count: count,
        picked_rank: rank, picked_source: f.source, via: f.via, schema_version: SCHEMA_VERSION };
    }
    if (QL_EVENTS.indexOf(kind) !== -1) {
      var n = intIn(f.resultCount == null ? 0 : f.resultCount, 0, COUNT_MAX);
      if (n === null) return null;
      if (kind === 'ql_unmatched') n = 0;
      return { event: kind, query: query, result_count: n,
        picked_rank: null, picked_source: null, via: null, schema_version: SCHEMA_VERSION };
    }
    return null;
  }

  /* ── impure: the single emission point ─────────────────────────────────── */

  // Fire-and-forget. Returns true when a request was started. Never throws,
  // never awaited by callers.
  function emit(kind, fields) {
    try {
      var row = buildEvent(kind, fields);
      // supabase.js declares the client with `let`, so it is a global binding
      // but not a window property — reference it directly, guarded.
      var client = (typeof supabaseClient !== 'undefined') ? supabaseClient : root.supabaseClient;
      if (!row || !client || typeof client.from !== 'function') return false;
      var req = client.from(TABLE).insert(row);
      if (req && typeof req.then === 'function') req.then(function () {}, function () {});
      return true;
    } catch (e) {
      return false;
    }
  }

  var api = {
    SCHEMA_VERSION: SCHEMA_VERSION, TABLE: TABLE,
    QUERY_MIN: QUERY_MIN, QUERY_MAX: QUERY_MAX, COUNT_MAX: COUNT_MAX,
    SOURCES: SOURCES, VIAS: VIAS, QL_EVENTS: QL_EVENTS,
    cleanQuery: cleanQuery, buildEvent: buildEvent, emit: emit,
  };
  root.FoodTelemetry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
