/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Shared Exercise-Detail Presentation Core (Phase 4.3.6H)
 *
 * The read-only display sibling of exercise-core.js (identity/resolution),
 * exercise-custom.js (lifecycle), exercise-filters.js (discovery) and
 * exercise-log.js (logging reliability). It owns ONE question:
 *
 *     "Given a reference to an exercise, what may we honestly SHOW about it?"
 *
 * Every surface that wants to explain an exercise — the active workout card,
 * the picker, the Routine editor, Program sessions, and later the substitution
 * engine (4.3.6I) and Coach (4.4) — shapes its detail view through this one
 * module, so metadata interpretation is never re-derived per view.
 *
 * Pure by contract: DOM-free, fetch-free, DB-free, deterministic. It receives
 * an already-fetched catalog row; it never decides how that row was obtained.
 * The DOM layer (workout.html) does the fetching and the rendering.
 *
 * ── THE BINDING RULE: IDENTITY IS NEVER GUESSED ───────────────────────────
 * Canonical guidance is shown ONLY when the reference carries a canonical
 * `exerciseId` AND the supplied catalog row's `id` EQUALS it. There is no name
 * matching, no normalization fallback, no fuzzy resolution anywhere in this
 * module — a same-named custom or a legacy name-only row can never inherit a
 * canonical exercise's instructions. That is the whole reason this shaping
 * lives in one tested place instead of in three view templates.
 *
 * A user custom carries no taxonomy at all (confirmed in production: 0 of 142
 * custom rows have any metadata beyond a name), and ~36% of logged history is
 * legacy name-only. Degrading gracefully is therefore the COMMON path here, not
 * an edge case — so both get an explicit, honest, non-fabricated result rather
 * than an empty canonical shell.
 *
 * ── NEVER FABRICATE ───────────────────────────────────────────────────────
 * An absent field is OMITTED, not rendered as "N/A" and not replaced with
 * generic fitness advice. Only `instructions` and `tips` carry prose, and both
 * come from the curated catalog. This module writes no coaching copy of its own.
 *
 * Dual runtime, same pattern as its siblings:
 *   • Browser — <script src="exercise-detail.js"> exposes `ExerciseDetail`.
 *   • Node — guarded module.exports for tests.
 *
 * Detail model (the contract consumed by views):
 *   { kind, title, available, classification: [{key,label,value}],
 *     sections: [{key,heading,body}], note, isCanonicalRef }
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  /* ── Shared identity classifier (reuse exercise-log; never fork identity) ──
   * identityType() already encodes the canonical > custom > legacy precedence
   * and the mutually-exclusive-id invariant the DB CHECK backstops. Forking it
   * here would let display identity drift from logged identity. */
  var _EL = (function () {
    if (root && root.ExerciseLog) return root.ExerciseLog;
    if (typeof module !== 'undefined' && module.exports) {
      try { return require('./exercise-log'); } catch (e) { return null; }
    }
    return null;
  })();

  // Mirrors ExerciseLog.identityType EXACTLY. Present only so the module stays
  // usable if the sibling failed to load; behavior is identical either way.
  function fallbackIdentityType(ref) {
    if (!ref) return 'legacy';
    var hasCanon = ref.exerciseId != null;
    var hasCustom = ref.customId != null;
    if (hasCanon && hasCustom) return 'invalid';
    if (hasCanon) return 'canonical';
    if (hasCustom) return 'custom';
    return 'legacy';
  }
  function identityType(ref) {
    if (_EL && typeof _EL.identityType === 'function') return _EL.identityType(ref);
    return fallbackIdentityType(ref);
  }

  /* ── Copy (the module's only strings — status, never coaching) ───────────── */
  var NOTE = {
    custom: 'This is your own exercise, so it has no library guidance. Your logged sets and records for it are kept as normal.',
    legacy: 'Detailed exercise guidance isn’t available for this older entry.',
    unavailable: 'Exercise details couldn’t be loaded right now.'
  };

  var HEADING = {
    instructions: 'How to do it',
    tips: 'Coaching cues'
  };

  /* Movement patterns are stored as controlled snake_case enum values. They are
   * presented in words — the raw enum is internal taxonomy and never shown. */
  var PATTERN_LABEL = {
    squat: 'Squat',
    hinge: 'Hinge',
    lunge: 'Lunge',
    horizontal_push: 'Horizontal push',
    vertical_push: 'Vertical push',
    horizontal_pull: 'Horizontal pull',
    vertical_pull: 'Vertical pull',
    carry: 'Carry',
    rotation: 'Rotation',
    isolation: 'Isolation',
    core: 'Core',
    gait: 'Gait'
  };

  /* ── Value hygiene ────────────────────────────────────────────────────────
   * One place decides what "present" means, so no view invents its own idea of
   * empty. Blank strings, whitespace, null, undefined and empty arrays are all
   * ABSENT and cause their row/section to be omitted entirely. */
  function cleanText(v) {
    if (typeof v !== 'string' && typeof v !== 'number') return '';
    return String(v).trim();
  }

  function cleanList(v) {
    if (!Array.isArray(v)) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < v.length; i++) {
      var s = cleanText(v[i]);
      if (!s) continue;                       // drops null/''/whitespace members
      var k = s.toLowerCase();
      if (seen[k]) continue;                  // a duplicated muscle reads as a data bug
      seen[k] = 1;
      out.push(s);
    }
    return out;
  }

  // Sentence case for a controlled single-word value ("Barbell", "Lats"), used
  // only for values that are already curated display words in the catalog.
  function titleish(s) {
    var t = cleanText(s);
    if (!t) return '';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function patternLabel(v) {
    var t = cleanText(v).toLowerCase();
    if (!t) return '';
    if (PATTERN_LABEL[t]) return PATTERN_LABEL[t];
    // An enum value this module hasn't seen is still shown readably rather than
    // dropped — but never as raw snake_case.
    return titleish(t.replace(/_/g, ' '));
  }

  /* ── Classification rows ──────────────────────────────────────────────────
   * The "what is this movement" block. Deliberately NOT everything the row
   * carries: force_type, tracking_type, default_unit, is_bodyweight and
   * is_unilateral are internal taxonomy that drives progression and filtering,
   * not information a lifter benefits from reading. `category` is omitted too —
   * it largely restates movement_pattern and is already the picker subtitle,
   * so showing both would read as duplicated data. */
  function buildClassification(row) {
    var rows = [];
    function add(key, label, value) {
      var v = cleanText(value);
      if (v) rows.push({ key: key, label: label, value: v });
    }
    add('primary_muscle', 'Primary muscle', titleish(row.primary_muscle));
    var sec = cleanList(row.secondary_muscles).map(titleish);
    if (sec.length) {
      rows.push({ key: 'secondary_muscles', label: 'Also works', value: sec.join(', ') });
    }
    add('equipment', 'Equipment', titleish(row.equipment));
    add('movement_pattern', 'Movement', patternLabel(row.movement_pattern));
    add('difficulty', 'Level', titleish(row.difficulty));
    return rows;
  }

  /* ── Prose sections ───────────────────────────────────────────────────────
   * instructions and tips are DISTINCT fields in the catalog and stay distinct
   * here: one is step-by-step execution, the other is short reminders. Merging
   * them would discard an intentional separation in the data model. A section
   * with no body is never emitted, so a heading can never appear empty. */
  function buildSections(row) {
    var out = [];
    var instructions = cleanText(row.instructions);
    if (instructions) out.push({ key: 'instructions', heading: HEADING.instructions, body: instructions });
    var tips = cleanText(row.tips);
    if (tips) out.push({ key: 'tips', heading: HEADING.tips, body: tips });
    return out;
  }

  /* ── Public: build the detail model ───────────────────────────────────────
   * ref  — { name, exerciseId, customId } (the same reference shape
   *         exercise-log.js reasons over; extra keys are ignored).
   * row  — an already-fetched `exercises` row, or null when it is not loaded
   *        yet / could not be loaded. NEVER a name-matched substitute.
   *
   * `available` answers "is there anything to read here", which is what a view
   * needs to decide between rendering content and rendering the note. */
  function buildExerciseDetail(ref, row) {
    var kind = identityType(ref);
    var title = cleanText(ref && ref.name);

    var base = {
      kind: kind,
      title: title,
      available: false,
      classification: [],
      sections: [],
      note: null,
      isCanonicalRef: kind === 'canonical'
    };

    // An invalid reference (both ids set) is a contract violation, not a data
    // gap. It is never rendered as canonical — it degrades like a legacy row.
    if (kind === 'invalid') {
      base.note = NOTE.legacy;
      return base;
    }

    if (kind === 'custom') { base.note = NOTE.custom; return base; }
    if (kind === 'legacy') { base.note = NOTE.legacy; return base; }

    // ── Canonical from here down. The identity gate: a row is usable ONLY if
    // it IS the referenced exercise. A mismatched or absent row yields the
    // "couldn't load" note — never another exercise's guidance.
    var usable = row && row.id != null && String(row.id) === String(ref.exerciseId);
    if (!usable) { base.note = NOTE.unavailable; return base; }

    // Prefer the catalog's canonical name over the caller's (a logged row keeps
    // a historical name snapshot; the library name is the current truth).
    var canonicalName = cleanText(row.name);
    if (canonicalName) base.title = canonicalName;

    base.classification = buildClassification(row);
    base.sections = buildSections(row);
    base.available = base.classification.length > 0 || base.sections.length > 0;

    // A canonical row stripped of every optional field is possible in principle;
    // say so honestly rather than presenting an empty panel.
    if (!base.available) base.note = NOTE.unavailable;
    return base;
  }

  /* Whether a view should bother lazy-fetching prose for this reference. Only a
   * canonical reference can ever have catalog guidance, so custom/legacy rows
   * never trigger a request. */
  function needsCatalogFetch(ref) { return identityType(ref) === 'canonical'; }

  var ExerciseDetail = {
    NOTE: NOTE,
    HEADING: HEADING,
    PATTERN_LABEL: PATTERN_LABEL,
    identityType: identityType,
    buildExerciseDetail: buildExerciseDetail,
    needsCatalogFetch: needsCatalogFetch
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ExerciseDetail;
  root.ExerciseDetail = ExerciseDetail;
})(typeof window !== 'undefined' ? window : this);
