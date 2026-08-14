/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Client Error Reporting  ·  Phase 4.3.5J
 *
 * The goal: stop finding out about failures only when a user reports them.
 *
 * ── WHAT EXISTED BEFORE ───────────────────────────────────────────────────
 * Server-side failures in /api/* already reach Vercel's runtime logs through
 * console.error, and they are diagnosable today. The CLIENT had nothing at all:
 * no window error handler, no unhandled-rejection handler, and ~40 scattered
 * console.error calls that die in a phone's console where no one will ever see
 * them. Every browser-side failure was invisible.
 *
 * ── WHAT THIS DOES, AND DELIBERATELY DOES NOT ─────────────────────────────
 * It captures genuine application faults and posts a small, sanitised report to
 * /api/client-error, which writes it to the platform's existing runtime logs.
 * No new vendor, no new account, no new secret, no database table, and no
 * migration — see the recommendation at the end of this comment.
 *
 * PRIVACY IS THE CONSTRAINT, NOT AN AFTERTHOUGHT. A report may contain only
 * technical facts about a failure:
 *   • the error's name and a sanitised message
 *   • same-origin script frames from the stack
 *   • the page's FILE NAME — never its query string or fragment, which is
 *     where ids and dates live
 *   • a coarse runtime hint and an ephemeral in-memory session id
 * It may never contain: auth tokens, session state, user ids, e-mail addresses,
 * or any nutrition, workout or body-metric value. `sanitize()` below strips the
 * shapes those take even when they arrive inside a message string, and a test
 * asserts each case.
 *
 * NOISE IS THE OTHER CONSTRAINT. One broken render in a loop could otherwise
 * emit thousands of identical reports. Every report is fingerprinted, each
 * fingerprint is sent at most once per page, and there is a hard per-page cap.
 *
 * EXPECTED FAILURES ARE NOT FAULTS. A user typing a bad weight, a search that
 * returns nothing, an offline fetch — these are the product working. Only
 * `severity: 'error'` is reported; a caller can classify something as
 * 'expected' and it is counted locally and never sent.
 *
 * ── RECOMMENDATION REQUIRING APPROVAL ─────────────────────────────────────
 * Runtime logs are a floor, not a monitoring product: no alerting, no grouping,
 * no release tracking, and Hobby-plan retention. A dedicated provider would be
 * the right next step, but it means a new vendor, account and secret, so it is
 * NOT added here. Recorded for Effi's decision in docs/ROADMAP.md.
 *
 * Pure decision layer + thin DOM layer, as elsewhere. Browser global
 * `MMErrors`; Node gets guarded exports of the pure parts.
 * ──────────────────────────────────────────────────────────────────────── */

