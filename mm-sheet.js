/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Shared Overlay / Bottom-Sheet Primitive  ·  Phase 4.3.5C
 *
 * ONE owner for the behaviour every overlay in the app needs and none of them
 * had: background scroll locking, focus capture and restore, Escape, backdrop
 * dismissal, layering discipline, keyboard avoidance, and — for the surfaces
 * that are genuinely bottom sheets — real drag-to-dismiss gesture handling.
 *
 * WHY A BEHAVIOUR LAYER, NOT A MARKUP GENERATOR
 * Thirteen dialogs already exist across six pages, each with its own markup and
 * its own visual design, all of them opened by `el.classList.add('open')`. A
 * markup-generating component would have forced thirteen simultaneous visual
 * rewrites to fix behaviour that is identical in all thirteen. So this module
 * ATTACHES to the markup a page already has: a consumer swaps
 *
 *     el.classList.add('open')        ->  MMSheet.open(el, { … })
 *     el.classList.remove('open')     ->  MMSheet.close(el)
 *
 * and inherits every behaviour below. The `.open` class is still toggled, so
 * every page's existing CSS keeps working untouched.
 *
 * DELIBERATELY NOT BUILT (CLAUDE.md §5 — no speculative abstractions):
 * no theming, no markup templates, no animation framework, no router
 * integration, no stacking beyond the two levels that genuinely occur today
 * (Finish -> Discard). Coach (4.4.9), food selectors and filter surfaces
 * consume this as-is; anything they need beyond it is added when they exist.
 *
 * Same architectural shape as app-nav.js / weight.js / exercise-core.js:
 *   - a PURE, DOM-free decision layer (gesture verdicts, scroll-lock
 *     bookkeeping, focus-ring arithmetic) — Node-testable, no globals;
 *   - a THIN DOM layer used only in the browser.
 * Browser: global `MMSheet`. Node: guarded module.exports of the pure parts.
 *
 * INTEGRATION CONTRACTS (do not break without approval):
 *   - Overlays keep their existing z-index (200) — ABOVE the primary nav (120)
 *     and BELOW the PWA update banner / install sheet (2147482000+), which must
 *     stay reachable while a dialog is open.
 *   - The scroll lock never touches `--mm-nav-base-height` or
 *     `--mm-bottom-clearance`; the nav's own geometry is unaffected.
 *   - This module performs NO network, NO storage, NO service-worker access,
 *     and reads NO user data.
 * ──────────────────────────────────────────────────────────────────────── */

