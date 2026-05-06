// ── Muscle Motivation | Supabase Config ──────────────────────────────────────

const SUPABASE_URL  = 'https://igzvphmhyrdjjvzbxnuh.supabase.co';
const SUPABASE_ANON = 'sb_publishable_LzaTBAZzmu1EOO6MsTSiFA_2BdMq9j6';

// The UMD bundle exposes window.supabase = { createClient, ... }
const supabase = (function () {
  try {
    const { createClient } = window.supabase;
    return createClient(SUPABASE_URL, SUPABASE_ANON);
  } catch (e) {
    console.error('Supabase failed to initialise. Is the CDN script loaded above supabase.js?', e);
    return null;
  }
})();

// ── Auth helpers ─────────────────────────────────────────────────────────────

async function getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function getUser() {
  const session = await getSession();
  return session ? session.user : null;
}

async function signOut() {
  if (supabase) await supabase.auth.signOut();
  window.location.href = 'auth.html';
}

async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = 'auth.html';
    throw new Error('Not authenticated');
  }
  return session;
}

async function getProfile(userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) console.error('Profile fetch error:', error);
  return data;
}

async function upsertProfile(userId, updates) {
  if (!supabase) return false;
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...updates, updated_at: new Date().toISOString() });
  if (error) console.error('Profile upsert error:', error);
  return !error;
}
