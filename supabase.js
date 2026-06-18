// Muscle Motivation | Supabase Config

const SUPABASE_URL = 'https://igzvphmhyrdjjvzbxnuh.supabase.co';
const SUPABASE_ANON = 'sb_publishable_LzaTBAZzmu1EOO6MsTSiFA_2BdMq9j6';

let supabaseClient = null;

try {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
} catch (e) {
  console.error('Supabase failed to initialise. Make sure the CDN script loads before supabase.js:', e);
}

async function getSession() {
  try {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    return data.session;
  } catch (e) {
    console.error('getSession error:', e);
    return null;
  }
}

async function getUser() {
  const session = await getSession();
  return session ? session.user : null;
}

async function signOut() {
  try {
    if (supabaseClient) await supabaseClient.auth.signOut();
  } catch (e) {
    console.error('signOut error:', e);
  }
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
  try {
    if (!supabaseClient) return null;

    const { data, error } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  } catch (e) {
    console.error('getProfile error:', e);
    return null;
  }
}

async function upsertProfile(userId, updates) {
  try {
    if (!supabaseClient) return { ok: false, error: new Error('Supabase client not initialised') };

    const { error } = await supabaseClient
      .from('profiles')
      .upsert({ id: userId, ...updates, updated_at: new Date().toISOString() });

    if (error) throw error;
    return { ok: true, error: null };
  } catch (e) {
    // Log the full Supabase error (code + message) so schema/RLS issues are diagnosable.
    console.error('upsertProfile error:', e);
    return { ok: false, error: e };
  }
}