(function (global) {
  'use strict';

  /* ══════════════════════════════════════════════════════════════════════
   * PURE LAYER
   * ══════════════════════════════════════════════════════════════════════ */

  /* Named gesture thresholds. Tuned so ordinary list scrolling stays effortless
   * and a dismissal has to be deliberate — the two failure modes are equally
   * bad, and the second one loses the user's place in a long exercise list.
   *
   * Every value is here rather than inline so gesture feel is TUNED BY EDITING
   * THIS TABLE, the same discipline food-ranking.js applies to RANK_WEIGHTS. */
  var SHEET_GESTURE = {
    // Movement (px) before we decide what kind of gesture this is at all.
    // Below it, nothing is claimed and the browser keeps its default handling.
    intentSlop: 8,
    // A drag must be predominantly vertical to be a dismissal. At 1.5 a finger
    // travelling 30deg off vertical still scrolls the list rather than closing
    // the sheet — this is the "slight diagonal must not dismiss" requirement.
    verticalRatio: 1.5,
    // Fraction of the sheet's own height that must be travelled to dismiss on
    // release. Proportional, so a short confirm and a tall picker feel alike.
    dismissFraction: 0.25,
    // Absolute floor, so a very short sheet still needs a real pull.
    dismissMinPx: 64,
    // A fast flick dismisses below the distance threshold. px/ms.
    flickVelocity: 0.5,
    // …but only if it also travelled at least this far, so a tap with a jittery
    // finger can never register as a flick.
    flickMinPx: 24,
    // Downward drag past the top edge is resisted rather than followed, so the
    // sheet cannot be dragged UP out of position.
    maxUpwardPx: 0,
  };

  /* Should this touch gesture be claimed as a sheet drag, or left to the
   * browser as ordinary scrolling?
   *
   * g = {
   *   dx, dy          px travelled since touchstart (dy positive = downward)
   *   fromHandle      the gesture started on the drag handle
   *   scrollTop       scrollTop of the scrollable ancestor under the finger
   *                   (0 when the gesture did not start inside one)
   *   scrollable      the gesture started inside a scrollable region
   * }
   *
   * Returns 'pending' | 'drag' | 'scroll'.
   *   pending — not enough movement to tell; claim nothing yet.
   *   drag    — the sheet follows the finger.
   *   scroll  — hands the gesture back to the browser for the rest of the touch.
   *
   * The rules, in priority order:
   *   1. The handle exists to drag the sheet, so a gesture starting there is a
   *      drag as soon as it is vertical — regardless of list scroll position.
   *   2. A gesture inside a list that is scrolled away from its top is ALWAYS
   *      a scroll. Dismissing mid-list would be indistinguishable from a
   *      mis-read scroll and would lose the user's place.
   *   3. At the top of the list, only a DOWNWARD, predominantly vertical
   *      gesture is a drag; upward continues to scroll, and a sideways gesture
   *      is never a dismissal. */
  function classifyGesture(g, cfg) {
    cfg = cfg || SHEET_GESTURE;
    g = g || {};
    var dx = Math.abs(num(g.dx));
    var dy = num(g.dy);
    var absDy = Math.abs(dy);

    if (Math.max(dx, absDy) < cfg.intentSlop) return 'pending';

    var vertical = absDy > dx * cfg.verticalRatio;
    if (!vertical) return 'scroll';

    if (g.fromHandle) return 'drag';
    if (g.scrollable && num(g.scrollTop) > 0) return 'scroll';
    return dy > 0 ? 'drag' : 'scroll';
  }

  /* On release, does the sheet close or spring back?
   * g = { dy, elapsedMs, sheetHeight } */
  function shouldDismiss(g, cfg) {
    cfg = cfg || SHEET_GESTURE;
    g = g || {};
    var dy = num(g.dy);
    if (dy <= 0) return false;                     // never dismiss on an upward drag

    var height = num(g.sheetHeight);
    var distance = height > 0
      ? Math.max(cfg.dismissMinPx, height * cfg.dismissFraction)
      : cfg.dismissMinPx;
    if (dy >= distance) return true;

    var ms = num(g.elapsedMs);
    if (ms > 0 && dy >= cfg.flickMinPx && (dy / ms) >= cfg.flickVelocity) return true;
    return false;
  }

  /* How far the sheet has actually moved, given a raw finger delta. Upward
   * travel is clamped so the sheet can never be dragged off the bottom edge. */
  function dragOffset(dy, cfg) {
    cfg = cfg || SHEET_GESTURE;
    var v = num(dy);
    return v < cfg.maxUpwardPx ? cfg.maxUpwardPx : v;
  }

  /* ── Scroll-lock bookkeeping ───────────────────────────────────────────
   * Reference-counted because dialogs genuinely stack (Finish -> Discard on
   * workout.html). Locking twice and unlocking once must NOT release the page,
   * and the saved scroll position belongs to the FIRST lock — a later one would
   * capture the already-frozen position and restore the user to the top. */
  function createLockCounter() {
    var depth = 0;
    var savedY = 0;
    return {
      // Returns true when this call is the transition into a locked state.
      acquire: function (y) {
        depth++;
        if (depth === 1) { savedY = num(y); return true; }
        return false;
      },
      // Returns { released, y } — `released` true only on the final release.
      release: function () {
        if (depth === 0) return { released: false, y: savedY };
        depth--;
        return depth === 0 ? { released: true, y: savedY } : { released: false, y: savedY };
      },
      depth: function () { return depth; },
      savedY: function () { return savedY; },
      reset: function () { depth = 0; savedY = 0; },
    };
  }

  /* ── Focus-trap arithmetic ─────────────────────────────────────────────
   * Which index Tab should land on, given the current one. Separated from the
   * DOM so the wrap-around is testable: it is the part that silently breaks. */
  function nextFocusIndex(count, current, backwards) {
    if (!(count > 0)) return -1;
    if (current < 0 || current >= count) return backwards ? count - 1 : 0;
    var next = backwards ? current - 1 : current + 1;
    if (next < 0) return count - 1;
    if (next >= count) return 0;
    return next;
  }

  function num(v) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : 0;
  }

  /* Elements that can hold focus inside an open overlay. Deliberately explicit
   * rather than `*[tabindex]`: a page's decorative wrappers must not become
   * tab stops just because an overlay opened. */
  var FOCUSABLE = [
    'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])', 'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  /* ══════════════════════════════════════════════════════════════════════
   * DOM LAYER (browser only)
   * ══════════════════════════════════════════════════════════════════════ */

  var doc = (typeof document !== 'undefined') ? document : null;
  var win = (typeof window !== 'undefined') ? window : null;

  var OPEN_CLASS = 'open';           // preserved: every page's CSS keys off it
  var LOCK_CLASS = 'mm-sheet-lock';  // on <body> while the page is frozen
  var SCROLL_CLASS = 'mm-sheet-scroll';
  var HANDLE_CLASS = 'mm-sheet-handle';
  var DRAG_ATTR = 'data-mm-sheet-dragging';

  var lock = createLockCounter();
  var stack = [];        // open records, innermost last
  var vvBound = false;
  var vvRaf = 0;

  function isEl(el) { return !!(el && el.nodeType === 1); }

  /* Phase 4.3.5G — the unsaved-work contract, if the page loaded it. The sheet
   * primitive is the natural place to own this: it already knows which dialogs
   * are open, so one registration covers every dialog in the app instead of
   * thirteen separate implementations. Absent MMDirty, everything below is a
   * no-op and overlays behave exactly as they did. */
  var DIRTY_ID = 'mm-sheet-open-form';
  function dirtyApi() {
    return (global && global.MMDirty && typeof global.MMDirty.register === 'function')
      ? global.MMDirty : null;
  }
  // Dirty when any OPEN dialog's fields differ from what they were when it
  // opened. Merely opening a dialog is never dirty — only typing in one is.
  function anyOpenFormEdited() {
    var api = dirtyApi();
    if (!api) return false;
    for (var i = 0; i < stack.length; i++) {
      var r = stack[i];
      if (!r.formSnapshot) continue;
      if (api.formChanged(r.formSnapshot, api.snapshotForm(r.el))) return true;
    }
    return false;
  }
  function syncDirty() {
    var api = dirtyApi();
    if (!api) return;
    if (stack.length) api.register(DIRTY_ID, anyOpenFormEdited, 'unsaved changes in an open form');
    else api.unregister(DIRTY_ID);
  }
  // MMDirty attaches its beforeunload listener only while something is dirty,
  // so it has to be told when the answer might have changed. Typing in a dialog
  // is exactly that moment. Without this the source would be registered while
  // still clean and the guard would never arm.
  function onDirtyInput() {
    var api = dirtyApi();
    if (api) api.refresh();
  }
  function rec(el) {
    for (var i = 0; i < stack.length; i++) if (stack[i].el === el) return stack[i];
    return null;
  }
  function top() { return stack.length ? stack[stack.length - 1] : null; }

  /* ── Scroll lock ────────────────────────────────────────────────────────
   * `overflow: hidden` on <html>/<body> does not stop scrolling in Mobile
   * Safari, which is precisely where the defect was reported. Freezing <body>
   * with position:fixed and a negative top DOES, on every engine, and it is
   * why the scroll position must be captured and restored explicitly. Fixed
   * descendants (the overlay itself, the nav, the PWA surfaces) are positioned
   * against the viewport and are unaffected. */
  function applyLock() {
    if (!doc || !win) return;
    var body = doc.body;
    if (!body) return;
    var y = win.pageYOffset || (doc.documentElement && doc.documentElement.scrollTop) || 0;
    if (!lock.acquire(y)) return;                       // already locked
    body.style.top = '-' + lock.savedY() + 'px';
    body.classList.add(LOCK_CLASS);
  }

  function releaseLock() {
    if (!doc || !win) return;
    var out = lock.release();
    if (!out.released) return;
    var body = doc.body;
    if (!body) return;
    body.classList.remove(LOCK_CLASS);
    body.style.top = '';
    // Restore exactly where the user was. Without this the page would jump to
    // the top every time a dialog closed.
    try { win.scrollTo(0, out.y); } catch (e) { /* contained */ }
  }

  /* ── Focus ──────────────────────────────────────────────────────────── */
  function focusables(root) {
    var out = [];
    if (!root || typeof root.querySelectorAll !== 'function') return out;
    var list;
    try { list = root.querySelectorAll(FOCUSABLE); } catch (e) { return out; }
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      // offsetParent is null for display:none subtrees — a hidden filter panel
      // must not become a tab stop.
      if (el.offsetParent !== null || el === doc.activeElement) out.push(el);
    }
    return out;
  }

  function focusInitial(r) {
    var target = null;
    if (r.opts.initialFocus) {
      target = typeof r.opts.initialFocus === 'string'
        ? r.el.querySelector(r.opts.initialFocus)
        : r.opts.initialFocus;
    }
    if (!target) {
      var f = focusables(r.el);
      target = f.length ? f[0] : r.panel || r.el;
    }
    if (!target) return;
    // preventScroll for the same reason as the picker search field: inside a
    // fixed overlay there is nothing to scroll to, and the UA's scroll-into-view
    // only ever moves the frozen page underneath.
    try { target.focus({ preventScroll: true }); } catch (e) {
      try { target.focus(); } catch (e2) { /* contained */ }
    }
  }

  function trapTab(r, ev) {
    var f = focusables(r.el);
    if (!f.length) { ev.preventDefault(); return; }
    var current = f.indexOf(doc.activeElement);
    var next = nextFocusIndex(f.length, current, !!ev.shiftKey);
    // Only intervene at the ends of the ring; inside it the browser's own
    // ordering is correct and better than anything recomputed here.
    if (current === -1 || (ev.shiftKey && current === 0) || (!ev.shiftKey && current === f.length - 1)) {
      ev.preventDefault();
      try { f[next].focus({ preventScroll: true }); } catch (e) { f[next].focus(); }
    }
  }

  /* ── Keyboard avoidance (sheet variant) ─────────────────────────────────
   * Adjusts the fixed overlay's BOTTOM EDGE — a layout property. Never a
   * transform: WebKit paints a text caret from the untransformed box, so a
   * translated ancestor puts the caret where the text is not (Phase 4.3.5B).
   * Bound to `resize` only; iOS fires visualViewport `scroll` continuously
   * while the keyboard is open and the sheet would chase the viewport. */
  function syncViewport() {
    var vv = win && win.visualViewport;
    if (!vv) return;
    for (var i = 0; i < stack.length; i++) {
      var r = stack[i];
      if (r.opts.variant !== 'sheet') continue;
      var kb = Math.max(0, Math.round(win.innerHeight - vv.height));
      r.el.style.bottom = kb > 24 ? kb + 'px' : '';   // sub-pixel URL-bar jitter is not a keyboard
    }
  }
  function onViewportChange() {
    if (vvRaf) return;
    vvRaf = win.requestAnimationFrame(function () { vvRaf = 0; syncViewport(); });
  }
  function bindViewport() {
    if (vvBound || !win || !win.visualViewport) return;
    win.visualViewport.addEventListener('resize', onViewportChange);
    vvBound = true;
    syncViewport();
  }
  function unbindViewport() {
    if (!vvBound || !win || !win.visualViewport) return;
    var stillNeeded = stack.some(function (r) { return r.opts.variant === 'sheet'; });
    if (stillNeeded) return;
    win.visualViewport.removeEventListener('resize', onViewportChange);
    if (vvRaf) { win.cancelAnimationFrame(vvRaf); vvRaf = 0; }
    vvBound = false;
  }

  /* ── Drag-to-dismiss (sheet variant) ──────────────────────────────────── */
  function scrollableAncestor(node, root) {
    while (node && node !== root && node.nodeType === 1) {
      if (node.classList && node.classList.contains(SCROLL_CLASS)) return node;
      node = node.parentNode;
    }
    return null;
  }

  function bindDrag(r) {
    var panel = r.panel;
    if (!panel) return;

    var g = null;
    function start(ev) {
      if (!ev.touches || ev.touches.length !== 1) return;
      var t = ev.touches[0];
      var region = scrollableAncestor(ev.target, panel);
      g = {
        x0: t.clientX, y0: t.clientY, t0: Date.now(),
        fromHandle: !!(ev.target.closest && ev.target.closest('.' + HANDLE_CLASS)),
        scrollable: !!region,
        scrollTop: region ? region.scrollTop : 0,
        mode: 'pending',
      };
    }
    function move(ev) {
      if (!g || !ev.touches || ev.touches.length !== 1) return;
      var t = ev.touches[0];
      var dx = t.clientX - g.x0;
      var dy = t.clientY - g.y0;

      if (g.mode === 'pending') {
        g.mode = classifyGesture({
          dx: dx, dy: dy, fromHandle: g.fromHandle,
          scrollable: g.scrollable, scrollTop: g.scrollTop,
        });
        if (g.mode === 'pending') return;
        if (g.mode === 'scroll') return;               // browser keeps the gesture
        // Claiming a drag: drop the keyboard first. The user is pulling the
        // sheet away anyway, and it removes any transform/caret interaction.
        if (doc.activeElement && panel.contains(doc.activeElement)) {
          try { doc.activeElement.blur(); } catch (e) { /* contained */ }
        }
        panel.setAttribute(DRAG_ATTR, 'true');
      }
      if (g.mode !== 'drag') return;
      if (ev.cancelable) ev.preventDefault();          // we own this gesture now
      panel.style.transform = 'translateY(' + dragOffset(dy) + 'px)';
    }
    function end() {
      if (!g) return;
      var claimed = g.mode === 'drag';
      var moved = claimed ? parseFloat((panel.style.transform.match(/translateY\((-?[\d.]+)px\)/) || [0, 0])[1]) : 0;
      var elapsed = Date.now() - g.t0;
      g = null;
      panel.removeAttribute(DRAG_ATTR);
      panel.style.transform = '';
      if (!claimed) return;
      if (shouldDismiss({ dy: moved, elapsedMs: elapsed, sheetHeight: panel.offsetHeight })) {
        close(r.el, 'swipe');
      }
    }

    r.drag = { start: start, move: move, end: end };
    // `passive: false` on touchmove is required — a passive listener cannot
    // preventDefault, so the page would scroll underneath a claimed drag.
    panel.addEventListener('touchstart', start, { passive: true });
    panel.addEventListener('touchmove', move, { passive: false });
    panel.addEventListener('touchend', end, { passive: true });
    panel.addEventListener('touchcancel', end, { passive: true });
  }

  function unbindDrag(r) {
    if (!r.drag || !r.panel) return;
    r.panel.removeEventListener('touchstart', r.drag.start);
    r.panel.removeEventListener('touchmove', r.drag.move);
    r.panel.removeEventListener('touchend', r.drag.end);
    r.panel.removeEventListener('touchcancel', r.drag.end);
    r.panel.style.transform = '';
    r.panel.removeAttribute(DRAG_ATTR);
    r.drag = null;
  }

  /* ── Document-level handlers (bound once, while anything is open) ────── */
  function onKeydown(ev) {
    var r = top();
    if (!r) return;
    if (ev.key === 'Escape') {
      // A consumer may own Escape first (the picker collapses its filter panel
      // before closing). Returning true means "handled — do not close".
      if (typeof r.opts.onEscape === 'function' && r.opts.onEscape(ev) === true) return;
      if (r.opts.dismissible === false) return;
      ev.preventDefault();
      close(r.el, 'escape');
      return;
    }
    if (ev.key === 'Tab') trapTab(r, ev);
  }

  function onPointerDown(ev) {
    var r = top();
    if (!r || r.opts.dismissible === false) return;
    // Only a press on the backdrop itself — never one that started inside the
    // panel and released outside it, which is how a drag-select would read.
    if (ev.target !== r.el) return;
    r.backdropArmed = true;
  }
  function onClick(ev) {
    var r = top();
    if (!r) return;
    var armed = r.backdropArmed;
    r.backdropArmed = false;
    if (r.opts.dismissible === false) return;
    if (ev.target !== r.el || !armed) return;
    close(r.el, 'backdrop');
  }

  function bindDocument() {
    if (stack.length !== 1 || !doc) return;   // only on the first open
    doc.addEventListener('keydown', onKeydown, true);
    doc.addEventListener('pointerdown', onPointerDown, true);
    doc.addEventListener('click', onClick, true);
  }
  function unbindDocument() {
    if (stack.length !== 0 || !doc) return;   // only after the last close
    doc.removeEventListener('keydown', onKeydown, true);
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('click', onClick, true);
  }

  /* ── Public API ─────────────────────────────────────────────────────── */

  /* open(el, opts)
   *   variant       'dialog' (default) | 'sheet'
   *                 'sheet' adds drag-to-dismiss and keyboard avoidance. A
   *                 confirmation is NOT a sheet — see the migration note in
   *                 docs/ROADMAP-HISTORY.md; a destructive confirm must be
   *                 dismissed deliberately, never by a stray downward swipe.
   *   panel         selector or element for the dialog panel inside `el`.
   *                 Defaults to the first element child.
   *   dismissible   false disables Escape, backdrop and swipe. The consumer
   *                 must then provide its own close control.
   *   initialFocus  selector or element to focus on open.
   *   onEscape      optional pre-handler; return true to consume the key.
   *   onClose       called after close with the reason
   *                 ('api' | 'escape' | 'backdrop' | 'swipe').
   */
  function open(el, opts) {
    if (!isEl(el) || !doc) return false;
    if (rec(el)) return true;                       // idempotent

    opts = opts || {};
    var panel = null;
    if (opts.panel) {
      panel = typeof opts.panel === 'string' ? el.querySelector(opts.panel) : opts.panel;
    }
    if (!panel) panel = el.firstElementChild;

    var r = {
      el: el,
      panel: panel,
      opts: opts,
      returnFocus: doc.activeElement,
      backdropArmed: false,
      drag: null,
      // Phase 4.3.5G — the form's state at the moment it opened. Comparing
      // against it is how "the user typed something they have not committed"
      // is detected for EVERY dialog at once, rather than each one growing its
      // own dirty tracking. Values are compared and discarded; nothing is
      // stored, sent or read beyond the boolean answer.
      formSnapshot: dirtyApi() ? global.MMDirty.snapshotForm(el) : null,
    };
    stack.push(r);

    el.classList.add(OPEN_CLASS);
    if (panel) {
      // aria-modal is only meaningful on a dialog role, and a consumer that
      // already declares them keeps its own values.
      if (!panel.getAttribute('role')) panel.setAttribute('role', 'dialog');
      if (!panel.getAttribute('aria-modal')) panel.setAttribute('aria-modal', 'true');
    }

    applyLock();
    bindDocument();
    syncDirty();
    el.addEventListener('input', onDirtyInput);
    if (opts.variant === 'sheet') { bindDrag(r); bindViewport(); }
    focusInitial(r);
    return true;
  }

  function close(el, reason) {
    if (!isEl(el) || !doc) return false;
    var r = rec(el);
    if (!r) return false;
    stack.splice(stack.indexOf(r), 1);

    el.classList.remove(OPEN_CLASS);
    el.style.bottom = '';
    unbindDrag(r);
    unbindViewport();
    releaseLock();
    unbindDocument();
    el.removeEventListener('input', onDirtyInput);
    // A closed dialog can hold nothing unsaved — whatever was typed in it is
    // either committed or deliberately abandoned by the user.
    syncDirty();

    // Restore focus to whatever opened the dialog, so keyboard users are not
    // dropped back at the top of the document.
    var back = r.returnFocus;
    if (back && typeof back.focus === 'function' && doc.contains(back)) {
      try { back.focus({ preventScroll: true }); } catch (e) {
        try { back.focus(); } catch (e2) { /* contained */ }
      }
    }
    if (typeof r.opts.onClose === 'function') {
      try { r.opts.onClose(reason || 'api'); } catch (e) { /* contained */ }
    }
    return true;
  }

  function isOpen(el) { return !!rec(el); }
  function openCount() { return stack.length; }
  function isLocked() { return lock.depth() > 0; }

  var MMSheet = {
    // pure
    SHEET_GESTURE: SHEET_GESTURE,
    FOCUSABLE: FOCUSABLE,
    classifyGesture: classifyGesture,
    shouldDismiss: shouldDismiss,
    dragOffset: dragOffset,
    nextFocusIndex: nextFocusIndex,
    createLockCounter: createLockCounter,
    // DOM
    open: open,
    close: close,
    isOpen: isOpen,
    openCount: openCount,
    isLocked: isLocked,
    LOCK_CLASS: LOCK_CLASS,
    SCROLL_CLASS: SCROLL_CLASS,
    HANDLE_CLASS: HANDLE_CLASS,
  };

  if (global) global.MMSheet = MMSheet;

  /* Node: export for tests. Guarded so browsers never see `module`. */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MMSheet;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
