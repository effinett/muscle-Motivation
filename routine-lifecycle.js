/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Routine Lifecycle  ·  Phase 4.3.6 (CP6)
 *
 * The deterministic rules for platform Routine authoring: what state a Routine
 * is in, and whether it may be published. Pure, so the server and the tests
 * run the same logic and publish eligibility can never drift into DOM code.
 *
 * NO NEW LIFECYCLE COLUMN. CP4 deliberately declined a `status` column because
 * it would duplicate `visibility='published'` and allow contradictory rows.
 * That holds: `is_platform` + `visibility` express every state CP6 needs.
 *
 *   user_private       is_platform=false  visibility='private'
 *   platform_draft     is_platform=true   visibility='private'
 *   platform_published is_platform=true   visibility='published'
 *   unpublish          published → private   (the row is never deleted)
 *
 * The fourth combination — is_platform=false + visibility='published' — is
 * impossible by database CHECK, which is what makes "a user can never publish
 * their own Routine" structural rather than a policy detail.
 *
 * Pure: no DOM, no fetch, no Supabase. Browser globals + guarded exports.
 * ──────────────────────────────────────────────────────────────────────── */

var _rt = (typeof require === 'function') ? require('./routine-core.js') : null;
function _validate(list) {
  return _rt ? _rt.rtValidateExercises(list) : rtValidateExercises(list);
}
function _rtConst(name) {
  return _rt ? _rt[name] : (typeof window !== 'undefined' ? window[name] : undefined);
}

/* ── states ─────────────────────────────────────────────────────────────── */

var RL_USER_PRIVATE = 'user_private';
var RL_PLATFORM_DRAFT = 'platform_draft';
var RL_PLATFORM_PUBLISHED = 'platform_published';
var RL_UNKNOWN = 'unknown';

// Reuses the live profiles.goal / Programs vocabulary. No new taxonomy.
var RL_GOALS = ['fatloss', 'recomp', 'muscle'];

function rlClassify(row) {
  if (!row || typeof row !== 'object') return RL_UNKNOWN;
  var platform = row.is_platform === true;
  var visibility = row.visibility;
  if (!platform) return visibility === 'private' ? RL_USER_PRIVATE : RL_UNKNOWN;
  if (visibility === 'private') return RL_PLATFORM_DRAFT;
  if (visibility === 'published') return RL_PLATFORM_PUBLISHED;
  return RL_UNKNOWN;
}

function rlIsPlatform(row) {
  var s = rlClassify(row);
  return s === RL_PLATFORM_DRAFT || s === RL_PLATFORM_PUBLISHED;
}

/* ── publish eligibility ────────────────────────────────────────────────────
 * Deterministic and reason-carrying: the author is told exactly what to fix.
 * Every reason is a stable code, never a sentence, so the UI owns the wording.
 *
 * IDENTITY IS THE STRICT PART. A published platform Routine must not depend on
 * a name-only entry or on another user's private custom exercise. The CP3
 * contract carries only `exercise_id`, so a custom-derived entry arrives with
 * exercise_id=null and is rejected as legacy identity — custom leakage is
 * blocked by the shape of the contract, not by a lookup. Nothing is guessed,
 * resolved or backfilled here. */

function rlPublishEligibility(row) {
  var reasons = [];

  if (!row || typeof row !== 'object') {
    return { eligible: false, reasons: ['not_found'] };
  }
  if (!rlIsPlatform(row)) reasons.push('not_platform_routine');
  if (rlClassify(row) === RL_PLATFORM_PUBLISHED) reasons.push('already_published');

  var name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!name) reasons.push('missing_name');

  // DESCRIPTION IS OPTIONAL (owner decision, CP8b). It was briefly required,
  // which would have made the 47 migrated Program sessions unpublishable —
  // their description belongs to the parent Program, not to each session.
  // Routine Studio may still suggest one; it must never block publishing.
  if (!row.goal) reasons.push('missing_goal');
  else if (RL_GOALS.indexOf(row.goal) < 0) reasons.push('invalid_goal');

  var list = Array.isArray(row.exercises) ? row.exercises : [];
  if (!list.length) {
    reasons.push('no_exercises');
  } else {
    var verdict = _validate(list);
    if (verdict.status === _rtConst('RT_INVALID')) reasons.push('invalid_prescription');
    else if (verdict.status === _rtConst('RT_LEGACY_IDENTITY')) reasons.push('legacy_identity');
  }

  return { eligible: reasons.length === 0, reasons: reasons };
}

// Unpublishing is always safe when the Routine is actually published: it only
// returns the row to draft. It never deletes, and never touches metadata.
function rlUnpublishEligibility(row) {
  if (!row || typeof row !== 'object') return { eligible: false, reasons: ['not_found'] };
  if (!rlIsPlatform(row)) return { eligible: false, reasons: ['not_platform_routine'] };
  if (rlClassify(row) !== RL_PLATFORM_PUBLISHED) {
    return { eligible: false, reasons: ['not_published'] };
  }
  return { eligible: true, reasons: [] };
}

/* The exact column writes each privileged action performs. Kept here so the
 * server never invents a state transition of its own. */
function rlPublishPatch() { return { visibility: 'published' }; }
function rlUnpublishPatch() { return { visibility: 'private' }; }
function rlDraftDefaults() { return { is_platform: true, visibility: 'private' }; }

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    RL_USER_PRIVATE: RL_USER_PRIVATE,
    RL_PLATFORM_DRAFT: RL_PLATFORM_DRAFT,
    RL_PLATFORM_PUBLISHED: RL_PLATFORM_PUBLISHED,
    RL_UNKNOWN: RL_UNKNOWN,
    RL_GOALS: RL_GOALS,
    rlClassify: rlClassify,
    rlIsPlatform: rlIsPlatform,
    rlPublishEligibility: rlPublishEligibility,
    rlUnpublishEligibility: rlUnpublishEligibility,
    rlPublishPatch: rlPublishPatch,
    rlUnpublishPatch: rlUnpublishPatch,
    rlDraftDefaults: rlDraftDefaults,
  };
}
