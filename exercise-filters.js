/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Shared Exercise Discovery Filters (Phase 4.2.1I)
 *
 * The pure, DOM-free, fetch-free, DB-free layer that owns exercise DISCOVERY
 * filtering — how a user narrows the picker by training split, movement pattern,
 * and equipment — and how those filters COMPOSE with the shared search/ranking
 * (exercise-core.js index.search). It is the discovery sibling of exercise-core
 * (identity/resolution) and exercise-custom (lifecycle): one shared brain the
 * workout picker UI, the Node tests, and the discovery benchmarks all call, so
 * split/movement/equipment membership is defined in EXACTLY ONE place and can
 * never drift between surfaces or be re-derived with scattered name checks.
 *
 * Design rules (mirror exercise-core.js / exercise-custom.js):
 *   • Pure: deterministic (exercise, filters) → membership/boolean/list. No DOM,
 *     no fetch, no Supabase. The browser calls it from workout.html; Node
 *     tests/benchmarks require() the exact same logic.
 *   • Metadata-injected, never metadata-owning: membership is DERIVED from the
 *     catalog row's structured fields (movement_pattern, primary_muscle,
 *     force_type, equipment) — the SAME fields exercise-core reasons over — via
 *     deterministic maps here. It never invents metadata and never mutates rows.
 *   • Filters CONSTRAIN eligibility; ranking still comes from exercise-core's
 *     search(). Discovery = search THEN eligibility filter (order preserved), so
 *     a highly-ranked non-matching exercise can never bypass an active filter and
 *     the identity/variant intelligence (hard modifiers, unilateral, Smith,
 *     alias) is untouched.
 *   • Customs are classified only by their OWN explicit metadata. A user custom
 *     carries no taxonomy (no movement_pattern/equipment), so it is invisible to
 *     any active metadata filter — but always searchable when no filter is on.
 *     This never weakens the Phase 4.2.1H lifecycle/ownership rules.
 *
 * Two runtimes, one implementation (guarded exports, same as the siblings):
 *   • Browser — <script src="exercise-filters.js"> AFTER exercise-core.js on
 *     workout.html; defines the global `ExerciseFilters`.
 *   • Node    — module.exports, so tests/benchmarks use the exact production code.
 *
 * Filter-state shape (the contract the UI serializes and this module reads):
 *   { splits: string[], movements: string[], equipment: string[] }
 * All three are OR within a category, AND across categories.
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  // Reuse exercise-core's equipment normalizer so the picker filter and the
  // resolver classify equipment identically (Smith ≠ Machine, Band, etc.).
  // Falls back to null only if the module is unavailable, in which case
  // equipmentKeyOf degrades to a small inline normalizer kept in sync with it.
  var EI = null;
  if (typeof root !== 'undefined' && root && root.ExerciseIntelligence) {
    EI = root.ExerciseIntelligence;
  } else if (typeof require === 'function') {
    try { EI = require('./exercise-core.js'); } catch (e) { EI = null; }
  }

  /* ── 1. Filter vocabularies (user-facing) ──────────────────────────────────
   * Each is an ordered list of { key, label }. `key` is the stable internal
   * value used in the filter-state arrays and tests; `label` is what the UI
   * shows. Only categories that are meaningful to ordinary users and actually
   * populated by the catalog are exposed (no empty/confusing chips). */

  var SPLITS = [
    { key: 'push',  label: 'Push' },
    { key: 'pull',  label: 'Pull' },
    { key: 'legs',  label: 'Legs' },
    { key: 'upper', label: 'Upper Body' },
    { key: 'lower', label: 'Lower Body' },
    { key: 'full',  label: 'Full Body' },
    { key: 'core',  label: 'Core' }
  ];

  // Movement filters expose the established exercise-core taxonomy with
  // user-facing labels. `rotation` folds into Core (a user thinks "core", not
  // "rotation"); `gait` (treadmill/cardio) is deliberately NOT a movement chip —
  // it is not a resistance-training movement pattern users filter by.
  var MOVEMENTS = [
    { key: 'squat',           label: 'Squat' },
    { key: 'hinge',           label: 'Hinge' },
    { key: 'horizontal_push', label: 'Horizontal Push' },
    { key: 'vertical_push',   label: 'Vertical Push' },
    { key: 'horizontal_pull', label: 'Horizontal Pull' },
    { key: 'vertical_pull',   label: 'Vertical Pull' },
    { key: 'lunge',           label: 'Lunge' },
    { key: 'carry',           label: 'Carry' },
    { key: 'isolation',       label: 'Isolation' },
    { key: 'core',            label: 'Core' }
  ];

  // Equipment filter keys are exercise-core's normalized equipment vocabulary
  // (so 'smith' is distinct from 'machine', 'band' is Resistance Band). Only
  // types the catalog actually uses are exposed.
  var EQUIPMENT = [
    { key: 'barbell',    label: 'Barbell' },
    { key: 'dumbbell',   label: 'Dumbbell' },
    { key: 'cable',      label: 'Cable' },
    { key: 'machine',    label: 'Machine' },
    { key: 'bodyweight', label: 'Bodyweight' },
    { key: 'smith',      label: 'Smith Machine' },
    { key: 'kettlebell', label: 'Kettlebell' },
    { key: 'band',       label: 'Resistance Band' }
  ];

  // Fast key→label lookups + category order for serialization/rendering.
  var CATEGORIES = ['splits', 'movements', 'equipment'];
  var LABELS = { splits: {}, movements: {}, equipment: {} };
  SPLITS.forEach(function (o) { LABELS.splits[o.key] = o.label; });
  MOVEMENTS.forEach(function (o) { LABELS.movements[o.key] = o.label; });
  EQUIPMENT.forEach(function (o) { LABELS.equipment[o.key] = o.label; });

  /* ── 2. Membership derivation ──────────────────────────────────────────────
   * Deterministic maps from a catalog row's structured fields to filter keys.
   * These are the SINGLE source of truth for split/movement/equipment
   * membership — never re-derived in the UI. */

  // Coarse primary-muscle → body region, used only to split ISOLATION moves
  // (whose movement_pattern alone doesn't say push/pull/legs). Unknown muscles
  // fall through so a future muscle simply yields no split rather than a wrong one.
  function muscleRegion(muscle) {
    var m = String(muscle || '').toLowerCase();
    if (/chest|pec/.test(m)) return 'chest';
    if (/lat|back|trap/.test(m)) return 'back';
    if (/rear delt/.test(m)) return 'rear-delt';
    if (/delt|shoulder/.test(m)) return 'shoulder';
    if (/tricep/.test(m)) return 'triceps';
    if (/bicep|brachialis|forearm/.test(m)) return 'biceps';
    if (/quad|hamstring|glute|calf|calves|abductor|adductor|\bleg/.test(m)) return 'legs';
    if (/\bab|core/.test(m)) return 'core';
    return '';
  }

  // Split membership. Returns an array of split keys (may be 0, 1, or 2).
  // Compound patterns map by pattern; isolation maps by target-muscle region.
  function getExerciseSplits(ex) {
    if (!ex) return [];
    var mp = ex.movement_pattern;
    switch (mp) {
      case 'horizontal_push':
      case 'vertical_push':   return ['push', 'upper'];
      case 'horizontal_pull':
      case 'vertical_pull':   return ['pull', 'upper'];
      case 'squat':
      case 'hinge':
      case 'lunge':           return ['legs', 'lower'];
      case 'core':
      case 'rotation':        return ['core'];
      case 'carry':
      case 'gait':            return ['full'];
      case 'isolation': {
        var r = muscleRegion(ex.primary_muscle);
        if (r === 'chest' || r === 'triceps' || r === 'shoulder') return ['push', 'upper'];
        if (r === 'back' || r === 'biceps' || r === 'rear-delt') return ['pull', 'upper'];
        if (r === 'legs') return ['legs', 'lower'];
        if (r === 'core') return ['core'];
        return [];
      }
      default:                return [];
    }
  }

  // Movement membership → a single user-facing movement key (or null when the
  // pattern isn't an exposed movement chip, e.g. gait). rotation → core.
  var MOVEMENT_OF_PATTERN = {
    squat: 'squat', hinge: 'hinge', lunge: 'lunge',
    horizontal_push: 'horizontal_push', vertical_push: 'vertical_push',
    horizontal_pull: 'horizontal_pull', vertical_pull: 'vertical_pull',
    carry: 'carry', isolation: 'isolation', core: 'core', rotation: 'core'
  };
  function getExerciseMovement(ex) {
    if (!ex || !ex.movement_pattern) return null;
    return MOVEMENT_OF_PATTERN[ex.movement_pattern] || null;
  }

  // Equipment membership → a single normalized equipment key (or null). Reuses
  // exercise-core's normalizeEquipment; is_bodyweight wins so a bodyweight move
  // tagged 'other' still filters under Bodyweight. Returns null for 'other'/
  // unknown so it never matches a specific equipment chip (this is how a custom
  // with no equipment stays out of equipment-filtered results).
  function getExerciseEquipment(ex) {
    if (!ex) return null;
    var key = EI && typeof EI.normalizeEquipment === 'function'
      ? EI.normalizeEquipment(ex.equipment)
      : normalizeEquipmentFallback(ex.equipment);
    if (ex.is_bodyweight && (key === 'other' || !key)) key = 'bodyweight';
    return LABELS.equipment[key] ? key : null;
  }

  // Kept byte-compatible with exercise-core.js §4 normalizeEquipment for the
  // (never-expected) case the module is unavailable in the browser.
  function normalizeEquipmentFallback(raw) {
    var s = String(raw || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!s) return 'other';
    if (/smith/.test(s)) return 'smith';
    if (/barbell|ez bar|trap bar|hex bar/.test(s)) return 'barbell';
    if (/dumbbell/.test(s)) return 'dumbbell';
    if (/kettlebell/.test(s)) return 'kettlebell';
    if (/cable|pulley/.test(s)) return 'cable';
    if (/machine|leverage|hammer strength/.test(s)) return 'machine';
    if (/bodyweight|body weight|calisthenic/.test(s)) return 'bodyweight';
    if (/resistance band|\bband\b/.test(s)) return 'band';
    var known = { barbell: 1, dumbbell: 1, cable: 1, machine: 1, bodyweight: 1, kettlebell: 1, band: 1, smith: 1, other: 1 };
    return known[s] ? s : 'other';
  }

  /* ── 3. Filter-state helpers ───────────────────────────────────────────── */

  function emptyFilters() { return { splits: [], movements: [], equipment: [] }; }

  // Normalize any partial/legacy filter object into the full shape (arrays).
  function normalizeFilters(f) {
    f = f || {};
    return {
      splits: Array.isArray(f.splits) ? f.splits.slice() : [],
      movements: Array.isArray(f.movements) ? f.movements.slice() : [],
      equipment: Array.isArray(f.equipment) ? f.equipment.slice() : []
    };
  }

  function countActiveFilters(f) {
    f = normalizeFilters(f);
    return f.splits.length + f.movements.length + f.equipment.length;
  }
  function hasActiveFilters(f) { return countActiveFilters(f) > 0; }

  // Immutably toggle one key in one category, returning a NEW filter object.
  function toggleFilter(f, category, key) {
    var out = normalizeFilters(f);
    if (CATEGORIES.indexOf(category) === -1 || !LABELS[category][key]) return out;
    var arr = out[category];
    var i = arr.indexOf(key);
    if (i === -1) arr.push(key); else arr.splice(i, 1);
    return out;
  }

  // Flat list of active filters as { category, key, label } for chip rendering,
  // in a stable order (splits → movements → equipment, each in vocab order).
  function activeChips(f) {
    f = normalizeFilters(f);
    var chips = [];
    CATEGORIES.forEach(function (cat) {
      var order = cat === 'splits' ? SPLITS : cat === 'movements' ? MOVEMENTS : EQUIPMENT;
      order.forEach(function (o) {
        if (f[cat].indexOf(o.key) !== -1) chips.push({ category: cat, key: o.key, label: o.label });
      });
    });
    return chips;
  }

  /* ── 4. Eligibility ────────────────────────────────────────────────────────
   * exerciseMatchesFilters(ex, filters): OR within a category, AND across.
   * An exercise passes a category only if it HAS a membership intersecting the
   * selected keys — so an exercise (custom or canonical) lacking that metadata
   * is excluded when the category is active, and included when it isn't. */

  function anyIn(memberKeys, selected) {
    for (var i = 0; i < selected.length; i++) if (memberKeys.indexOf(selected[i]) !== -1) return true;
    return false;
  }

  function exerciseMatchesFilters(ex, filters) {
    var f = normalizeFilters(filters);
    if (f.splits.length) {
      if (!anyIn(getExerciseSplits(ex), f.splits)) return false;
    }
    if (f.movements.length) {
      var mv = getExerciseMovement(ex);
      if (!mv || f.movements.indexOf(mv) === -1) return false;
    }
    if (f.equipment.length) {
      var eq = getExerciseEquipment(ex);
      if (!eq || f.equipment.indexOf(eq) === -1) return false;
    }
    return true;
  }

  // Filter a plain catalog list, preserving input order.
  function filterList(list, filters) {
    if (!hasActiveFilters(filters)) return (list || []).slice();
    return (list || []).filter(function (ex) { return exerciseMatchesFilters(ex, filters); });
  }

  /* ── 5. Discovery: search + filter composition ─────────────────────────────
   * runDiscovery is the ONE entry the picker UI, tests, and benchmarks share.
   * It composes exercise-core search/ranking with eligibility filtering and the
   * custom-exercise name pass, returning the final ordered rows plus the raw
   * resolution verdict and counts for empty-state/UX.
   *
   * Inputs (all optional except index):
   *   index    — an ExerciseIntelligence index (createExerciseIndex output);
   *              provides .search(query) ranking and .records (global catalog).
   *   customs  — the user's ACTIVE custom rows [{ id, name, category }] (no
   *              taxonomy metadata). Excluded whenever any metadata filter is on.
   *   query    — search text (may be blank).
   *   filters  — { splits, movements, equipment }.
   *   limit    — max rows (default 40).
   *
   * Row shape: { id, name, exercise, category, equipment, movement, splits,
   *              matchType, matchedAlias, isCustom }.
   *   `id` is a real exercises.id for a canonical hit, '' for a custom (its id
   *   targets user_exercises, never the exercises FK) — identical to the picker's
   *   existing contract, so downstream identity stamping is unchanged.
   *
   * Returns { query, filters, rows, resolution, counts:{ total, shown, filtered },
   *           hasQuery, hasFilters }. */

  function normName(name) {
    if (EI && typeof EI.normalizeExerciseName === 'function') return EI.normalizeExerciseName(name);
    return String(name == null ? '' : name).toLowerCase().replace(/[‘’'`]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function canonicalRow(ex, matchType, matchedAlias) {
    return {
      id: ex.id, name: ex.name, exercise: ex,
      category: ex.category || null,
      equipment: ex.equipment || null,
      movement: getExerciseMovement(ex),
      splits: getExerciseSplits(ex),
      matchType: matchType || null,
      matchedAlias: matchedAlias || null,
      isCustom: false
    };
  }
  function customRow(c) {
    return {
      id: '', name: c.name, exercise: c,
      category: c.category || 'Custom',
      equipment: null, movement: null, splits: [],
      matchType: 'custom', matchedAlias: null, isCustom: true
    };
  }

  function runDiscovery(input) {
    input = input || {};
    var index = input.index || null;
    var customs = Array.isArray(input.customs) ? input.customs : [];
    var query = input.query == null ? '' : String(input.query);
    var filters = normalizeFilters(input.filters);
    var limit = input.limit != null ? input.limit : 40;
    var hasQuery = normName(query).length > 0;
    var hasFilters = hasActiveFilters(filters);
    var filtersOn = hasFilters; // customs are excluded whenever any filter is on

    var records = index && Array.isArray(index.records) ? index.records : [];
    var rows = [];
    var shownNorm = Object.create(null);
    var resolution = null;

    function pushCanonical(ex, matchType, matchedAlias) {
      var n = normName(ex.name);
      if (shownNorm[n]) return;
      if (!exerciseMatchesFilters(ex, filters)) return;
      shownNorm[n] = 1;
      rows.push(canonicalRow(ex, matchType, matchedAlias));
    }

    if (hasQuery && index && typeof index.search === 'function') {
      // Ranked canonical matches from the shared resolver, then eligibility
      // filter (order preserved). Pull a generous slice pre-filter so filtering
      // never starves the list below `limit`.
      var s = index.search(query, { limit: Math.max(limit * 3, 60) });
      resolution = s.resolution || null;
      s.results.forEach(function (r) {
        var ex = r.exercise || null;
        if (!ex) return;
        pushCanonical(ex, r.matchType, r.matchedAlias);
      });
      // Customs: lightweight name/category substring pass (not in the resolver).
      // Excluded entirely when any metadata filter is active (no fabricated
      // taxonomy). Deduped against canonical names already shown.
      if (!filtersOn) {
        var q = normName(query);
        customs.forEach(function (c) {
          if (!c || !c.name) return;
          var n = normName(c.name);
          if (shownNorm[n]) return;
          if (n.indexOf(q) === -1 && normName(c.category).indexOf(q) === -1) return;
          shownNorm[n] = 1;
          rows.push(customRow(c));
        });
      }
    } else {
      // No query — full library (canonical + active customs), eligibility
      // filtered, alphabetical within each group (matches legacy picker order).
      var canon = records.map(function (rec) { return rec.raw || rec; })
        .slice().sort(byName);
      canon.forEach(function (ex) { pushCanonical(ex, null, null); });
      if (!filtersOn) {
        customs.slice().sort(byName).forEach(function (c) {
          if (!c || !c.name) return;
          var n = normName(c.name);
          if (shownNorm[n]) return;
          shownNorm[n] = 1;
          rows.push(customRow(c));
        });
      }
    }

    var total = rows.length;
    var shown = rows.slice(0, limit);
    return {
      query: query, filters: filters,
      rows: shown, resolution: resolution,
      counts: { total: total, shown: shown.length, filtered: Math.max(0, total - shown.length) },
      hasQuery: hasQuery, hasFilters: hasFilters
    };
  }

  function byName(a, b) {
    var an = String((a && a.name) || '').toLowerCase();
    var bn = String((b && b.name) || '').toLowerCase();
    return an < bn ? -1 : (an > bn ? 1 : 0);
  }

  /* ── 6. Picker filter-panel interaction (Phase 4.2.1L) ─────────────────────
   * Pure decisions for the mobile filter-panel UX. Whether the collapsible
   * panel is OPEN or COLLAPSED is UI state, not filtering — so it is defined
   * here (one place, testable, DOM-free), exactly like every other picker
   * decision, and consumed by the thin DOM handlers in workout.html. Nothing in
   * this section touches eligibility, ranking, or membership.
   *
   * Two rules:
   *   • A filter selection immediately collapses the panel, so after a tap the
   *     filtered exercise list — not the menu — is the focus (mobile-first).
   *   • An ambient tap outside the panel collapses it ONLY; it must never close
   *     the picker or select a row. Taps on the panel's own filter controls
   *     (the Filters toggle, the active-filter chips) are NOT outside taps. */

  // After the user toggles a filter chip, the panel always collapses. A named
  // predicate (rather than a bare literal at the call site) so the contract is
  // pinned by a test: flipping this to keep the panel open is a deliberate,
  // test-visible change, never an accident.
  function panelStaysOpenAfterFilterToggle() { return false; }

  // Should an ambient click collapse an OPEN panel? True only when the panel is
  // open AND the click landed outside the panel AND not on one of its filter
  // controls (the Filters toggle button or the active-filter chip bar, which
  // must keep working while the panel is open). When true the consumer collapses
  // the panel and consumes the click so it neither closes the picker nor selects
  // an exercise row.
  function shouldCollapseOnOutsideClick(state) {
    state = state || {};
    if (!state.panelOpen) return false;
    if (state.insidePanel) return false;
    if (state.onFilterControl) return false;
    return true;
  }

  /* ── 7. Public surface ─────────────────────────────────────────────────── */

  var ExerciseFilters = {
    // vocabularies
    SPLITS: SPLITS, MOVEMENTS: MOVEMENTS, EQUIPMENT: EQUIPMENT, CATEGORIES: CATEGORIES,
    // membership
    getExerciseSplits: getExerciseSplits,
    getExerciseMovement: getExerciseMovement,
    getExerciseEquipment: getExerciseEquipment,
    muscleRegion: muscleRegion,
    // filter-state helpers
    emptyFilters: emptyFilters,
    normalizeFilters: normalizeFilters,
    countActiveFilters: countActiveFilters,
    hasActiveFilters: hasActiveFilters,
    toggleFilter: toggleFilter,
    activeChips: activeChips,
    // eligibility + composition
    exerciseMatchesFilters: exerciseMatchesFilters,
    filterList: filterList,
    runDiscovery: runDiscovery,
    // filter-panel interaction (Phase 4.2.1L)
    panelStaysOpenAfterFilterToggle: panelStaysOpenAfterFilterToggle,
    shouldCollapseOnOutsideClick: shouldCollapseOnOutsideClick
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ExerciseFilters;
  root.ExerciseFilters = ExerciseFilters;
})(typeof window !== 'undefined' ? window : this);
