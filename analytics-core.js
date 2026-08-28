/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Funnel Instrumentation  ·  Phase 4.3.7G
 *
 * The smallest thing that can answer one question: of everyone who starts
 * onboarding, how many finish? Nothing more. This is not product analytics and
 * must not grow into it.
 *
 * ── WHAT IT MAY NEVER CONTAIN ─────────────────────────────────────────────
 * No weight, body fat, age, gender, calorie or macro targets, profile payload,
 * name, email, free text, token, user id, full URL, IP or user agent. An event
 * carries an enum name, an opaque ephemeral id, a coarse route, ONE
 * categorical detail and a schema version — and nothing else exists to send,
 * because `emit` accepts no other arguments.
 *
 * There is deliberately NO user id. The funnel measures counts, not people, so
 * identity is not merely omitted — it is unnecessary. That makes the strongest
 * privacy claim available: this data cannot identify anyone because it never
 * knew who they were.
 *
 * ── VALIDATED TWICE, ON PURPOSE ───────────────────────────────────────────
 * FUNNEL_EVENTS below is the client vocabulary; the insert policy on
 * public.funnel_events enumerates the SAME event names and the SAME per-event
 * detail values. The client copy is for correctness — it stops a bad call
 * before it becomes a request. The database copy is the boundary — it is what
 * actually holds when the client is wrong, modified, or bypassed. Adding an
 * event means changing both, and they must agree.
 *
 * ── IT CAN NEVER BREAK THE PRODUCT ────────────────────────────────────────
 * Every path swallows its own failure and NOTHING awaits `emit`. A user must
 * never lose onboarding progress because telemetry failed. Same contract as
 * mm-errors.js, which has held in production since 4.3.5J.
 *
 * ── WHY IT TALKS TO POSTGREST DIRECTLY ────────────────────────────────────
 * index.html loads no Supabase SDK and should not start loading one to report
 * a CTA click. So the endpoint and publishable key are constants here. They
 * are the same values supabase.js already ships to every browser and are
 * publishable by definition — this duplicates a PUBLIC constant, not a secret.
 *
 * Browser: global `MMAnalytics`.  Node: guarded module.exports of the pure parts.
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  var SCHEMA_VERSION = 1;

  /* ── vocabulary ─────────────────────────────────────────────────────────
   * event → the exact detail values it permits, or null for "no detail".
   * Closed set: an event or detail absent from this table is not emitted, and
   * would be rejected by the insert policy even if it were. */
  var FUNNEL_EVENTS = {
    landing_cta_clicked:       ['hero', 'create_account'],
    onboarding_started:        ['anonymous', 'authenticated'],
    onboarding_step_completed: ['1', '2', '3', '4'],
    personalized_plan_viewed:  ['ready', 'partial', 'needs_input'],
    save_plan_clicked:         null,
    signup_completed:          ['email', 'google'],
    onboarding_completed:      ['anonymous_claim', 'authenticated_wizard'],
    // The one silent-failure path in the claim. Reasons mirror the fail-stop
    // returns in onboarding.html claimDraft(), one for one.
    onboarding_claim_failed:   ['compute', 'merge_empty', 'field_write',
                                'flag_write', 'confirm']
  };

  // Coarse buckets only — never a pathname, never a query string.
  var ROUTES = ['landing', 'onboarding', 'auth', 'app', 'other'];

  var STORAGE_ID = 'mm_funnel_id_v1';
  var STORAGE_EMITTED = 'mm_funnel_emitted_v1';

  var ENDPOINT = 'https://igzvphmhyrdjjvzbxnuh.supabase.co/rest/v1/funnel_events';
  var PUBLISHABLE_KEY = 'sb_publishable_LzaTBAZzmu1EOO6MsTSiFA_2BdMq9j6';

  var FUNNEL_ID_MIN = 8;
  var FUNNEL_ID_MAX = 24;

  /* ── pure ───────────────────────────────────────────────────────────────── */

  function knownEvent(event) {
    return typeof event === 'string' &&
      Object.prototype.hasOwnProperty.call(FUNNEL_EVENTS, event);
  }

  // Is this (event, detail) pair in the vocabulary? Mirrors the insert policy
  // exactly, including that save_plan_clicked must carry NO detail.
  function isValidEvent(event, detail) {
    if (!knownEvent(event)) return false;
    var allowed = FUNNEL_EVENTS[event];
    if (allowed === null) return detail === null || detail === undefined;
    return typeof detail === 'string' && allowed.indexOf(detail) >= 0;
  }

  function isValidRoute(route) {
    return route === null || route === undefined || ROUTES.indexOf(route) >= 0;
  }

  function isValidFunnelId(id) {
    return typeof id === 'string' &&
      id.length >= FUNNEL_ID_MIN && id.length <= FUNNEL_ID_MAX;
  }

  // A pathname reduced to one of five buckets. Anything unrecognised is
  // 'other' rather than the raw path, so a URL can never leak through.
  function routeOf(pathname) {
    if (typeof pathname !== 'string') return 'other';
    if (/(^\/$|index\.html)/.test(pathname)) return 'landing';
    if (pathname.indexOf('onboarding.html') >= 0) return 'onboarding';
    if (pathname.indexOf('auth.html') >= 0) return 'auth';
    if (pathname.indexOf('app.html') >= 0) return 'app';
    return 'other';
  }

  // Randomness is INJECTED so the pure layer stays deterministic under test,
  // the same discipline personalization-core.js uses for time.
  function newFunnelId(rand) {
    var r = (typeof rand === 'function') ? rand : Math.random;
    var out = '';
    while (out.length < 12) out += r().toString(36).slice(2);
    return out.slice(0, 12);
  }

  // Milestones fire once per funnel; step events once per step. Encoding the
  // detail into the key is what gives both behaviours from one rule.
  function dedupeKey(event, detail) {
    return (detail === null || detail === undefined) ? event : event + ':' + detail;
  }

  function shouldEmit(event, detail, emitted) {
    if (!isValidEvent(event, detail)) return false;
    if (!Array.isArray(emitted)) return true;
    return emitted.indexOf(dedupeKey(event, detail)) < 0;
  }

  // The exact row shape, or null when anything is off. Returning null rather
  // than a partial row means a malformed call is dropped, never sent.
  function buildEvent(event, detail, funnelId, route) {
    if (!isValidEvent(event, detail)) return null;
    if (!isValidFunnelId(funnelId)) return null;
    if (!isValidRoute(route)) return null;
    var row = {
      event: event,
      funnel_id: funnelId,
      route: route || null,
      schema_version: SCHEMA_VERSION
    };
    // Omitted entirely rather than sent as null where the event takes none.
    if (FUNNEL_EVENTS[event] !== null) row.detail = detail;
    return row;
  }

  // Belt-and-braces: prove a built row carries nothing outside the contract.
  // Exported so a test can assert the payload shape rather than trust it.
  var ALLOWED_KEYS = ['event', 'funnel_id', 'route', 'detail', 'schema_version'];
  function payloadKeysAreSafe(row) {
    if (!row || typeof row !== 'object') return false;
    for (var k in row) {
      if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
      if (ALLOWED_KEYS.indexOf(k) < 0) return false;
    }
    return true;
  }

  /* ── browser storage (thin) ─────────────────────────────────────────────
   * Every accessor swallows failure. Private mode, disabled storage and quota
   * exhaustion all degrade to "no telemetry", never to an exception. */
  function storage() {
    try {
      if (typeof sessionStorage === 'undefined') return null;
      return sessionStorage;
    } catch (e) { return null; }
  }

  // The funnel id lives beside the onboarding draft, shares its lifetime, and
  // is cleared at the same moment. It is never written to profiles and never
  // joined to a user, so it is not a second source of truth for anything.
  function ensureFunnelId(rand) {
    var s = storage();
    if (!s) return null;
    try {
      var existing = s.getItem(STORAGE_ID);
      if (isValidFunnelId(existing)) return existing;
      var fresh = newFunnelId(rand);
      s.setItem(STORAGE_ID, fresh);
      return fresh;
    } catch (e) { return null; }
  }

  function currentFunnelId() {
    var s = storage();
    if (!s) return null;
    try {
      var id = s.getItem(STORAGE_ID);
      return isValidFunnelId(id) ? id : null;
    } catch (e) { return null; }
  }

  function readEmitted() {
    var s = storage();
    if (!s) return [];
    try {
      var raw = s.getItem(STORAGE_EMITTED);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function markEmitted(key) {
    var s = storage();
    if (!s) return;
    try {
      var list = readEmitted();
      if (list.indexOf(key) < 0) {
        list.push(key);
        s.setItem(STORAGE_EMITTED, JSON.stringify(list));
      }
    } catch (e) { /* dedupe is best-effort; a lost mark only risks a dup */ }
  }

  // Called when the draft is cleared, so the funnel id and the answers it
  // accompanied disappear together.
  function clearFunnel() {
    var s = storage();
    if (!s) return false;
    try {
      s.removeItem(STORAGE_ID);
      s.removeItem(STORAGE_EMITTED);
      return true;
    } catch (e) { return false; }
  }

  /* ── send ───────────────────────────────────────────────────────────────
   * `keepalive` fetch rather than sendBeacon: beacon cannot set the apikey
   * header, and putting a key in a query string to work around that would be
   * worse. Nothing awaits this, and the catch is unconditional — a rejected
   * request must be indistinguishable from success to the caller. */
  function send(row) {
    try {
      if (typeof fetch !== 'function') return false;
      fetch(ENDPOINT, {
        method: 'POST',
        keepalive: true,
        headers: {
          'apikey': PUBLISHABLE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(row)
      }).catch(function () { /* telemetry never surfaces its own failure */ });
      return true;
    } catch (e) {
      return false;
    }
  }

  /* The ONLY entry point. Takes an event and a detail — there is no parameter
   * through which a caller could pass profile data even by accident. */
  function emit(event, detail) {
    try {
      var route = routeOf(
        (typeof location !== 'undefined' && location.pathname) || '');
      var funnelId = ensureFunnelId();
      if (!funnelId) return false;

      if (!shouldEmit(event, detail, readEmitted())) return false;

      var row = buildEvent(event, detail, funnelId, route);
      if (!row) return false;

      markEmitted(dedupeKey(event, detail));
      return send(row);
    } catch (e) {
      return false;   // nothing here may ever reach the caller
    }
  }

  var MMAnalytics = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    FUNNEL_EVENTS: FUNNEL_EVENTS,
    ROUTES: ROUTES,
    ALLOWED_KEYS: ALLOWED_KEYS,
    STORAGE_ID: STORAGE_ID,
    STORAGE_EMITTED: STORAGE_EMITTED,
    // pure
    isValidEvent: isValidEvent,
    isValidRoute: isValidRoute,
    isValidFunnelId: isValidFunnelId,
    routeOf: routeOf,
    newFunnelId: newFunnelId,
    dedupeKey: dedupeKey,
    shouldEmit: shouldEmit,
    buildEvent: buildEvent,
    payloadKeysAreSafe: payloadKeysAreSafe,
    // browser
    ensureFunnelId: ensureFunnelId,
    currentFunnelId: currentFunnelId,
    clearFunnel: clearFunnel,
    emit: emit
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MMAnalytics;
  root.MMAnalytics = MMAnalytics;
})(typeof window !== 'undefined' ? window : this);
