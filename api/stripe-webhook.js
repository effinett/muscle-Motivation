// /api/stripe-webhook.js
// Receives Stripe events and writes to the purchases table using the
// service role key (bypasses RLS — this is the ONLY writer to purchases).
//
// Events handled:
//   checkout.session.completed              → upsert a purchase row (idempotent) + store customer id
//   customer.subscription.created/updated   → sync status + renewal date
//   customer.subscription.deleted           → flip status to 'canceled'
//   invoice.payment_failed                  → flip status to 'past_due'
//   charge.refunded                         → revoke a fully-refunded one-time purchase

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_SECRET       = process.env.STRIPE_WEBHOOK_SECRET;

// Vercel must NOT parse the body — Stripe signature verification
// requires the raw bytes exactly as Stripe sent them.
const handler = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Read raw body and verify Stripe signature.
  let event;
  try {
    const body = await rawBody(req);
    const sig  = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  // 2. Route to handler. Return 500 on failure so Stripe retries.
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await onCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await onSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await onSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_failed':
        await onInvoicePaymentFailed(event.data.object);
        break;
      case 'charge.refunded':
        await onChargeRefunded(event.data.object);
        break;
      default:
        // Acknowledge but ignore all other event types.
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error(`Error handling ${event.type}:`, err);
    return res.status(500).json({ error: 'Handler failed' });
  }
};

handler.config = { api: { bodyParser: false } };
module.exports = handler;

// ── Helpers ────────────────────────────────────────────────────────────────

// Read the raw request body as a Buffer (required for Stripe sig verification).
async function rawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// Call Supabase REST API with service role key — bypasses RLS entirely.
async function supabaseRequest(method, path, body, prefer = 'return=minimal') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey:          SUPABASE_SERVICE_KEY,
      Authorization:   `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type':  'application/json',
      Prefer:          prefer,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${path} → ${res.status}: ${text}`);
  }
  // return=minimal yields an empty body; return=representation yields rows.
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ── Event handlers ─────────────────────────────────────────────────────────

// Upsert on stripe_session_id — duplicate webhook deliveries are a no-op.
async function onCheckoutCompleted(session) {
  const userId  = session.client_reference_id;
  const product = session.metadata?.product;

  if (!userId || !product) {
    console.warn('checkout.session.completed: missing user_id or product', { id: session.id });
    return;
  }

  // For subscriptions, retrieve the sub so we can store the renewal date up
  // front (rather than waiting for the next subscription.updated event).
  let periodEnd = null;
  if (session.subscription) {
    try {
      const sub = await stripe.subscriptions.retrieve(session.subscription);
      periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
    } catch (err) {
      console.warn('Could not retrieve subscription for period end:', err.message);
    }
  }

  await supabaseRequest(
    'POST',
    'purchases?on_conflict=stripe_session_id',
    {
      user_id:                  userId,
      product,
      status:                   'active',
      stripe_session_id:        session.id,
      stripe_subscription_id:   session.subscription ?? null,
      stripe_payment_intent_id: session.payment_intent ?? null, // one-time only; null for subs
      current_period_end:       periodEnd,
    },
    'resolution=merge-duplicates,return=minimal'
  );

  // Persist the Stripe customer id on the profile so we can open the billing
  // portal later and reuse the same customer on repeat checkouts.
  if (session.customer) {
    await supabaseRequest(
      'PATCH',
      `profiles?id=eq.${encodeURIComponent(userId)}`,
      { stripe_customer_id: session.customer }
    );
  }
}

// Subscription fully deleted (end of billing period or immediate cancel).
async function onSubscriptionDeleted(sub) {
  await supabaseRequest(
    'PATCH',
    // status=neq.refunded → a refunded membership stays refunded (terminal).
    `purchases?stripe_subscription_id=eq.${encodeURIComponent(sub.id)}&status=neq.refunded`,
    { status: 'canceled' }
  );
}

