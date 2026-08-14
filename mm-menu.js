/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Shared Responsive Header Menu  ·  Phase 4.3.5I
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────
 * The hamburger drawer on the public pages was a `position: relative` block
 * sitting in normal document flow, immediately after a `position: sticky`
 * header. Two consequences, and both were reported:
 *
 *   • At any scroll depth the header is pinned to the top of the VIEWPORT while
 *     the drawer is still parked at its position in the DOCUMENT, near the top
 *     of the page. Opening the menu therefore rendered it somewhere off-screen
 *     above, and the user had to scroll back to the top to find it.
 *   • Because it was in flow, revealing it inserted its height into the layout
 *     and pushed everything below it down — the page visibly jumped.
 *
 * The fix is positional, not cosmetic: the drawer leaves the flow entirely and
 * is anchored to the live bottom edge of the header, measured at open time. It
 * therefore cannot move the document and is always exactly where the control
 * that opened it is.
 *
 * ── WHY NOT THE 4.3.5C SHEET PRIMITIVE ────────────────────────────────────
 * Considered and deliberately rejected. mm-sheet.js models a MODAL DIALOG: a
 * backdrop plus a panel, centred or bottom-anchored, that takes over the
 * viewport and traps focus until it is dismissed. A header menu is a different
 * interaction — it is a <nav>, it stays visually attached to the header rather
 * than to the viewport edge, it has no backdrop or panel structure to hand the
 * primitive, and it is not modal. Forcing it through mm-sheet would have meant
 * inventing markup for it purely to satisfy the abstraction, which is the
 * over-generalisation the phase brief warns against.
 *
 * What the two DO share — Escape, outside-tap dismissal, focus return, correct
 * layering — is small, and is implemented here for the two consumers that need
 * it rather than by bending either model.
 *
 * Deliberately NOT included: a background scroll lock. The reported defect was
 * position and jump, not scroll coupling, and this drawer never covers the
 * viewport the way a sheet does. Instead the menu CLOSES on scroll, which keeps
 * it from drifting away from the header it belongs to and is what a user who
 * starts scrolling is asking for anyway.
 *
 * Browser global `MMMenu`; Node gets guarded exports of the pure parts.
 * No network, no storage, no service-worker access, no user data.
 * ──────────────────────────────────────────────────────────────────────── */

