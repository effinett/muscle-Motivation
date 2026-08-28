/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Anonymous Onboarding Draft  ·  Phase 4.3.7B
 *
 * The rules for onboarding BEFORE an account exists: how a visitor's answers
 * are held while they are still anonymous, and — the part that matters — how
 * those answers are allowed to touch a real `profiles` row once they sign up.
 *
 * ── WHY THIS IS A SEPARATE, PURE MODULE ───────────────────────────────────
 * The claim step writes to the canonical profile of a user who may already
 * exist and may already have a plan. Getting it wrong does not produce a
 * cosmetic bug — it silently destroys a paying customer's data. So the
 * decisions live here, in a layer with no DOM, no network, no storage and no
 * clock, where every rule is a pure function that can be exhaustively tested
 * offline. The page performs I/O; this module decides.
 *
 * ── THE DRAFT IS NOT A SOURCE OF TRUTH ────────────────────────────────────
 * It holds RAW ANSWERS only, never derived values. Targets, macros, splits and
 * the Program recommendation are recomputed from the answers every time they
 * are needed, by the code that already owns that math. A stale derivation
 * therefore cannot exist, and `profiles` remains the single durable store —
 * there is no second one, in storage or in this file.
 *
 * ── THE ONE RULE THAT PROTECTS EXISTING USERS ─────────────────────────────
 * A completed profile is never merged into. `mergeIntoProfile` returns an
 * EMPTY patch when `onboarding_complete === true`, independently of whatever
 * the calling page decided. `resolveOnboardingState` also refuses to route
 * such a user into a claim. Two gates, deliberately redundant, because a
 * single point of failure here is unacceptable.
 *
 * ── NOTHING IS EVER ERASED ────────────────────────────────────────────────
 * The merge is additive by construction: it emits a PATCH of only the fields
 * it is confident about, and an empty draft value can never overwrite a
 * meaningful stored one. `0` and `false` are real answers, not emptiness.
 *
 * Dual runtime, same pattern as every shared core:
 *   • Browser — <script src="onboarding-draft.js"> exposes `OnboardingDraft`.
 *   • Node — guarded module.exports for tests.
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  /* ── envelope ───────────────────────────────────────────────────────────
   * The version lives in the KEY as well as the payload. A future v2 writes a
   * different key, so a v1 draft is orphaned rather than misread — the failure
   * mode is "starts over", never "half-understood". */
  var DRAFT_KEY = 'mm_onboarding_draft_v1';
  var DRAFT_VERSION = 1;

  // Belt-and-braces only: sessionStorage already dies with the tab, so this
  // bounds the pathological case of a tab left open for days.
  var DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

  /* ── emptiness ──────────────────────────────────────────────────────────
   * The single definition the whole module shares, because "is this value
   * actually an answer?" is the question every merge rule turns on.
   *
   * `0` and `false` are ANSWERS. `training_days: 0` means "not training yet",
   * which is a real thing a user selected and must be written. Treating it as
   * absent — the classic falsy-check bug — would silently discard it. */
  function isEmpty(v) {
    if (v === null || v === undefined) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (typeof v === 'number') return !isFinite(v);
    return false;
  }

  function num(v) {
    var n = (v === null || v === undefined || v === '') ? NaN : +v;
    return isFinite(n) ? n : null;
  }

  function inRange(v, lo, hi) {
    var n = num(v);
    return n !== null && n >= lo && n <= hi;
  }

  function isOneOf(v, allowed) {
    return typeof v === 'string' && allowed.indexOf(v) >= 0;
  }

  /* ── the claimable whitelist ────────────────────────────────────────────
   * An explicit allowlist with default deny. A key absent from this table is
   * NEVER forwarded to `profiles`, whatever a draft or a caller contains — so
   * a malformed, tampered or future-shaped draft cannot reach a column it has
   * no business writing.
   *
   * Every validator re-runs at claim time. The wizard already validated on
   * entry; this is the second, independent check at the persistence boundary,
   * on the same principle as exercise-log.js sanitizing set values.
   *
   * Deliberately ABSENT, and therefore unwritable by this path:
   *   id · tier · stripe_customer_id · active_program · created_at
   *   onboarding_complete  (ordered separately by the claim sequence — it is
   *                         never part of a field patch) */
  var GOALS = ['fatloss', 'recomp', 'muscle'];
  var TIMELINES = ['aggressive', 'steady', 'relaxed'];
  var GENDERS = ['male', 'female'];
  var EXPERIENCE = ['beginner', 'intermediate', 'advanced'];
  var GYM_ACCESS = ['full_gym', 'home_basic', 'bodyweight'];

  // Ranges mirror the wizard's own input bounds exactly. Where they differ from
  // the calculator's internal guards (body fat: input accepts 4–60, calcBMR
  // only applies Katch-McArdle within 5–55) the INPUT bound is used, so this
  // layer never rejects a value the wizard accepted — parity, not opinion.
  var CLAIMABLE = {
    full_name:           function (v) { return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 80; },
    gender:              function (v) { return isOneOf(v, GENDERS); },
    age:                 function (v) { return inRange(v, 14, 99); },
    height_cm:           function (v) { return inRange(v, 91, 244); },
    weight_lbs:          function (v) { return inRange(v, 80, 600); },
    body_fat_pct:        function (v) { return inRange(v, 4, 60); },
    goal:                function (v) { return isOneOf(v, GOALS); },
    timeline:            function (v) { return isOneOf(v, TIMELINES); },
    goal_weight_lbs:     function (v) { return inRange(v, 80, 600); },
    activity_level:      function (v) { return inRange(v, 1.2, 1.7); },
    training_days:       function (v) { return inRange(v, 0, 6); },
    training_experience: function (v) { return isOneOf(v, EXPERIENCE); },
    gym_access:          function (v) { return isOneOf(v, GYM_ACCESS); },
    // Derived, but ALREADY canonical `profiles` columns that today's save path
    // writes. They are recomputed by the page's existing calculator and passed
    // in — never stored in the draft, never computed here.
    maintenance_calories: function (v) { return inRange(v, 500, 12000); },
    target_calories:      function (v) { return inRange(v, 500, 12000); },
    protein_target:       function (v) { return inRange(v, 0, 1000); },
    fat_target:           function (v) { return inRange(v, 0, 1000); },
    carb_target:          function (v) { return inRange(v, 0, 2000); },
    training_split:       function (v) { return typeof v === 'string' && v.trim() !== ''; },
    goal_summary:         function (v) { return typeof v === 'string' && v.trim() !== ''; }
  };

  // The subset a draft may carry. The derived columns above are excluded on
  // purpose: storing them would create the stale-derivation problem this
  // module exists to avoid.
  var DRAFT_ANSWERS = [
    'full_name', 'gender', 'age', 'height_cm', 'weight_lbs', 'body_fat_pct',
    'goal', 'timeline', 'goal_weight_lbs', 'activity_level', 'training_days',
    'training_experience', 'gym_access'
  ];

  function isClaimable(key) {
    return Object.prototype.hasOwnProperty.call(CLAIMABLE, key);
  }

  // Is `value` acceptable for `key`? Empty is never "valid" — it is "absent",
  // which the merge treats as "say nothing", not "write nothing-ness".
  function isValidField(key, value) {
    if (!isClaimable(key)) return false;
    if (isEmpty(value)) return false;
    return CLAIMABLE[key](value);
  }

  /* ── answers ────────────────────────────────────────────────────────────
   * Keep only known keys carrying valid values. Unknown keys are dropped
   * rather than preserved, so nothing can ride along in the draft waiting to
   * be forwarded later. */
  function sanitizeAnswers(answers) {
    var out = {};
    if (!answers || typeof answers !== 'object') return out;
    for (var i = 0; i < DRAFT_ANSWERS.length; i++) {
      var k = DRAFT_ANSWERS[i];
      if (!Object.prototype.hasOwnProperty.call(answers, k)) continue;
      if (isValidField(k, answers[k])) out[k] = answers[k];
    }
    return out;
  }

  /* ── serialize / read ───────────────────────────────────────────────────
   * `now` is injected rather than read from the clock, so TTL behaviour is
   * deterministic and testable — the same discipline dashboard-model.js uses
   * for `hourOfDay`. */
  function serializeDraft(answers, step, now) {
    return JSON.stringify({
      v: DRAFT_VERSION,
      updatedAt: num(now) || 0,
      step: inRange(step, 1, 5) ? Math.round(+step) : 1,
      answers: sanitizeAnswers(answers)
    });
  }

  // Total and defensive. EVERY failure mode — malformed JSON, wrong version,
  // expired, non-object answers, missing envelope — resolves to null, i.e.
  // "no draft". There is deliberately no repair path: a draft we cannot fully
  // trust is not partially trusted, it is discarded.
  function readDraft(raw, now) {
    if (typeof raw !== 'string' || raw === '') return null;
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return null; }
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.v !== DRAFT_VERSION) return null;

    var updatedAt = num(parsed.updatedAt);
    if (updatedAt === null) return null;
    var t = num(now);
    if (t !== null && t - updatedAt > DRAFT_TTL_MS) return null;
    // A draft stamped in the future is a clock anomaly, not evidence.
    if (t !== null && updatedAt - t > DRAFT_TTL_MS) return null;

    if (!parsed.answers || typeof parsed.answers !== 'object' ||
        Array.isArray(parsed.answers)) return null;

    var answers = sanitizeAnswers(parsed.answers);
    return {
      v: DRAFT_VERSION,
      updatedAt: updatedAt,
      step: inRange(parsed.step, 1, 5) ? Math.round(+parsed.step) : 1,
      answers: answers
    };
  }

  // Does the draft carry enough to compute a plan? The wizard's own required
  // set — the optional fields are excluded by design.
  function isComplete(draft) {
    if (!draft || !draft.answers) return false;
    var required = ['gender', 'age', 'height_cm', 'weight_lbs',
      'goal', 'timeline', 'activity_level', 'training_days'];
    for (var i = 0; i < required.length; i++) {
      if (!isValidField(required[i], draft.answers[required[i]])) return false;
    }
    return true;
  }

  /* ── state resolution ───────────────────────────────────────────────────
   * The single decision `onboarding.html` makes on load. Total: every
   * combination of the three inputs maps to exactly one named branch, so no
   * state can fall through undefined.
   *
   * `discard_and_exit` is the rule that protects existing customers — someone
   * who already has a plan, who wandered into the marketing funnel and
   * answered the wizard again. Their draft is thrown away UNMERGED. */
  var STATE = {
    ANON_NEW:      'anonymous_new',        // no session, no draft  → start
    ANON_RESUME:   'anonymous_resume',     // no session, draft     → resume
    CLAIM:         'claim',                // session, incomplete, draft
    AUTH_WIZARD:   'authenticated_wizard', // session, incomplete, no draft
    DISCARD_EXIT:  'discard_and_exit',     // session, COMPLETE, draft
    COMPLETE_EXIT: 'complete_exit'         // session, COMPLETE, no draft
  };

  function resolveOnboardingState(input) {
    var i = input || {};
    var hasSession = i.hasSession === true;
    var complete = i.onboardingComplete === true;
    var hasDraft = i.hasDraft === true;

    if (!hasSession) return hasDraft ? STATE.ANON_RESUME : STATE.ANON_NEW;
    if (complete) return hasDraft ? STATE.DISCARD_EXIT : STATE.COMPLETE_EXIT;
    return hasDraft ? STATE.CLAIM : STATE.AUTH_WIZARD;
  }

  /* ── the merge ──────────────────────────────────────────────────────────
   * Returns a PATCH — only the fields it is confident about. Never a whole
   * row, so a column it does not mention cannot be clobbered by omission.
   *
   * `candidate` is a profile-SHAPED object (real column names), produced by
   * the page's existing calculator from the draft answers. This module never
   * computes a target itself; it decides what may be written.
   *
   * Neither argument is mutated.
   */
  function mergeIntoProfile(existing, candidate) {
    var patch = {};
    var prof = (existing && typeof existing === 'object') ? existing : {};
    var cand = (candidate && typeof candidate === 'object') ? candidate : {};

    // GATE 1 — a completed profile is never merged into, whatever the caller
    // believed. Redundant with resolveOnboardingState by design.
    if (prof.onboarding_complete === true) return patch;

    for (var key in CLAIMABLE) {
      if (!Object.prototype.hasOwnProperty.call(CLAIMABLE, key)) continue;
      if (!Object.prototype.hasOwnProperty.call(cand, key)) continue;

      var value = cand[key];
      if (!isValidField(key, value)) continue;      // absent or invalid → say nothing

      // GATE 2 — never erase. A stored, meaningful value is only replaced by
      // a value that is itself meaningful, which the check above guarantees.
      // (Kept explicit rather than implied: the intent is the point.)
      var stored = prof[key];

      // `full_name` is the one field where the STORED value wins outright.
      // The trigger seeds it from OAuth metadata, so an existing non-empty
      // name is the user's real one; a wizard-typed name is likelier a
      // nickname and must not displace it. Note the trigger writes '' when
      // metadata is absent, which isEmpty correctly treats as no value.
      if (key === 'full_name' && !isEmpty(stored)) continue;

      patch[key] = value;
    }
    return patch;
  }

  /* ── browser storage (thin) ─────────────────────────────────────────────
   * The only impure part, kept deliberately small and separate — the same
   * pure-core / thin-access split program-catalog.js and weight.js use. Every
   * path swallows storage errors: private mode, disabled storage and quota
   * exhaustion must degrade to "no draft", never throw into the wizard. */
  function storage() {
    try {
      if (typeof sessionStorage === 'undefined') return null;
      return sessionStorage;
    } catch (e) { return null; }
  }

  function hasStorage() { return storage() !== null; }

  function loadDraft(now) {
    var s = storage();
    if (!s) return null;
    try {
      return readDraft(s.getItem(DRAFT_KEY), now);
    } catch (e) { return null; }
  }

  function saveDraft(answers, step, now) {
    var s = storage();
    if (!s) return false;
    try {
      s.setItem(DRAFT_KEY, serializeDraft(answers, step, now));
      return true;
    } catch (e) { return false; }
  }

  function clearDraft() {
    var s = storage();
    if (!s) return false;
    try {
      s.removeItem(DRAFT_KEY);
      return true;
    } catch (e) { return false; }
  }

  var OnboardingDraft = {
    DRAFT_KEY: DRAFT_KEY,
    DRAFT_VERSION: DRAFT_VERSION,
    DRAFT_TTL_MS: DRAFT_TTL_MS,
    DRAFT_ANSWERS: DRAFT_ANSWERS,
    CLAIMABLE: CLAIMABLE,
    STATE: STATE,
    isEmpty: isEmpty,
    isClaimable: isClaimable,
    isValidField: isValidField,
    sanitizeAnswers: sanitizeAnswers,
    serializeDraft: serializeDraft,
    readDraft: readDraft,
    isComplete: isComplete,
    resolveOnboardingState: resolveOnboardingState,
    mergeIntoProfile: mergeIntoProfile,
    // storage access (browser only)
    hasStorage: hasStorage,
    loadDraft: loadDraft,
    saveDraft: saveDraft,
    clearDraft: clearDraft
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = OnboardingDraft;
  root.OnboardingDraft = OnboardingDraft;
})(typeof window !== 'undefined' ? window : this);
