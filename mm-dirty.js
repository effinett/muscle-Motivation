/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Shared Unsaved-Work Contract  ·  Phase 4.3.5G
 *
 * Closes the deferral recorded as roadmap §10.4: "No app-wide unsaved-work
 * signal exists; the current protection is that service-worker refresh happens
 * only on explicit user acceptance."
 *
 * ── WHAT COUNTS AS DIRTY ──────────────────────────────────────────────────
 * Deliberately narrow, because a prompt the user does not need is worse than no
 * prompt at all. Persistence in this app is INCREMENTAL — every set, every
 * logged food and every weigh-in is written the moment it is confirmed — so
 * "work in progress" usually is NOT unsaved. Only two things genuinely are:
 *
 *   1. TEXT THE USER TYPED BUT HAS NOT COMMITTED. An open dialog whose fields
 *      have changed since it opened: the AI Quick Log text, a half-filled food
 *      form, a renamed custom exercise, an unconfirmed weigh-in. Closing the
 *      document loses exactly this and nothing else.
 *   2. A LIVE TRAINING SESSION. Its sets are already persisted, but the session
 *      owns in-memory state a reload destroys (elapsed timer, rest timer) and
 *      it is the one surface where an interruption is genuinely costly.
 *
 * ── WHAT DOES NOT COUNT ───────────────────────────────────────────────────
 * Scroll position · an open dialog the user has not typed into · a completed
 * workout · anything already written to the database · ordinary reading. None
 * of these may ever produce a prompt.
 *
 * ── HOW IT PROTECTS WORK ──────────────────────────────────────────────────
 * Through ONE mechanism: a `beforeunload` listener, attached only while
 * something is actually dirty. That single point covers every way a document
 * can be replaced — a bottom-nav tap, a link, a programmatic location change,
 * and the service-worker update's `location.reload()` — so sw-register.js
 * needs no change and its tested update state machine is untouched.
 *
 * Attaching the listener ONLY while dirty matters for more than tidiness: a
 * permanently-registered `beforeunload` makes a document ineligible for the
 * back/forward cache, which would directly undermine the 4.3.5F navigation
 * work. Clean pages stay bfcache-eligible.
 *
 * Same shape as the other shared cores: a PURE decision layer plus a thin DOM
 * layer. Browser global `MMDirty`; Node gets guarded module.exports.
 *
 * Performs NO network, NO storage, NO service-worker access, and reads no user
 * data — a source reports only whether it is dirty, never what it contains.
 * ──────────────────────────────────────────────────────────────────────── */

