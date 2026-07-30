/* exercise-custom.js — Shared Custom-Exercise Lifecycle Core (Phase 4.2.1H)
 * ---------------------------------------------------------------------------
 * Pure, DOM-free, fetch-free, DB-free intelligence that owns the *lifecycle
 * rules* for user-created custom exercises: what happens when a user creates,
 * edits, archives, restores, or removes one. It is the lifecycle sibling of
 * exercise-core.js (which owns canonical *identity/resolution*); customs live
 * OUTSIDE the resolver (no taxonomy metadata), so their rules live here.
 *
 * Two runtimes, one implementation (same guarded-exports pattern as
 * exercise-core.js / progression.js):
 *   • Browser — <script src="exercise-custom.js"> AFTER exercise-core.js on
 *     workout.html; defines the global `ExerciseCustom`.
 *   • Node    — module.exports, so tests use the exact production logic.
 *
 * DESIGN CONTRACTS (do not reshape without approval):
 *   • Normalization is the SAME one exercise-core.js uses
 *     (ExerciseIntelligence.normalizeExerciseName): lowercase → drop
 *     apostrophes → any non-alnum run to a single space → trim. It removes only
 *     SUPERFICIAL variation (case, punctuation, incidental whitespace) and
 *     NEVER biomechanical meaning (incline ≠ flat), so genuinely distinct
 *     customs stay distinct — no aggressive semantic dedup. The DB
 *     `user_exercises.normalized_name` generated column mirrors this exactly,
 *     and the partial unique index (user_id, normalized_name) WHERE
 *     archived_at IS NULL is the authoritative backstop.
 *   • Ownership is enforced at the DB/RLS layer (user_exercises: ALL policy
 *     auth.uid()=user_id). Callers only ever pass in the CURRENT user's own
 *     customs, so another user's private custom is invisible here by
 *     construction — matching a foreign custom therefore has no effect.
 *   • Canonical exercises are read-only system rows. A create/edit whose name
 *     matches a canonical never creates or mutates a custom (and never touches
 *     the canonical); the canonical is simply what gets used.
 *
 * The module decides intent from injected state; the caller (workout.html)
 * performs the actual DB writes and DB-side reference counting.
 */
