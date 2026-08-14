/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Shared App Navigation / App Shell  ·  Phase 4.3.4 (CP2)
 *
 * ONE source of truth for the authenticated application's primary destinations
 * and for the rules that decide whether a page participates in navigation.
 * Everything a future surface needs (Coach, HIIT/circuit modes, hybrid training,
 * reminders, widgets, manifest shortcuts) is expressed as DATA in NAV_DESTINATIONS
 * rather than as markup duplicated across pages.
 *
 * Same architectural shape as weight.js / snapshot.js:
 *   - PURE, DOM-free decision layer (route resolution, suppression, markup
 *     building) — Node-testable, no globals required.
 *   - a THIN DOM layer (mount / setView / refresh) used only in the browser.
 * Browser: global `AppNav`.  Node: guarded module.exports of the pure parts.
 *
 * INTEGRATION CONTRACTS (do not break without approval):
 *   - The rendered <nav> carries `data-mm-sw-bottom-control`, the attribute the
 *     completed Phase 4.3.2/4.3.3 systems already query
 *     (sw-register.js BOTTOM_CONTROL_SELECTORS / pwa-install-register.js
 *     DEFAULT_BOTTOM_SELECTORS). The service-worker update banner and the PWA
 *     install sheet therefore detect and clear the nav with NO change to those
 *     modules. A nav inside a hidden #appContent measures as a zero rect and is
 *     correctly ignored by them.
 *   - `--mm-nav-base-height` / `--mm-bottom-clearance` (app-shell.css) are the
 *     ONE bottom-clearance strategy. This module only toggles the
 *     `mm-has-nav` class on <html>; every offset is derived in CSS.
 *
 * This module performs NO network, NO storage, NO service-worker and NO cache
 * access of any kind, and never reads user data. It is presentation only.
 * ──────────────────────────────────────────────────────────────────────── */