(function (global) {
  'use strict';

  /* Named limits — tuned for a Hobby-plan function budget, not guessed inline. */
  var LIMITS = {
    maxPerPage: 5,        // hard cap on reports from one document
    maxMessage: 300,      // characters kept from a message
    maxFrames: 5,         // stack frames kept
    maxFrameLength: 160,
    endpoint: '/api/client-error',
  };

  /* Patterns whose CONTENT must never leave the device, matched against a
   * message before it is sent. Each replaces the value, never the surrounding
   * text, so the report stays diagnosable. */
  var REDACTIONS = [
    // JWTs and bearer tokens — Supabase session material.
    [/\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b/g, '[token]'],
    // The separator is optional on purpose: the real-world shapes are both
    // `apikey=<secret>` AND `Authorization: Bearer <secret>`, and requiring a
    // colon or equals missed the second one entirely.
    // The separator is optional and an intervening scheme is skipped, because
    // the real-world shapes are `apikey=<secret>` AND
    // `Authorization: Bearer <secret>` — requiring a colon missed the second,
    // and stopping at the first token left the secret sitting after "Bearer".
    [/\b(bearer|apikey|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization)\b\s*[:=]?\s*(?:bearer\b\s*)?\S+/gi,
      '$1 [redacted]'],
    [/\bsb_(?:publishable|secret)_[A-Za-z0-9_\-]+/g, '[key]'],
    // E-mail addresses.
    [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, '[email]'],
    // UUIDs — user ids, workout ids, log ids.
    [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[id]'],
    // Any remaining long opaque run, which is what a secret looks like.
    [/\b[A-Za-z0-9_\-]{40,}\b/g, '[redacted]'],
    // A query string carried inside a message drags ids and dates with it.
    [/\?[^\s'"]{1,200}/g, '?[query]'],
  ];

  /* ══════════════════════════════════════════════════════════════════════
   * PURE LAYER
   * ══════════════════════════════════════════════════════════════════════ */

  function sanitize(message, limits) {
    limits = limits || LIMITS;
    if (message == null) return '';
    var s = String(message);
    for (var i = 0; i < REDACTIONS.length; i++) {
      s = s.replace(REDACTIONS[i][0], REDACTIONS[i][1]);
    }
    s = s.replace(/\s+/g, ' ').trim();
    return s.length > limits.maxMessage ? s.slice(0, limits.maxMessage) + '…' : s;
  }

  /* Keep only SAME-ORIGIN script frames, reduced to file:line:col.
   * Absolute URLs are dropped to a bare file name so a report can never carry
   * an origin, a query string, or a path that identifies anything. */
  function sanitizeStack(stack, origin, limits) {
    limits = limits || LIMITS;
    if (!stack) return [];
    var lines = String(stack).split('\n');
    var out = [];
    for (var i = 0; i < lines.length && out.length < limits.maxFrames; i++) {
      var line = lines[i];
      var m = line.match(/((?:https?:\/\/|\/)[^\s)]+?):(\d+):(\d+)/);
      if (!m) continue;
      var url = m[1];
      // A cross-origin frame (a CDN script) tells us nothing actionable and is
      // not ours to report on.
      if (/^https?:\/\//.test(url) && origin && url.indexOf(origin) !== 0) continue;
      var file = url.slice(url.lastIndexOf('/') + 1).split('?')[0];
      var fn = (line.match(/at\s+([\w.$<>]+)\s*\(/) || [])[1] || '';
      var frame = (fn ? fn + ' ' : '') + file + ':' + m[2] + ':' + m[3];
      out.push(frame.slice(0, limits.maxFrameLength));
    }
    return out;
  }

  /* A page identity that carries no user data: the file name only. */
  function routeOf(pathname) {
    if (typeof pathname !== 'string') return 'unknown';
    var p = pathname.split('?')[0].split('#')[0];
    var seg = p.slice(p.lastIndexOf('/') + 1);
    return seg || 'index.html';
  }

  /* Stable identity for "the same failure", so a render loop cannot flood the
   * endpoint. Deliberately excludes column numbers and the message tail, which
   * vary between otherwise identical failures. */
  function fingerprint(report) {
    if (!report) return '';
    var first = (report.frames && report.frames[0]) || '';
    return [report.kind, report.name, (report.message || '').slice(0, 80),
      report.route, first.split(':')[0]].join('|');
  }

  /* Build the wire report. Every field is derived; nothing is passed through. */
  function buildReport(input, limits) {
    limits = limits || LIMITS;
    input = input || {};
    var err = input.error;
    var name = (err && err.name) || input.name || 'Error';
    var message = (err && err.message) || input.message || '';
    var report = {
      v: 1,
      kind: input.kind || 'error',
      name: sanitize(name, limits).slice(0, 60),
      message: sanitize(message, limits),
      frames: sanitizeStack(err && err.stack, input.origin, limits),
      route: routeOf(input.pathname),
      // Ephemeral, in-memory only — it groups one page's reports together and
      // is meaningless the moment the document goes away. Never persisted,
      // never derived from anything about the user.
      session: input.session || '',
      at: input.at || 0,
    };
    report.fp = fingerprint(report);
    return report;
  }

  /* Send, drop as a duplicate, or drop because the cap is reached.
   * state = { sent: {fp: true}, count: n } */
  function shouldSend(report, state, limits) {
    limits = limits || LIMITS;
    if (!report || !report.fp) return { send: false, reason: 'invalid' };
    if (!state) return { send: false, reason: 'invalid' };
    if (state.count >= limits.maxPerPage) return { send: false, reason: 'capped' };
    if (state.sent[report.fp]) return { send: false, reason: 'duplicate' };
    return { send: true, reason: 'new' };
  }

  /* Is this worth reporting at all? Expected, user-correctable outcomes are the
   * product working correctly and must never look like faults. */
  function isReportable(severity) {
    return severity !== 'expected' && severity !== 'info';
  }

  /* ══════════════════════════════════════════════════════════════════════
   * DOM LAYER (browser only)
   * ══════════════════════════════════════════════════════════════════════ */

  var doc = (typeof document !== 'undefined') ? document : null;
  var win = (typeof window !== 'undefined') ? window : null;

  var state = { sent: {}, count: 0 };
  var sessionId = '';
  var installed = false;

  function ensureSession() {
    if (sessionId) return sessionId;
    // Random, in-memory, never stored. Not an identifier for the user — it
    // exists only so several reports from one broken page can be read together.
    sessionId = Math.random().toString(36).slice(2, 10);
    return sessionId;
  }

  function send(report) {
    if (!win) return false;
    var body;
    try { body = JSON.stringify(report); } catch (e) { return false; }
    try {
      // sendBeacon survives the page being torn down, which is exactly when a
      // navigation-time failure would otherwise be lost.
      if (win.navigator && typeof win.navigator.sendBeacon === 'function') {
        var blob = new Blob([body], { type: 'application/json' });
        if (win.navigator.sendBeacon(LIMITS.endpoint, blob)) return true;
      }
    } catch (e) { /* fall through */ }
    try {
      win.fetch(LIMITS.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true,
        // No credentials: this endpoint neither needs nor should receive them.
        credentials: 'omit',
      }).catch(function () { /* reporting must never surface its own failure */ });
      return true;
    } catch (e) {
      return false;
    }
  }

  /* report(kind, error, opts)
   *   kind     'unhandled-error' | 'unhandled-rejection' | 'api' | 'auth' |
   *            'bootstrap' | 'pwa' | any short caller-chosen label.
   *   opts     { severity: 'error' | 'expected' | 'info', message, name } */
  function report(kind, error, opts) {
    opts = opts || {};
    try {
      if (!isReportable(opts.severity)) return false;
      var built = buildReport({
        kind: kind,
        error: error,
        name: opts.name,
        message: opts.message,
        pathname: (win && win.location && win.location.pathname) || '',
        origin: (win && win.location && win.location.origin) || '',
        session: ensureSession(),
        at: Date.now(),
      });
      var verdict = shouldSend(built, state);
      if (!verdict.send) return false;
      state.sent[built.fp] = true;
      state.count++;
      return send(built);
    } catch (e) {
      // A failure inside the error reporter must never become a second error.
      return false;
    }
  }

  function install() {
    if (installed || !win || typeof win.addEventListener !== 'function') return false;
    installed = true;

    win.addEventListener('error', function (ev) {
      // A failed <img>/<script> load also fires this on the element. Those are
      // resource failures, not application faults, and they carry no error.
      if (ev && ev.target && ev.target !== win && ev.target.nodeType === 1) {
        var tag = (ev.target.tagName || '').toLowerCase();
        if (tag === 'script' || tag === 'link') {
          report('resource', null, { name: 'ResourceError', message: tag + ' failed to load' });
        }
        return;
      }
      report('unhandled-error', ev && ev.error, {
        name: ev && ev.error ? undefined : 'ErrorEvent',
        message: ev && !ev.error ? ev.message : undefined,
      });
    }, true);

    win.addEventListener('unhandledrejection', function (ev) {
      var r = ev && ev.reason;
      var isError = r && typeof r === 'object' && typeof r.stack === 'string';
      report('unhandled-rejection', isError ? r : null, {
        name: isError ? undefined : 'UnhandledRejection',
        message: isError ? undefined : String(r && r.message ? r.message : r),
      });
    });

    return true;
  }

  var MMErrors = {
    // pure
    LIMITS: LIMITS,
    sanitize: sanitize,
    sanitizeStack: sanitizeStack,
    routeOf: routeOf,
    fingerprint: fingerprint,
    buildReport: buildReport,
    shouldSend: shouldSend,
    isReportable: isReportable,
    // DOM
    install: install,
    report: report,
    stats: function () { return { count: state.count, unique: Object.keys(state.sent).length }; },
  };

  if (global) global.MMErrors = MMErrors;
  if (doc) install();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MMErrors;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