(function (root) {
  'use strict';

  // Reuse the canonical normalizer so custom identity and catalog identity can
  // never drift. Falls back to an identical inline implementation ONLY if
  // exercise-core is somehow unavailable (kept byte-for-byte in sync with
  // exercise-core.js §2 normalizeExerciseName + the DB generated column).
  var EI = null;
  if (typeof root !== 'undefined' && root && root.ExerciseIntelligence) {
    EI = root.ExerciseIntelligence;
  } else if (typeof require === 'function') {
    try { EI = require('./exercise-core.js'); } catch (e) { EI = null; }
  }
  function normalizeCustomName(name) {
    if (EI && typeof EI.normalizeExerciseName === 'function') {
      return EI.normalizeExerciseName(name);
    }
    if (typeof name !== 'string' && typeof name !== 'number') return '';
    var s = String(name).toLowerCase();
    s = s.replace(/[‘’'`]/g, '');
    s = s.replace(/[^a-z0-9]+/g, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  // Collapse only display whitespace (trim + single-space runs) WITHOUT
  // lowercasing or stripping punctuation — this is the name we persist/show, so
  // "Farmer's  Carry " is stored as "Farmer's Carry" (identity is the separate
  // normalized_name). Never fabricates content.
  function cleanDisplayName(name) {
    if (typeof name !== 'string' && typeof name !== 'number') return '';
    return String(name).replace(/\s+/g, ' ').trim();
  }

  function isArchived(custom) {
    return !!(custom && custom.archived_at != null && custom.archived_at !== '');
  }

  /* Build the immutable lookup context a lifecycle decision reasons over.
   *   canonicalNames — every canonical exercises.name (strings).
   *   customs        — the CURRENT user's own user_exercises rows
   *                    ({ id, name, archived_at }), active AND archived.
   * Returns normalized lookup maps. First writer wins on collisions (the DB
   * unique index guarantees at most one active per normalized name anyway). */
  function buildLifecycleContext(input) {
    input = input || {};
    var canonicalSet = Object.create(null);
    (input.canonicalNames || []).forEach(function (n) {
      var k = normalizeCustomName(n);
      if (k) canonicalSet[k] = true;
    });
    var activeByNorm = Object.create(null);
    var archivedByNorm = Object.create(null);
    (input.customs || []).forEach(function (c) {
      if (!c) return;
      var k = normalizeCustomName(c.name);
      if (!k) return;
      if (isArchived(c)) {
        if (!archivedByNorm[k]) archivedByNorm[k] = c;
      } else {
        if (!activeByNorm[k]) activeByNorm[k] = c;
      }
    });
    return {
      canonicalSet: canonicalSet,
      activeByNorm: activeByNorm,
      archivedByNorm: archivedByNorm
    };
  }

  /* Decide what "create a custom named X" should actually do. Deterministic
   * precedence: invalid → canonical → active own → archived own → create.
   * Returns { action, normalized, display, targetId }.
   *   'invalid'          — blank / whitespace-only; do nothing.
   *   'use-canonical'    — matches a system exercise; use it, create no custom.
   *   'reuse-active'     — user already owns this active custom; reuse targetId.
   *   'restore-archived' — user owns it archived; RESTORE targetId, don't dupe.
   *   'create'           — genuinely new; insert.
   * A foreign user's custom never appears in ctx, so it can only ever fall
   * through to 'create' here — i.e. it has no effect, exactly as required. */
  function classifyCreateIntent(rawName, ctx) {
    var display = cleanDisplayName(rawName);
    var normalized = normalizeCustomName(rawName);
    if (!normalized) return { action: 'invalid', normalized: '', display: display, targetId: null };
    if (ctx.canonicalSet[normalized]) {
      return { action: 'use-canonical', normalized: normalized, display: display, targetId: null };
    }
    var active = ctx.activeByNorm[normalized];
    if (active) return { action: 'reuse-active', normalized: normalized, display: display, targetId: active.id };
    var archived = ctx.archivedByNorm[normalized];
    if (archived) return { action: 'restore-archived', normalized: normalized, display: display, targetId: archived.id };
    return { action: 'create', normalized: normalized, display: display, targetId: null };
  }

  /* Decide whether renaming custom `id` to `rawName` is allowed and what it is.
   * Returns { ok, action, normalized, display, error }.
   *   action 'noop'   — name unchanged (identical display); nothing to write.
   *   action 'rename' — apply (ok:true). Preserves the id (caller updates in
   *                     place); never rewrites historical snapshots.
   * Rejections: blank, exercise-not-owned/not-active, canonical collision,
   * another active custom with that name, or an archived custom with that name
   * (restore that one instead of creating a hidden conflict). */
  function classifyEditIntent(id, rawName, ctx) {
    var display = cleanDisplayName(rawName);
    var normalized = normalizeCustomName(rawName);
    // Find the target among the user's own ACTIVE customs.
    var target = null;
    for (var k in ctx.activeByNorm) {
      if (ctx.activeByNorm[k].id === id) { target = ctx.activeByNorm[k]; break; }
    }
    if (!target) {
      return { ok: false, action: null, normalized: normalized, display: display,
               error: 'That exercise is no longer available.' };
    }
    if (!normalized) {
      return { ok: false, action: null, normalized: '', display: display,
               error: 'Enter an exercise name.' };
    }
    var currentNorm = normalizeCustomName(target.name);
    if (normalized === currentNorm) {
      // Same identity — allow a pure display-case/spacing tidy, else no-op.
      if (display === cleanDisplayName(target.name)) {
        return { ok: true, action: 'noop', normalized: normalized, display: display, error: null };
      }
      return { ok: true, action: 'rename', normalized: normalized, display: display, error: null };
    }
    if (ctx.canonicalSet[normalized]) {
      return { ok: false, action: null, normalized: normalized, display: display,
               error: 'That matches a built-in exercise. Pick a different name.' };
    }
    var otherActive = ctx.activeByNorm[normalized];
    if (otherActive && otherActive.id !== id) {
      return { ok: false, action: null, normalized: normalized, display: display,
               error: 'You already have an exercise called “' + cleanDisplayName(otherActive.name) + '”.' };
    }
    var archived = ctx.archivedByNorm[normalized];
    if (archived) {
      return { ok: false, action: null, normalized: normalized, display: display,
               error: 'You have an archived exercise with that name — restore it instead.' };
    }
    return { ok: true, action: 'rename', normalized: normalized, display: display, error: null };
  }

  /* Permanent deletion is only ever safe when nothing depends on the custom.
   * Because custom exercises are NEVER foreign-keyed (workout_exercises stores a
   * name snapshot with exercise_id=NULL), "referenced" means the caller found
   * at least one workout_exercises row (in the user's workouts) or template
   * entry whose normalized name matches. When referenced, the row must be kept
   * (archived), never hard-deleted. */
  function canPermanentlyDelete(referenceCount) {
    var n = (typeof referenceCount === 'number' && referenceCount > 0) ? referenceCount : 0;
    if (n > 0) {
      return { allowed: false, reason: 'referenced',
               message: 'This exercise is used in ' + n + ' logged ' + (n === 1 ? 'workout' : 'workouts') +
                        '. It can be archived but not permanently deleted.' };
    }
    return { allowed: true, reason: 'unreferenced', message: '' };
  }

  /* Split a user's customs into what the management UI should show vs. inert
   * rows that merely shadow a canonical name (already hidden from the picker's
   * deduped list). `shadowed` customs are never surfaced as manageable customs
   * so the UI matches what the picker actually offers. */
  function partitionCustoms(customs, canonicalSet) {
    var active = [], archived = [], shadowed = [];
    (customs || []).forEach(function (c) {
      if (!c) return;
      var k = normalizeCustomName(c.name);
      if (k && canonicalSet[k]) { shadowed.push(c); return; }
      if (isArchived(c)) archived.push(c); else active.push(c);
    });
    return { active: active, archived: archived, shadowed: shadowed };
  }

  var ExerciseCustom = {
    normalizeCustomName: normalizeCustomName,
    cleanDisplayName: cleanDisplayName,
    isArchived: isArchived,
    buildLifecycleContext: buildLifecycleContext,
    classifyCreateIntent: classifyCreateIntent,
    classifyEditIntent: classifyEditIntent,
    canPermanentlyDelete: canPermanentlyDelete,
    partitionCustoms: partitionCustoms
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ExerciseCustom;
  root.ExerciseCustom = ExerciseCustom;
})(typeof window !== 'undefined' ? window : this);
