// /api/create-checkout-session.js
// Creates a Stripe Checkout Session tied to the logged-in Supabase user.
// Identity is verified server-side from the access token — the client never
// asserts who it is, and never picks the price. Both live here, not in the page.
//
// One dependency: the Stripe SDK (also needed for webhook signature checks in
// step 4). The Supabase token check uses native fetch — no extra package.

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL = process.env.SITE_URL || 'https://musclemotivation.fit';

// Slugs MUST match the purchases.product CHECK constraint.
// Price IDs live here (env), so the test -> live swap is one place, not the HTML.
const PRODUCTS = {
  fat_loss_blueprint: { price: process.env.STRIPE_PRICE_FAT_LOSS,    mode: 'payment' },
  muscle_gain:        { price: process.env.STRIPE_PRICE_MUSCLE_GAIN, mode: 'payment' },
  glute_builder:      { price: process.env.STRIPE_PRICE_GLUTE,       mode: 'payment' },
  ai_membership:      { price: process.env.STRIPE_PRICE_MEMBERSHIP,  mode: 'subscription' },
};

// Verify the access token by asking Supabase Auth who it belongs to.
// Returns the user object, or null if the token is missing/invalid.
async function getUserFromToken(token) {
  if (!token) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// Look up a previously-saved Stripe customer id (set by the webhook) so repeat
// checkouts reuse the same customer instead of creating a duplicate. Best-effort:
// returns null on any failure and we fall back to customer_email.
async function getStripeCustomerId(userId) {
  if (!SUPABASE_SERVICE_KEY) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=stripe_customer_id`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return rows?.[0]?.stripe_customer_id || null;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { product } = req.body || {};
    const config = PRODUCTS[product];
    if (!config)        return res.status(400).json({ error: 'Unknown product' });
    if (!config.price)  return res.status(500).json({ error: 'Price not configured' });

    // Verify identity from the bearer token — do NOT trust a client-sent user id.
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const user = await getUserFromToken(token);
    if (!user || !user.id) return res.status(401).json({ error: 'Not authenticated' });

    const params = {
      mode: config.mode,
      line_items: [{ price: config.price, quantity: 1 }],
      client_reference_id: user.id,          // webhook reads this to know who paid
      metadata: { product, user_id: user.id },
      success_url: `${SITE_URL}/app.html?purchase=success`,
      cancel_url:  `${SITE_URL}/store.html?purchase=cancelled`,
    };

    // Reuse the saved customer if we have one; otherwise let Stripe create one
    // from the email. (Stripe rejects passing both customer and customer_email.)
    const existingCustomer = await getStripeCustomerId(user.id);
    if (existingCustomer) {
      params.customer = existingCustomer;
    } else {
      params.customer_email = user.email;
    }

    // Stamp the subscription too, so the cancel webhook (step 6) can find the user
    // from an event that only carries the subscription.
    if (config.mode === 'subscription') {
      params.subscription_data = { metadata: { product, user_id: user.id } };
    }

    const session = await stripe.checkout.sessions.create(params);
    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('create-checkout-session error:', err);
    return res.status(500).json({ error: 'Could not start checkout' });
  }
};