(function (global) {
  'use strict';

  /* ── Route registry — the single source of truth ────────────────────────
   * id       stable destination identity (used by tests, active state, and any
   *          future badge / shortcut / deep-link work). Never reuse an id.
   * label    the accessible name AND the visible label (never icon-only).
   * href     canonical entry route. EXISTING URLS ARE PRESERVED VERBATIM —
   *          this registry describes the app as it is, it does not re-route it.
   * routes   every page that belongs to this destination (child routes map to
   *          their parent for active state, e.g. workout-history → Train).
   * available  false → the destination is reserved in the registry but is NOT
   *          rendered at all. It is never drawn as a disabled/dead tab, because
   *          a permanently dead tab is UI deception. Flipping this to true is
   *          the only change needed when the destination ships.
   */
  var NAV_DESTINATIONS = [
    {
      id: 'home',
      label: 'Home',
      href: 'app.html',
      available: true,
      // profile.html is the SECONDARY account destination reached from Home —
      // a child route, deliberately not a sixth primary tab.
      routes: ['app.html', 'profile.html'],
    },
    {
      id: 'train',
      label: 'Train',
      href: 'workout.html',
      available: true,
      // workout-complete.html resolves to Train for identity/active-state
      // purposes even though it suppresses the nav (see SUPPRESSED_ROUTES).
      routes: ['workout.html', 'workout-history.html', 'workout-complete.html'],
    },
    {
      id: 'nutrition',
      label: 'Nutrition',
      href: 'nutrition.html',
      available: true,
      routes: ['nutrition.html'],
    },
    {
      id: 'progress',
      label: 'Progress',
      href: 'weight-history.html',
      available: true,
      routes: ['weight-history.html'],
    },
    {
      // Phase 4.4. Reserved so route identity, ordering and future badge state
      // exist now; renders nothing until Coach genuinely ships.
      id: 'coach',
      label: 'Coach',
      href: null,
      available: false,
      routes: [],
    },
  ];

  /* Pages that belong to a destination but deliberately show NO nav.
   *   workout-complete.html — terminal receipt; owns the bottom band via
   *                           .done-bar and is chrome-free by design.
   *   onboarding.html       — gated linear wizard; both exits are
   *                           location.replace, and its nav targets would be
   *                           empty because no profile exists yet. */
  var SUPPRESSED_ROUTES = ['workout-complete.html', 'onboarding.html'];

  /* Per-VIEW suppression. workout.html is a single URL that hosts both a browse
   * surface (#startView / #builderView) and a live, timed capture surface
   * (#activeView) toggled by `display`. Nav decisions on that page are therefore
   * view-conditional, never page-conditional. */
  var VIEW_SUPPRESSED = { 'workout.html': ['active'] };

  var MOUNT_ID = 'appNavMount';
  var NAV_ID = 'mmNav';
  var HAS_NAV_CLASS = 'mm-has-nav';
  var PENDING_CLASS = 'is-pending';

  /* Inline, stroke-based icons. Deliberately NOT an icon-library dependency:
   * the nav must render identically regardless of when (or whether) a page
   * runs its icon pass, and must not add a payload. Decorative only — every
   * item is labelled by its visible text. */
  var ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.8V20a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V9.8"/>',
    train: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
    nutrition: '<path d="M4 3v6a2.5 2.5 0 0 0 5 0V3M6.5 11v10"/><path d="M17.5 3c-1.4 1.6-2 3.6-2 5.6 0 1.6.7 2.6 2 2.6V21"/>',
    progress: '<path d="M3 16.5 9 10l4 4 8-8"/><path d="M15 6h6v6"/>',
  };

  function icon(id) {
    var d = ICONS[id];
    if (!d) return '';
    return '<svg class="mm-nav-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true" focusable="false">' + d + '</svg>';
  }

  /* ── Pure: route normalization + resolution ─────────────────────────────── */

  // Reduce any location/pathname to a bare, lower-cased page file name.
  // '/app.html?x=1#y' → 'app.html'   ·   '/' or '/dir/' → ''  (unknown)
  function normalizeRoute(pathname) {
    if (typeof pathname !== 'string') return '';
    var p = pathname.split('?')[0].split('#')[0];
    var seg = p.slice(p.lastIndexOf('/') + 1);
    return seg ? seg.toLowerCase() : '';
  }

  function getDestination(id) {
    for (var i = 0; i < NAV_DESTINATIONS.length; i++) {
      if (NAV_DESTINATIONS[i].id === id) return NAV_DESTINATIONS[i];
    }
    return null;
  }

  // The destination a route belongs to, or null when the route is outside the
  // authenticated app (marketing pages, auth, store, …). Child routes resolve
  // to their parent destination.
  function resolveDestinationId(pathname) {
    var route = normalizeRoute(pathname);
    if (!route) return null;
    for (var i = 0; i < NAV_DESTINATIONS.length; i++) {
      if (NAV_DESTINATIONS[i].routes.indexOf(route) >= 0) return NAV_DESTINATIONS[i].id;
    }
    return null;
  }

  // The destinations that actually render, in registry order. Unavailable
  // destinations are omitted entirely — never rendered as disabled items.
  function navigableDestinations() {
    var out = [];
    for (var i = 0; i < NAV_DESTINATIONS.length; i++) {
      var d = NAV_DESTINATIONS[i];
      if (d.available && d.href) out.push(d);
    }
    return out;
  }

  /* ── Pure: navigation-performance policy (Phase 4.3.5F) ─────────────────
   *
   * Prefetching a destination is only ever worth it when the connection can
   * afford it. This is the whole decision, kept pure so it is testable and so
   * the rule is stated once rather than scattered through event handlers.
   *
   * conn — a navigator.connection-shaped object, or null when the API is
   *        absent (most browsers): unknown means "assume a normal connection",
   *        which is the same assumption the app already makes for every other
   *        request it issues.
   *
   * IMPORTANT — what may be prefetched. Only the destination's HTML SHELL,
   * which is a static document containing no user data: every authenticated
   * value on every page is loaded client-side from the data layer after the
   * document has parsed. This respects roadmap §2.5 — no authenticated
   * response, no /api/* route and no auth or session state is ever prefetched
   * or cached, and nothing here touches the service worker or its caches. */
  function shouldPrefetch(conn) {
    if (!conn) return true;                        // API unavailable → normal assumption
    if (conn.saveData === true) return false;      // the user asked us not to
    var t = conn.effectiveType;
    if (typeof t === 'string' && (t === 'slow-2g' || t === '2g')) return false;
    return true;
  }

  /* ── Pure: participation rules ─────────────────────────────────────────── */
  // opts: { pathname, view }
  //   view — optional page view state ('start' | 'active' | 'builder' | …).
  //          Only used by routes listed in VIEW_SUPPRESSED.
  function shouldShowNav(opts) {
    opts = opts || {};
    var route = normalizeRoute(opts.pathname);
    if (!route) return false;
    if (SUPPRESSED_ROUTES.indexOf(route) >= 0) return false;
    if (!resolveDestinationId(route)) return false;
    var views = VIEW_SUPPRESSED[route];
    if (views && opts.view != null && views.indexOf(String(opts.view)) >= 0) return false;
    return true;
  }

  /* ── Pure: markup ──────────────────────────────────────────────────────── */
  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Returns '' when the state does not render a nav, so a caller can assign the
  // result unconditionally. `data-mm-sw-bottom-control` is REQUIRED — it is how
  // the SW update banner and the install sheet discover the nav.
  function navMarkup(state) {
    state = state || {};
    if (!shouldShowNav(state)) return '';
    var activeId = resolveDestinationId(state.pathname);
    var items = navigableDestinations();
    if (!items.length) return '';

    var html = '<nav class="mm-nav" id="' + NAV_ID + '" aria-label="Primary" data-mm-sw-bottom-control>';
    for (var i = 0; i < items.length; i++) {
      var d = items[i];
      var isActive = d.id === activeId;
      html += '<a class="mm-nav-item' + (isActive ? ' is-active' : '') + '"' +
        ' data-mm-nav-id="' + escapeAttr(d.id) + '"' +
        ' href="' + escapeAttr(d.href) + '"' +
        (isActive ? ' aria-current="page"' : '') + '>' +
        '<span class="mm-nav-icon">' + icon(d.id) + '</span>' +
        '<span class="mm-nav-label">' + escapeAttr(d.label) + '</span>' +
        '</a>';
    }
    return html + '</nav>';
  }

  /* ── Thin DOM layer (browser only) ─────────────────────────────────────── */
  var doc = (typeof document !== 'undefined') ? document : null;
  var state = { view: null, mounted: false };

  function currentPathname() {
    try {
      if (global && global.location && typeof global.location.pathname === 'string') {
        return global.location.pathname;
      }
    } catch (e) { /* contained */ }
    return '';
  }

  // Render (or clear) the nav and keep the <html> clearance class in sync.
  // Every failure path degrades to "no nav" rather than a broken page.
  function refresh() {
    if (!doc) return false;
    var mount;
    try { mount = doc.getElementById(MOUNT_ID); } catch (e) { return false; }
    if (!mount) return false;

    var ctx = { pathname: currentPathname(), view: state.view };
    var show = shouldShowNav(ctx);
    try {
      mount.innerHTML = show ? navMarkup(ctx) : '';
      var root = doc.documentElement;
      if (root && root.classList) {
        if (show) root.classList.add(HAS_NAV_CLASS);
        else root.classList.remove(HAS_NAV_CLASS);
      }
      if (show) bindNavPerformance(doc.getElementById(NAV_ID));
    } catch (e) {
      return false;
    }
    state.mounted = show;
    return show;
  }

  /* ── Navigation performance (Phase 4.3.5F) ──────────────────────────────
   *
   * Two effects, both presentation-only, both bound once per nav render.
   *
   * 1 · TAP ACKNOWLEDGEMENT (the phase's one hard target, ≤100ms).
   *     `:active` in the shell gives the press itself an immediate paint. This
   *     handler then moves the ACTIVE INDICATOR to the tapped destination on
   *     click, before the browser has fetched anything, so the nav already
   *     reads as "you are going here" while the document loads.
   *
   *     It is deliberately optimistic. If the navigation is somehow abandoned,
   *     the indicator is briefly wrong on a page that was about to be replaced;
   *     `pageshow` puts it back when a document returns from the bfcache. That
   *     trade is worth an unconditional sub-frame response to every tap.
   *
   * 2 · INTENT PREFETCH. On the first sign of intent — a pointer entering the
   *     item, or a finger landing on it — the destination's static HTML shell
   *     is prefetched. On a touch device that is the ~80-120ms between touch
   *     and release; with a mouse it is longer. `rel=prefetch` is a hint: an
   *     engine that ignores it (Safari) simply behaves exactly as before.
   *     Each destination is hinted at most once per document. */
  var prefetched = {};

  function connection() {
    try { return (global && global.navigator && global.navigator.connection) || null; }
    catch (e) { return null; }
  }

  function prefetchDestination(href) {
    if (!doc || !href || prefetched[href]) return false;
    if (!shouldPrefetch(connection())) return false;
    prefetched[href] = true;
    try {
      var link = doc.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      // A document, not a subresource — the shell we are about to navigate to.
      link.as = 'document';
      (doc.head || doc.documentElement).appendChild(link);
      return true;
    } catch (e) {
      return false;
    }
  }

  function markPending(item) {
    if (!item || !item.parentNode) return;
    var items = item.parentNode.children;
    for (var i = 0; i < items.length; i++) items[i].classList.remove(PENDING_CLASS);
    // Never fight the real active state when the user re-taps where they are.
    if (!item.classList.contains('is-active')) item.classList.add(PENDING_CLASS);
  }

  function bindNavPerformance(nav) {
    if (!nav) return;
    function itemFrom(ev) {
      var t = ev.target;
      return (t && t.closest) ? t.closest('.mm-nav-item') : null;
    }
    // Intent: whichever comes first for this input device.
    function onIntent(ev) {
      var item = itemFrom(ev);
      if (item) prefetchDestination(item.getAttribute('href'));
    }
    nav.addEventListener('pointerenter', onIntent, true);
    nav.addEventListener('pointerdown', onIntent, true);
    nav.addEventListener('click', function (ev) {
      var item = itemFrom(ev);
      if (item) markPending(item);
    }, true);
  }

  // Record the host page's view state and re-evaluate. Called by workout.html
  // from its three view transitions so #activeView suppresses the nav.
  function setView(view) {
    state.view = (view == null) ? null : String(view);
    return refresh();
  }

  function mount(opts) {
    if (opts && opts.view != null) state.view = String(opts.view);
    return refresh();
  }

  function init() {
    if (!doc) return;
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', function () { mount(); });
    } else {
      mount();
    }
    // A document restored from the back/forward cache keeps whatever optimistic
    // pending state it had when the user navigated away. Re-deriving the nav
    // from the URL is the cheapest correct answer (Phase 4.3.5F).
    if (global && typeof global.addEventListener === 'function') {
      global.addEventListener('pageshow', function (ev) {
        if (ev && ev.persisted) refresh();
      });
    }
  }

  var AppNav = {
    NAV_DESTINATIONS: NAV_DESTINATIONS,
    SUPPRESSED_ROUTES: SUPPRESSED_ROUTES,
    VIEW_SUPPRESSED: VIEW_SUPPRESSED,
    MOUNT_ID: MOUNT_ID,
    NAV_ID: NAV_ID,
    HAS_NAV_CLASS: HAS_NAV_CLASS,
    PENDING_CLASS: PENDING_CLASS,
    shouldPrefetch: shouldPrefetch,
    normalizeRoute: normalizeRoute,
    getDestination: getDestination,
    resolveDestinationId: resolveDestinationId,
    navigableDestinations: navigableDestinations,
    shouldShowNav: shouldShowNav,
    navMarkup: navMarkup,
    mount: mount,
    setView: setView,
    refresh: refresh,
  };

  if (global) global.AppNav = AppNav;
  if (doc) init();

  /* Node: export the module for tests. Guarded so browsers never see `module`. */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AppNav;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
