/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Checkout Intent
 *
 * Remembers which Program a signed-out visitor tapped "Buy" on, so that after
 * they sign in or create an account (and finish onboarding) they land back on
 * that Program's checkout instead of the dashboard.
 *
 * ── RULES ─────────────────────────────────────────────────────────────────
 * • It holds a product SLUG only — never a URL. The one destination it can
 *   produce is `checkout.html?product=<slug>`, so it cannot be turned into an
 *   open redirect. checkout.html still validates the slug itself.
 * • sessionStorage, same as the onboarding draft: tab-scoped, survives the
 *   Google OAuth round trip, gone when the tab closes. A short TTL bounds the
 *   "abandoned, came back much later" case.
 * • It is read ONCE: `take` returns the slug and clears it, so Back from
 *   checkout can never loop the buyer back into checkout.
 * • It decides nothing about access or payment. Stripe, the server's 409
 *   already-owned guard and checkout.html are unchanged.
 * • Every storage failure degrades to "no intent" — the normal route.
 *
 * Dual runtime, same pattern as every shared core:
 *   • Browser — <script src="checkout-intent.js"> exposes `CheckoutIntent`.
 *   • Node — guarded module.exports for tests.
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  var KEY = 'mm_checkout_intent_v1';
  var TTL_MS = 30 * 60 * 1000;
  var SLUG_RE = /^[a-z][a-z0-9_]{0,39}$/;

  function isValidSlug(slug) {
    return typeof slug === 'string' && SLUG_RE.test(slug);
  }

  /* ── pure ─────────────────────────────────────────────────────────────── */
  function serialize(slug, now) {
    return JSON.stringify({ slug: slug, at: now });
  }

  // Returns the slug, or null for anything missing, malformed, invalid or stale.
  function read(raw, now) {
    if (typeof raw !== 'string' || !raw) return null;
    var v;
    try { v = JSON.parse(raw); } catch (e) { return null; }
    if (!v || !isValidSlug(v.slug) || typeof v.at !== 'number') return null;
    if (!(now - v.at >= 0 && now - v.at <= TTL_MS)) return null;
    return v.slug;
  }

  function checkoutUrl(slug) {
    return isValidSlug(slug) ? 'checkout.html?product=' + encodeURIComponent(slug) : null;
  }

  // Where a signed-in, onboarded user goes next: their pending checkout, or
  // the given default (the dashboard).
  function destination(slug, fallback) {
    return checkoutUrl(slug) || fallback;
  }

  /* ── browser storage (thin) ───────────────────────────────────────────── */
  function storage() {
    try {
      if (typeof sessionStorage === 'undefined') return null;
      return sessionStorage;
    } catch (e) { return null; }
  }

  function save(slug, now) {
    var s = storage();
    if (!s || !isValidSlug(slug)) return false;
    try { s.setItem(KEY, serialize(slug, now)); return true; } catch (e) { return false; }
  }

  function clear() {
    var s = storage();
    if (!s) return false;
    try { s.removeItem(KEY); return true; } catch (e) { return false; }
  }

  // Read once: returns the pending slug (or null) and always clears it.
  function take(now) {
    var s = storage();
    if (!s) return null;
    var slug = null;
    try { slug = read(s.getItem(KEY), now); } catch (e) { slug = null; }
    clear();
    return slug;
  }

  // Convenience for the redirect sites: consume the intent and return where to go.
  function next(fallback, now) {
    return destination(take(now), fallback);
  }

  var CheckoutIntent = {
    KEY: KEY,
    TTL_MS: TTL_MS,
    isValidSlug: isValidSlug,
    serialize: serialize,
    read: read,
    checkoutUrl: checkoutUrl,
    destination: destination,
    save: save,
    clear: clear,
    take: take,
    next: next
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CheckoutIntent;
  root.CheckoutIntent = CheckoutIntent;
})(typeof window !== 'undefined' ? window : this);
