/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Platform Routine authoring  ·  Phase 4.3.6 (CP6)
 *
 * The ONLY path by which a platform Routine can be created, edited, published
 * or unpublished. Every one of those writes is refused by row-level security
 * for ordinary clients (the CP4 policies require is_platform=false), so this
 * endpoint's service-role access IS the privilege — and it is gated by a
 * server-side allowlist that never reaches the browser.
 *
 * Authorization model (owner decision O3 — narrowest safe mechanism):
 *   1. the caller's Supabase bearer token is verified SERVER-SIDE, exactly as
 *      /api/ai-food-parse does — a client-supplied user id is never trusted;
 *   2. the resulting user id must appear in ROUTINE_ADMIN_USER_IDS, a
 *      server-only environment variable.
 * No roles table, no grants table, no RBAC. Config, not schema.
 *
 * FAILS CLOSED. With ROUTINE_ADMIN_USER_IDS unset every action is refused, so
 * an unconfigured deployment grants nobody anything.
 *
 * Required configuration (set in Vercel, never committed):
 *   ROUTINE_ADMIN_USER_IDS  comma-separated Supabase auth user ids
 *   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY  (already set)
 * ──────────────────────────────────────────────────────────────────────── */

const {
  rtNormalizeExercises,
} = require('../routine-core.js');
const {
  rlClassify, rlIsPlatform, rlPublishEligibility, rlUnpublishEligibility,
  rlPublishPatch, rlUnpublishPatch, rlDraftDefaults, RL_GOALS,
} = require('../routine-lifecycle.js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TABLE = 'workout_templates';
const MAX_NAME = 80;
const MAX_DESCRIPTION = 600;
const MAX_TAGS = 8;
const MAX_TAG_LEN = 24;
const MAX_EXERCISES = 40;

/* Columns the authoring surface may read. Deliberately explicit — no `*`. */
const SELECT_COLS = 'id,user_id,name,description,goal,difficulty,tags,' +
  'exercises,is_platform,visibility,created_at,updated_at';

/* ── identity ───────────────────────────────────────────────────────────── */

// Verify the bearer token against Supabase. Same pattern as the Stripe/USDA/AI
// routes: the caller asserts nothing about who they are.
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

// Server-only allowlist. Unset or empty ⇒ nobody is authorized.
function isPlatformAuthor(userId) {
  const raw = process.env.ROUTINE_ADMIN_USER_IDS;
  if (!raw || !userId) return false;
  return raw.split(',').map((s) => s.trim()).filter(Boolean).includes(userId);
}

/* ── service-role data access (server only) ─────────────────────────────── */

async function svc(path, options = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {}),
    },
  });
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = null; }
  return { ok: r.ok, status: r.status, body };
}

async function loadRoutine(id) {
  const res = await svc(`${TABLE}?id=eq.${encodeURIComponent(id)}&select=${SELECT_COLS}`);
  if (!res.ok || !Array.isArray(res.body) || !res.body.length) return null;
  return res.body[0];
}

/* ── input validation ───────────────────────────────────────────────────── */

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