(function (global) {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════════
   * PURE LAYER
   * ══════════════════════════════════════════════════════════════════════ */

  /* Evaluate a set of registered sources.
   *
   * sources — [{ id, label, predicate }]. A predicate returns truthy when that
   *           source currently holds unsaved work.
   * opts    — { suspended: bool } — a deliberate, saving navigation is under
   *           way, so nothing should be protected.
   *
   * A predicate that THROWS is treated as NOT dirty. That direction is chosen
   * on purpose: a broken predicate must not strand the user behind a prompt
   * they cannot clear. Losing the warning is recoverable; a page that can never
   * be left is not.
   *
   * Returns { dirty, reasons: [id], labels: [label] } — ids and labels only,
   * never any content. */
  function evaluate(sources, opts) {
    opts = opts || {};
    var reasons = [];
    var labels = [];
    if (opts.suspended) return { dirty: false, reasons: reasons, labels: labels };
    if (!Array.isArray(sources)) return { dirty: false, reasons: reasons, labels: labels };

    for (var i = 0; i < sources.length; i++) {
      var s = sources[i];
      if (!s || typeof s.predicate !== 'function') continue;
      var hit = false;
      try { hit = !!s.predicate(); } catch (e) { hit = false; }
      if (hit) {
        reasons.push(s.id);
        if (s.label) labels.push(s.label);
      }
    }
    return { dirty: reasons.length > 0, reasons: reasons, labels: labels };
  }

  /* Has a form's content changed since the snapshot taken when it opened?
   *
   * Compares two plain {name: value} maps. Used for the "open dialog with
   * uncommitted text" source: opening a dialog is not dirty, typing in it is.
   *
   * A field present in one map and absent from the other counts as a change
   * only when its value is non-empty, so a dialog that swaps views (the food
   * modal's search / form / USDA faces) does not read as edited merely because
   * different empty fields are on screen. */
  function formChanged(before, after) {
    if (!before || !after) return false;
    var keys = {};
    var k;
    for (k in before) if (has(before, k)) keys[k] = 1;
    for (k in after) if (has(after, k)) keys[k] = 1;
    for (k in keys) {
      if (!has(keys, k)) continue;
      var a = norm(before[k]);
      var b = norm(after[k]);
      if (a !== b) return true;
    }
    return false;
  }

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function norm(v) { return (v == null) ? '' : String(v); }

  /* ══════════════════════════════════════════════════════════════════════
   * DOM LAYER (browser only)
   * ══════════════════════════════════════════════════════════════════════ */

  var doc = (typeof document !== 'undefined') ? document : null;
  var win = (typeof window !== 'undefined') ? window : null;

  var sources = [];
  var suspended = false;
  var listening = false;

  function onBeforeUnload(ev) {
    // Re-evaluate at the moment of departure rather than trusting a cached
    // flag: the user may have submitted the form since it was last checked.
    if (!evaluate(sources, { suspended: suspended }).dirty) return undefined;
    // The modern signal is preventDefault(); returnValue is the legacy one.
    // Browsers show their own wording — a custom string has been ignored for
    // years — and only prompt at all once the user has interacted with the
    // page, so a freshly-opened document is never interrupted.
    ev.preventDefault();
    ev.returnValue = '';
    return '';
  }

  // Attach only while genuinely dirty, so a clean page stays bfcache-eligible.
  function sync() {
    if (!win || typeof win.addEventListener !== 'function') return false;
    var dirty = evaluate(sources, { suspended: suspended }).dirty;
    if (dirty && !listening) {
      win.addEventListener('beforeunload', onBeforeUnload);
      listening = true;
    } else if (!dirty && listening) {
      win.removeEventListener('beforeunload', onBeforeUnload);
      listening = false;
    }
    return dirty;
  }

  /* register(id, predicate, label)
   *   id        stable source name, also what check() reports. Re-registering
   *             the same id REPLACES it, so a page can re-register safely.
   *   predicate () => truthy when this source holds unsaved work.
   *   label     optional human phrase for a consumer that wants to explain
   *             what is at risk. Never contains user content. */
  function register(id, predicate, label) {
    if (!id || typeof predicate !== 'function') return false;
    unregister(id);
    sources.push({ id: String(id), predicate: predicate, label: label || null });
    sync();
    return true;
  }

  function unregister(id) {
    for (var i = sources.length - 1; i >= 0; i--) {
      if (sources[i].id === String(id)) sources.splice(i, 1);
    }
    sync();
    return true;
  }

  function check() { return evaluate(sources, { suspended: suspended }); }

  /* A deliberate navigation that SAVES (finishing a workout, discarding on
   * purpose) must not be warned about. Suspend immediately before it. There is
   * no resume: the document is on its way out, and a page that survives (a
   * failed save) calls refresh() to re-arm. */
  function suspend() { suspended = true; sync(); return true; }
  function resume() { suspended = false; sync(); return true; }
  function refresh() { return sync(); }

  /* Snapshot every named field inside a container — the input side of
   * formChanged(). Values only, never sent anywhere; the caller compares two
   * snapshots and keeps a boolean. */
  function snapshotForm(root) {
    var out = {};
    if (!root || typeof root.querySelectorAll !== 'function') return out;
    var fields;
    try { fields = root.querySelectorAll('input, textarea, select'); } catch (e) { return out; }
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.type === 'hidden' || f.disabled) continue;
      var key = f.id || f.name;
      if (!key) continue;
      out[key] = (f.type === 'checkbox' || f.type === 'radio') ? String(f.checked) : String(f.value);
    }
    return out;
  }

  var MMDirty = {
    // pure
    evaluate: evaluate,
    formChanged: formChanged,
    // DOM
    register: register,
    unregister: unregister,
    check: check,
    suspend: suspend,
    resume: resume,
    refresh: refresh,
    snapshotForm: snapshotForm,
    isListening: function () { return listening; },
    sourceIds: function () { return sources.map(function (s) { return s.id; }); },
  };

  if (global) global.MMDirty = MMDirty;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MMDirty;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