(function (global) {
  'use strict';

  var DRAWER_CLASS = 'mm-menu-drawer';
  var OPEN_CLASS = 'open';          // preserved: both pages' CSS keys off it
  var TOP_VAR = '--mm-menu-top';
  var Z_VAR = '--mm-menu-z';

  /* ── Pure ────────────────────────────────────────────────────────────────
   * Where the drawer's top edge belongs, given the header's viewport rect.
   *
   * `rect.bottom` is the header's live bottom edge IN THE VIEWPORT, which is
   * the whole point: it is correct whether the page is at the top or scrolled a
   * thousand pixels down, and it needs no knowledge of the header's height —
   * which differs between the two consumers (80px and 68px) and changes at
   * their breakpoints.
   *
   * Clamped at 0 so a header scrolled off the top of a non-sticky layout can
   * never place the drawer above the viewport. */
  function drawerTop(rect) {
    if (!rect || typeof rect.bottom !== 'number' || !isFinite(rect.bottom)) return 0;
    return Math.max(0, Math.round(rect.bottom));
  }

  /* The drawer must paint ABOVE the header it hangs from. The two consumers use
   * very different header stacking values (200 and 1000), so this is derived
   * rather than hard-coded — a literal would be wrong on one of them. */
  function drawerZIndex(headerZ) {
    var z = parseInt(headerZ, 10);
    if (!isFinite(z)) z = 100;
    return z + 1;
  }

  /* ── DOM ─────────────────────────────────────────────────────────────── */
  var doc = (typeof document !== 'undefined') ? document : null;
  var win = (typeof window !== 'undefined') ? window : null;

  function focusables(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    try { return [].slice.call(root.querySelectorAll('a[href], button:not([disabled])')); }
    catch (e) { return []; }
  }

  /* attach({ toggle, drawer, header })
   * All three may be elements or id strings. Returns a controller, or null when
   * the page does not have the markup (so a page without a menu is a no-op). */
  function attach(opts) {
    opts = opts || {};
    if (!doc) return null;

    var toggle = resolve(opts.toggle);
    var drawer = resolve(opts.drawer);
    var header = resolve(opts.header) || (toggle && toggle.closest && toggle.closest('header'));
    if (!toggle || !drawer) return null;

    var isOpen = false;

    // Out of flow, so revealing it can never shift the document.
    drawer.classList.add(DRAWER_CLASS);
    // The drawer is what the toggle controls; announce that relationship.
    if (drawer.id) toggle.setAttribute('aria-controls', drawer.id);
    toggle.setAttribute('aria-expanded', 'false');
    if (!toggle.getAttribute('aria-label')) toggle.setAttribute('aria-label', 'Open menu');

    function position() {
      var top = 0;
      var z = 101;
      if (header) {
        try { top = drawerTop(header.getBoundingClientRect()); } catch (e) { top = 0; }
        try {
          z = drawerZIndex(win.getComputedStyle(header).zIndex);
        } catch (e) { /* keep the default */ }
      }
      drawer.style.setProperty(TOP_VAR, top + 'px');
      drawer.style.setProperty(Z_VAR, String(z));
    }

    function open() {
      if (isOpen) return;
      isOpen = true;
      position();                     // measure at OPEN time, never cached
      drawer.classList.add(OPEN_CLASS);
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
      var first = focusables(drawer)[0];
      if (first) {
        try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
      }
      bind();
    }

    function close(returnFocus) {
      if (!isOpen) return;
      isOpen = false;
      drawer.classList.remove(OPEN_CLASS);
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      unbind();
      // Returning focus to the toggle is what makes the menu usable by keyboard
      // at all: without it, closing drops the user back at the top of the
      // document and they have to tab through the whole header again.
      if (returnFocus) {
        try { toggle.focus({ preventScroll: true }); } catch (e) { toggle.focus(); }
      }
    }

    function onKeydown(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); close(true); }
    }
    function onPointerDown(ev) {
      if (drawer.contains(ev.target) || toggle.contains(ev.target)) return;
      close(false);
    }
    // Scrolling away is an implicit "I'm done with the menu", and closing keeps
    // the drawer from floating detached from the header it hangs off.
    function onScroll() { close(false); }
    function onResize() { position(); }

    function bind() {
      doc.addEventListener('keydown', onKeydown, true);
      doc.addEventListener('pointerdown', onPointerDown, true);
      win.addEventListener('scroll', onScroll, { passive: true });
      win.addEventListener('resize', onResize);
    }
    function unbind() {
      doc.removeEventListener('keydown', onKeydown, true);
      doc.removeEventListener('pointerdown', onPointerDown, true);
      win.removeEventListener('scroll', onScroll);
      win.removeEventListener('resize', onResize);
    }

    toggle.addEventListener('click', function (ev) {
      ev.preventDefault();
      if (isOpen) close(true); else open();
    });
    // Following a link closes the menu — unchanged from the previous behaviour.
    focusables(drawer).forEach(function (el) {
      el.addEventListener('click', function () { close(false); });
    });

    return {
      open: open,
      close: close,
      isOpen: function () { return isOpen; },
      position: position,
    };
  }

  function resolve(v) {
    if (!v) return null;
    if (typeof v === 'string') { try { return doc.getElementById(v); } catch (e) { return null; } }
    return (v.nodeType === 1) ? v : null;
  }

  // Convenience for the two pages that share the same ids.
  function autoAttach() {
    return attach({ toggle: 'menuToggle', drawer: 'mobileNav' });
  }

  var MMMenu = {
    DRAWER_CLASS: DRAWER_CLASS,
    TOP_VAR: TOP_VAR,
    Z_VAR: Z_VAR,
    drawerTop: drawerTop,
    drawerZIndex: drawerZIndex,
    attach: attach,
    autoAttach: autoAttach,
  };

  if (global) global.MMMenu = MMMenu;

  if (doc) {
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', autoAttach);
    } else {
      autoAttach();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MMMenu;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