function cleanTags(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const tag of value) {
    if (typeof tag !== 'string') continue;
    const t = tag.trim().slice(0, MAX_TAG_LEN);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

// Metadata + prescription, normalized through the SHARED contract so the
// authoring path can never store a shape the rest of the app cannot read.
function buildPatch(body) {
  const patch = {};
  if (body.name !== undefined) patch.name = cleanText(body.name, MAX_NAME);
  if (body.description !== undefined) {
    patch.description = cleanText(body.description, MAX_DESCRIPTION) || null;
  }
  if (body.goal !== undefined) {
    const g = cleanText(body.goal, 20);
    patch.goal = RL_GOALS.includes(g) ? g : null;
  }
  if (body.difficulty !== undefined) {
    patch.difficulty = cleanText(body.difficulty, 40) || null;
  }
  if (body.tags !== undefined) patch.tags = cleanTags(body.tags);
  if (body.exercises !== undefined) {
    const list = Array.isArray(body.exercises) ? body.exercises.slice(0, MAX_EXERCISES) : [];
    patch.exercises = rtNormalizeExercises(list);
  }
  return patch;
}

/* ── actions ────────────────────────────────────────────────────────────── */
// Each returns { status, payload }. None trusts the caller for identity, and
// none can touch a row that is not a platform Routine (except create, which
// makes one).

async function actionList(user) {
  const res = await svc(
    `${TABLE}?is_platform=eq.true&select=${SELECT_COLS}&order=updated_at.desc`);
  if (!res.ok) return { status: 502, payload: { error: 'Could not load Routines.' } };
  return {
    status: 200,
    payload: {
      routines: res.body.map((r) => ({
        ...r, state: rlClassify(r), eligibility: rlPublishEligibility(r),
      })),
    },
  };
}

async function actionGet(user, body) {
  const row = await loadRoutine(body.id);
  if (!row || !rlIsPlatform(row)) {
    return { status: 404, payload: { error: 'Platform Routine not found.' } };
  }
  return {
    status: 200,
    payload: { routine: row, state: rlClassify(row), eligibility: rlPublishEligibility(row) },
  };
}

async function actionCreate(user, body) {
  const patch = buildPatch(body);
  if (!patch.name) return { status: 400, payload: { error: 'Give the Routine a name.' } };
  const row = {
    ...patch,
    ...rlDraftDefaults(),          // is_platform: true, visibility: 'private'
    user_id: user.id,              // the verified caller, never a body field
    exercises: patch.exercises || [],
  };
  const res = await svc(TABLE, { method: 'POST', body: JSON.stringify(row) });
  if (!res.ok || !Array.isArray(res.body) || !res.body.length) {
    return { status: 502, payload: { error: 'Could not create draft.' } };
  }
  return { status: 200, payload: { routine: res.body[0], state: rlClassify(res.body[0]) } };
}

async function actionUpdate(user, body) {
  const row = await loadRoutine(body.id);
  if (!row || !rlIsPlatform(row)) {
    return { status: 404, payload: { error: 'Platform Routine not found.' } };
  }
  const patch = buildPatch(body);
  if (!Object.keys(patch).length) {
    return { status: 400, payload: { error: 'Nothing to update.' } };
  }
  // is_platform and visibility are NOT patchable here: publication is its own
  // explicit action, so a save can never publish.
  patch.updated_at = new Date().toISOString();
  const res = await svc(`${TABLE}?id=eq.${encodeURIComponent(body.id)}`,
    { method: 'PATCH', body: JSON.stringify(patch) });
  if (!res.ok) return { status: 502, payload: { error: 'Could not save.' } };
  const updated = await loadRoutine(body.id);
  return {
    status: 200,
    payload: { routine: updated, state: rlClassify(updated),
               eligibility: rlPublishEligibility(updated) },
  };
}

async function actionPublish(user, body) {
  const row = await loadRoutine(body.id);
  if (!row || !rlIsPlatform(row)) {
    return { status: 404, payload: { error: 'Platform Routine not found.' } };
  }
  // Eligibility is re-checked SERVER-SIDE at the moment of publish; the UI's
  // earlier verdict is a convenience, never the authority.
  const eligibility = rlPublishEligibility(row);
  if (!eligibility.eligible) {
    return { status: 422, payload: { error: 'Not eligible to publish.', eligibility } };
  }
  const res = await svc(`${TABLE}?id=eq.${encodeURIComponent(body.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...rlPublishPatch(), updated_at: new Date().toISOString() }),
  });
  if (!res.ok) return { status: 502, payload: { error: 'Could not publish.' } };
  const updated = await loadRoutine(body.id);
  console.log(`routine-admin: publish id=${body.id} by=${user.id}`);
  return { status: 200, payload: { routine: updated, state: rlClassify(updated) } };
}

async function actionUnpublish(user, body) {
  const row = await loadRoutine(body.id);
  if (!row || !rlIsPlatform(row)) {
    return { status: 404, payload: { error: 'Platform Routine not found.' } };
  }
  const eligibility = rlUnpublishEligibility(row);
  if (!eligibility.eligible) {
    return { status: 422, payload: { error: 'Not published.', eligibility } };
  }
  // Returns the row to draft. The record, its metadata and its prescription
  // are preserved — unpublish is never a delete.
  const res = await svc(`${TABLE}?id=eq.${encodeURIComponent(body.id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...rlUnpublishPatch(), updated_at: new Date().toISOString() }),
  });
  if (!res.ok) return { status: 502, payload: { error: 'Could not unpublish.' } };
  const updated = await loadRoutine(body.id);
  console.log(`routine-admin: unpublish id=${body.id} by=${user.id}`);
  return { status: 200, payload: { routine: updated, state: rlClassify(updated) } };
}

const ACTIONS = {
  list: actionList,
  get: actionGet,
  create: actionCreate,
  update: actionUpdate,
  publish: actionPublish,
  unpublish: actionUnpublish,
};

/* ── handler ────────────────────────────────────────────────────────────── */

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_KEY) {
    console.error('routine-admin: missing Supabase configuration');
    return res.status(500).json({ error: 'Server not configured' });
  }

  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const user = await getUserFromToken(token);
    if (!user || !user.id) return res.status(401).json({ error: 'Not authenticated' });

    // The privilege gate. Identical response for "not an author" whether or
    // not the allowlist is configured, so the reply reveals nothing.
    if (!isPlatformAuthor(user.id)) {
      console.warn(`routine-admin: refused non-author user=${user.id}`);
      return res.status(403).json({ error: 'Not authorized' });
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = typeof body.action === 'string' ? body.action : '';
    const run = Object.prototype.hasOwnProperty.call(ACTIONS, action) ? ACTIONS[action] : null;
    if (!run) return res.status(400).json({ error: 'Unknown action' });

    if (action !== 'list' && action !== 'create' && typeof body.id !== 'string') {
      return res.status(400).json({ error: 'Missing Routine id' });
    }

    const result = await run(user, body);
    return res.status(result.status).json(result.payload);
  } catch (e) {
    console.error('routine-admin:', e && e.message);
    return res.status(500).json({ error: 'Server error' });
  }
};

/* Exported for tests — pure helpers only, never the service-role client. */
module.exports.isPlatformAuthor = isPlatformAuthor;
module.exports.buildPatch = buildPatch;
module.exports.cleanTags = cleanTags;
