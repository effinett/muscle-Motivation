// /api/customer-portal.js
// Opens a Stripe Billing Portal session for the logged-in user so they can
// update payment methods, view invoices, and cancel their subscription —
// all self-service, no support ticket required.
//
// Identity is verified server-side from the access token (same as checkout).
// The Stripe customer id is read from profiles using the service role key,
// never trusted from the client.

const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY    = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE_URL             = process.env.SITE_URL || 'https://musclemotivation.fit';

// Verify the access token by asking Supabase Auth who it belongs to.
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

// Read the stored Stripe customer id for a user via the service role (bypasses RLS).
async function getStripeCustomerId(userId) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=stripe_customer_id`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0]?.stripe_customer_id || null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const user = await getUserFromToken(token);
    if (!user || !user.id) return res.status(401).json({ error: 'Not authenticated' });

    const customerId = await getStripeCustomerId(user.id);
    if (!customerId) {
      return res.status(400).json({ error: 'No billing account found for this user' });
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${SITE_URL}/app.html`,
    });

    return res.status(200).json({ url: portal.url });
  } catch (err) {
    console.error('customer-portal error:', err);
    return res.status(500).json({ error: 'Could not open billing portal' });
  }
};
