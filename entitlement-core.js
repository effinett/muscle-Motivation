/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Entitlement Core  ·  Phase 4.3.6 (CP2a)
 *
 * ONE interpretation of "does this user have access to this Program, and why?".
 *
 * Before this module, seven surfaces each interpreted `purchases` themselves
 * and they had already diverged: five required status='active', while
 * profile.html deliberately also accepted 'past_due' so a member mid-dunning
 * could still reach billing. This module ends that disagreement.
 *
 * PURE. It receives already-fetched data and returns a verdict:
 *   - no DOM, no fetch, no Supabase, no sessionStorage, no Stripe
 *   - deterministic; the same inputs always produce the same verdict
 *
 * It is an APPLICATION-LAYER helper, never a replacement for database RLS.
 * The `program_workouts` policy remains defence in depth.
 *
 * `purchases` stays the authoritative commerce fact store, written only by the
 * Stripe webhook via the service role. Nothing here writes, and no membership
 * or subscription state is copied into a second store.
 *
 * Browser: globals below. Node: guarded module.exports.
 * ──────────────────────────────────────────────────────────────────────── */

/* ── policy — every status rule lives here, and only here ───────────────── */

// The membership product. Access branch M keys off PRODUCT IDENTITY, not the
// presence of a Stripe column: no production purchase row currently populates
// stripe_subscription_id or stripe_payment_intent_id, so those columns cannot
// classify a row.
var ENT_MEMBERSHIP_PRODUCT = 'ai_membership';

// Statuses that grant access.
//
// One rule covers both branches on purpose. api/stripe-webhook.js writes
// 'past_due' (invoice.payment_failed) and 'canceled' (subscription.deleted)
// ONLY against a stripe_subscription_id, so a one-time standalone purchase can
// only legitimately be 'active' or 'refunded'. A second vocabulary would add
// no coverage and would be one more thing to keep in sync.
//
// 'past_due' grants during Stripe's dunning window: the retry is short, and
// Stripe flips the subscription to canceled if it ultimately fails. Revoking
// mid-retry punishes a user whose card merely expired.
//
// 'canceled' and 'refunded' do not grant. 'refunded' is terminal — the webhook
// guards every restore with status=neq.refunded so it can never return to
// active.
var ENT_QUALIFYING_STATUSES = ['active', 'past_due'];

// Anything not explicitly listed above fails closed, including a missing,
// empty, or unrecognised status.
function entIsQualifyingStatus(status) {
  if (typeof status !== 'string') return false;
  return ENT_QUALIFYING_STATUSES.indexOf(status) >= 0;
}

/* ── input normalization ────────────────────────────────────────────────── */

// Accepts either a catalog program normalized by program-catalog.js
// (camelCase) or a raw public.programs row (snake_case). Returns null when the
// input cannot identify a Program, which callers turn into a closed verdict.
function entReadProgram(program) {
  if (!program || typeof program !== 'object') return null;
  var slug = program.slug;
  if (typeof slug !== 'string' || !slug) return null;
  var included = (program.includedWithMembership !== undefined)
    ? program.includedWithMembership
    : program.included_with_membership;
  return { slug: slug, includedWithMembership: included === true };
}

function entIsPurchaseRow(row) {
  return !!row && typeof row === 'object' && typeof row.product === 'string';
}

/* ── verdicts ───────────────────────────────────────────────────────────── */

function entVerdict(allowed, source, reason, viaMembership, viaStandalone) {
  return {
    allowed: allowed,
    source: source,
    reason: reason,
    // Both branches stay observable even when only one decides the verdict.
    via: { membership: viaMembership === true, standalone: viaStandalone === true },
  };
}

/* ── branches ───────────────────────────────────────────────────────────── */

// Branch M — a qualifying membership purchase exists. Says nothing about any
// particular Program; whether it GRANTS one is the Program's own declaration.
function entHasQualifyingMembership(purchaseRows) {
  if (!Array.isArray(purchaseRows)) return false;
  for (var i = 0; i < purchaseRows.length; i++) {
    var row = purchaseRows[i];
    if (!entIsPurchaseRow(row)) continue;
    if (row.product !== ENT_MEMBERSHIP_PRODUCT) continue;
    if (entIsQualifyingStatus(row.status)) return true;
  }
  return false;
}

// Branch S — a qualifying standalone purchase exists for this exact Program.
//
// Deliberately does NOT consult the Program's `standalonePurchasable` flag.
// That flag describes whether the Program may be SOLD standalone today; it is
// a merchandising decision. Ownership is established by the purchase row, so
// withdrawing a Program from sale must never revoke it from someone who
// already bought it.
function entOwnsStandalone(purchaseRows, slug) {
  if (!Array.isArray(purchaseRows)) return false;
  if (typeof slug !== 'string' || !slug) return false;
  for (var i = 0; i < purchaseRows.length; i++) {
    var row = purchaseRows[i];
    if (!entIsPurchaseRow(row)) continue;
    if (row.product !== slug) continue;
    if (entIsQualifyingStatus(row.status)) return true;
  }
  return false;
}

/* ── the resolver ───────────────────────────────────────────────────────── */

// Does this user have access to this Program, and why?
//
// Access = Branch S OR Branch M. The branches are independent: a membership
// that never existed, expired, or was cancelled can never invalidate a valid
// standalone purchase, because nothing in Branch S reads membership state.
//
// `current_period_end` is NOT consulted. The webhook-maintained `status` is
// authoritative; independently interpreting a period end here would duplicate
// billing logic and produce false denials from a stale row or client clock
// drift. It stays available on the row for display.
//
// When both branches succeed the source is 'standalone' — the stronger claim,
// since it survives any membership change. `via` still reports both.
function resolveProgramAccess(program, purchaseRows) {
  var prog = entReadProgram(program);
  if (!prog) return entVerdict(false, 'none', 'invalid_program', false, false);
  if (!Array.isArray(purchaseRows)) {
    // Includes null/undefined: access could not be evaluated, so deny.
    return entVerdict(false, 'none', 'invalid_purchases', false, false);
  }

  var standalone = entOwnsStandalone(purchaseRows, prog.slug);
  var membership = prog.includedWithMembership
    && entHasQualifyingMembership(purchaseRows);

  if (standalone) {
    return entVerdict(true, 'standalone', 'standalone_purchase', membership, true);
  }
  if (membership) {
    return entVerdict(true, 'membership', 'membership_included', true, false);
  }
  return entVerdict(false, 'none', 'no_qualifying_purchase', false, false);
}

/* Node: guarded exports (browser uses the globals above). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ENT_MEMBERSHIP_PRODUCT: ENT_MEMBERSHIP_PRODUCT,
    ENT_QUALIFYING_STATUSES: ENT_QUALIFYING_STATUSES,
    entIsQualifyingStatus: entIsQualifyingStatus,
    entHasQualifyingMembership: entHasQualifyingMembership,
    entOwnsStandalone: entOwnsStandalone,
    resolveProgramAccess: resolveProgramAccess,
  };
}