// Subscription created/updated — sync status + renewal date.
// Maps Stripe's lifecycle statuses onto our four allowed values.
async function onSubscriptionUpdated(sub) {
  const statusMap = {
    active:   'active',
    trialing: 'active',
    past_due: 'past_due',
    unpaid:   'past_due',
    canceled: 'canceled',
  };
  const newStatus = statusMap[sub.status];
  if (!newStatus) return; // incomplete / incomplete_expired / paused → ignore

  const patch = { status: newStatus };
  if (sub.current_period_end) {
    patch.current_period_end = new Date(sub.current_period_end * 1000).toISOString();
  }

  await supabaseRequest(
    'PATCH',
    // status=neq.refunded so a refund is never overwritten back to active.
    `purchases?stripe_subscription_id=eq.${encodeURIComponent(sub.id)}&status=neq.refunded`,
    patch
  );
}

// A recurring charge failed — mark the subscription past_due so the dashboard
// can warn the user. Stripe keeps retrying; a later success fires
// subscription.updated (status active) which restores access above.
async function onInvoicePaymentFailed(invoice) {
  if (!invoice.subscription) return; // one-time invoices have no subscription
  await supabaseRequest(
    'PATCH',
    `purchases?stripe_subscription_id=eq.${encodeURIComponent(invoice.subscription)}&status=neq.refunded`,
    { status: 'past_due' }
  );
}

// Pull the subscription id off an invoice, tolerating both the legacy
// (invoice.subscription) and newer (invoice.parent.subscription_details)
// API shapes. Returns a string id or null.
function subIdFromInvoice(invoice) {
  let s = invoice.subscription
       || (invoice.parent && invoice.parent.subscription_details && invoice.parent.subscription_details.subscription)
       || null;
  if (s && typeof s === 'object') s = s.id;
  return s || null;
}

// A charge was refunded.
//   - One-time program purchase  → revoke ownership (status 'refunded')
//   - Subscription / membership   → deactivate access  (status 'refunded')
// Only FULL refunds act; a partial refund keeps access. Idempotent: re-delivery
// just re-sets 'refunded' (a no-op), and the subscription.* handlers treat
// 'refunded' as terminal so they never flip it back to active.
async function onChargeRefunded(charge) {
  const fullyRefunded = charge.refunded === true || charge.amount_refunded >= charge.amount;
  if (!fullyRefunded) {
    console.log('charge.refunded: partial refund, access left intact', {
      charge: charge.id, amount: charge.amount, amount_refunded: charge.amount_refunded,
    });
    return;
  }

  // 1) One-time program purchase — matched by the stored PaymentIntent and
  //    scoped to one-time rows so a subscription is never caught here.
  const pi = charge.payment_intent;
  if (pi) {
    const updated = await supabaseRequest(
      'PATCH',
      `purchases?stripe_payment_intent_id=eq.${encodeURIComponent(pi)}&stripe_subscription_id=is.null`,
      { status: 'refunded' },
      'return=representation'
    );
    if (Array.isArray(updated) && updated.length > 0) {
      console.log(`charge.refunded: revoked ${updated.length} one-time purchase(s) for payment_intent ${pi}`);
      return;
    }
  }

  // 2) Subscription charge — resolve the subscription via the invoice, then
  //    deactivate that membership. A Stripe refund does NOT cancel the
  //    subscription, so we mark the row 'refunded' (terminal) to cut access.
  let subId = null;
  try {
    if (charge.invoice) {
      const invoice = await stripe.invoices.retrieve(charge.invoice);
      subId = subIdFromInvoice(invoice);
    }
  } catch (err) {
    console.warn('charge.refunded: could not retrieve invoice', { invoice: charge.invoice, error: err.message });
  }

  if (subId) {
    const updated = await supabaseRequest(
      'PATCH',
      `purchases?stripe_subscription_id=eq.${encodeURIComponent(subId)}`,
      { status: 'refunded' },
      'return=representation'
    );
    const count = Array.isArray(updated) ? updated.length : 0;
    if (count > 0) {
      console.log(`charge.refunded: deactivated ${count} subscription purchase(s) for subscription ${subId}`);
    } else {
      console.warn('charge.refunded: no subscription purchase matched', { subId, charge: charge.id });
    }
    return;
  }

  // Neither path matched (e.g. a purchase made before PaymentIntent was stored).
  console.warn('charge.refunded: no matching purchase (one-time or subscription)', {
    pi, invoice: charge.invoice || null, charge: charge.id,
  });
}
