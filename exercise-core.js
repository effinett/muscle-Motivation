/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Shared Exercise-Intelligence Core (Phase 4.2.1E)
 *
 * The pure, DOM-free, fetch-free, DB-free exercise-intelligence layer shared by
 * every surface that needs to understand *what an exercise is* and *which
 * exercise the user means*: the workout picker/search, workout logging, program
 * rendering, progression, and every future surface (substitutions, equipment-
 * aware programming, voice logging, AI workout generation, AI coach). It is the
 * exercise-domain equivalent of food-core.js (Phase 4.2.1).
 *
 * Design rules (mirrors food-core.js / progression.js):
 *   • Pure: deterministic input → output. No DOM, no fetch, no Supabase.
 *   • Catalog-injected, never catalog-owning: resolution runs over a catalog of
 *     exercise records passed IN (the `public.exercises` row shape). The DB stays
 *     the runtime source of truth; this module keys off the SAME stable
 *     `exercises.id` values, so a canonicalExerciseId here === exercises.id.
 *   • The NEW intelligence not in the DB — the family model, the relationship
 *     graph, name normalization, the controlled-vocabulary taxonomy — lives here
 *     as one shared source of truth so no feature re-derives it.
 *
 * Dual runtime:
 *   • Browser — <script src="exercise-core.js"> exposes `ExerciseIntelligence`
 *     on window (same pattern as `Progression`). Load BEFORE any consumer.
 *   • Node — guarded module.exports at the bottom, so routes/tests/benchmarks
 *     require() the exact production logic.
 *
 * Exercise record shape (the catalog contract — a trimmed `exercises` row):
 *   { id, name, category, equipment, primary_muscle, secondary_muscles[],
 *     aliases[], movement_pattern, force_type, difficulty, is_bodyweight,
 *     is_unilateral, tracking_type, default_unit }
 *   Only `id` + `name` are strictly required; everything else degrades safely.
 *
 * Resolution result shape (ResolutionResult):
 *   { query, normalizedQuery, matchType, confidence, canonicalExerciseId,
 *     canonicalName, matchedAlias, exerciseFamily, movementPattern, mechanics,
 *     equipment, primaryMuscles, secondaryMuscles, variantSignals, cautionTags,
 *     candidates[], provenance }
 * ──────────────────────────────────────────────────────────────────────── */

(function (root) {
  'use strict';

  /* ── 1. Controlled vocabularies (taxonomy — one shared source of truth) ───
   * These freeze the structured fields so no consumer invents a conflicting
   * enum. Values match docs/exercise-intelligence-architecture.md §3 and the
   * live `exercises` rows. Prose fields (instructions/tips) stay free text.  */

  var MOVEMENT_PATTERNS = [
    'squat', 'hinge', 'lunge', 'horizontal_push', 'vertical_push',
    'horizontal_pull', 'vertical_pull', 'carry', 'rotation', 'isolation',
    'core', 'gait'
  ];
  var EQUIPMENT = [
    'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell',
    'band', 'smith', 'other'
  ];
  var FORCE_TYPES = ['push', 'pull', 'static'];
  var DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
  var TRACKING_TYPES = [
    'weight_reps', 'bodyweight_reps', 'weighted_bodyweight', 'time', 'distance',
    'time_distance'
  ];
  var DEFAULT_UNITS = ['lb', 'kg', 'sec', 'm', 'mi'];

  // Which movement patterns are multi-joint (compound) vs single-joint. Drives
  // mechanics classification AND gates the broad "same-pattern alternative"
  // relationship so isolation moves never form muscle-only substitution nets.
  var COMPOUND_PATTERNS = {
    squat: 1, hinge: 1, lunge: 1, horizontal_push: 1, vertical_push: 1,
    horizontal_pull: 1, vertical_pull: 1, carry: 1, gait: 1
  };
  var ISOLATION_PATTERNS = { isolation: 1, core: 1, rotation: 1 };

  var DIFFICULTY_RANK = { beginner: 1, intermediate: 2, advanced: 3 };

  // Coarse muscle → region, used only to gate cross-family same-pattern
  // alternatives (so a relationship needs shared pattern + force + REGION, never
  // shared muscle alone). Unknown muscles fall through to their own lowercased name.
  var MUSCLE_REGION = {
    'chest': 'chest', 'upper chest': 'chest', 'pecs': 'chest',
    'back': 'back', 'lats': 'back', 'upper back': 'back', 'traps': 'back',
    'rear delts': 'shoulders', 'front delts': 'shoulders', 'shoulders': 'shoulders',
    'biceps': 'arms', 'triceps': 'arms', 'brachialis': 'arms', 'forearms': 'arms',
    'quads': 'legs', 'hamstrings': 'legs', 'glutes': 'legs', 'calves': 'legs',
    'abductors': 'legs', 'legs': 'legs',
    'abs': 'core', 'core': 'core',
    'full body': 'full body', 'grip': 'grip'
  };

  /* ── 2. Name normalization ─────────────────────────────────────────────────
   * Remove superficial variation (case, punctuation, hyphens, apostrophes,
   * spacing) WITHOUT touching biomechanical meaning. "Pull-Up", "pull up" and
   * "pullup" collapse; "Incline" vs "Flat" never does. */

  function normalizeExerciseName(name) {
    if (typeof name !== 'string' && typeof name !== 'number') return ''; // null/obj/array → safe empty
    var s = String(name).toLowerCase();
    s = s.replace(/[‘’'`]/g, '');   // drop apostrophes: farmer's -> farmers
    s = s.replace(/[^a-z0-9]+/g, ' ');         // any non-alnum run (- / , ( )) -> space
    return s.replace(/\s+/g, ' ').trim();
  }

  // Naive singularization — enough for exercise nouns (curls, dips, raises,
  // crunches). Never touches "press" (…ss) so bench press stays intact.
  function singularizeToken(t) {
    if (typeof t !== 'string') return t; // fail safe on null/non-string
    if (t.length > 4 && /ies$/.test(t)) return t.slice(0, -3) + 'y';
    if (t.length > 4 && /(ches|shes|sses|xes|zes)$/.test(t)) return t.slice(0, -2);
    if (t.length > 3 && /s$/.test(t) && !/ss$/.test(t)) return t.slice(0, -1);
    return t;
  }

  // Multi-word abbreviation expansions applied to the whole normalized string.
  // Kept deliberately small — exercise-specific abbreviations mostly live in the
  // DB `aliases`, which the resolver indexes directly. These are the common
  // cross-exercise shorthands a query might use that AREN'T a stored alias.
  var PHRASE_ABBR = [
    [/\bohp\b/g, 'overhead press'],
    [/\brdl\b/g, 'romanian deadlift'],
    [/\bbss\b/g, 'bulgarian split squat'],
    [/\brfess\b/g, 'rear foot elevated split squat'],
    [/\bsldl\b/g, 'single leg deadlift'],
    [/\bdl\b/g, 'deadlift']
  ];
  // Single-token equipment/shorthand expansions.
  var TOKEN_ABBR = {
    db: 'dumbbell', bb: 'barbell', kb: 'kettlebell', bw: 'bodyweight'
  };

  // Tokenize for MATCHING: normalize → expand abbreviations → singularize.
  function exTokens(name) {
    var s = normalizeExerciseName(name);
    if (!s) return [];
    for (var i = 0; i < PHRASE_ABBR.length; i++) s = s.replace(PHRASE_ABBR[i][0], PHRASE_ABBR[i][1]);
    var out = [];
    s.split(' ').forEach(function (t) {
      if (!t) return;
      var expanded = TOKEN_ABBR[t] || t;
      expanded.split(' ').forEach(function (x) { if (x) out.push(singularizeToken(x)); });
    });
    return out;
  }

  // Canonical lookup key — the aggressively-normalized string used for exact
  // key matching ("DB Bench Press" and "dumbbell bench press" → same key).
  function buildExerciseLookupKey(name) {
    return exTokens(name).join(' ');
  }

  function uniq(arr) {
    var seen = {}, out = [];
    for (var i = 0; i < arr.length; i++) { if (!seen[arr[i]]) { seen[arr[i]] = 1; out.push(arr[i]); } }
    return out;
  }

  /* ── 3. Variant modifiers ──────────────────────────────────────────────────
   * HARD modifiers change WHICH exercise it is (a variant guard: a query that
   * demands one must not resolve to a candidate that lacks it — "incline bench"
   * must never become flat bench, "front squat" never back squat). SOFT
   * modifiers change loading/assistance but not identity (assisted/weighted) —
   * they only lower confidence, never block. */

  var HARD_MODS = {
    incline: 1, decline: 1, flat: 1, front: 1, back: 1, rear: 1
  };
  var SOFT_MODS = {
    assisted: 1, weighted: 1, banded: 1, deficit: 1, paused: 1, pause: 1,
    tempo: 1, eccentric: 1, slow: 1, explosive: 1
  };
  // Descriptor vocabularies for deriveVariantSignals (superset of the guards).
  var POSITION_WORDS = { incline: 1, decline: 1, flat: 1, seated: 1, standing: 1, lying: 1, kneeling: 1, bent: 1 };
  var GRIP_WORDS = { wide: 1, close: 1, narrow: 1, neutral: 1, underhand: 1, overhand: 1, reverse: 1, pronated: 1, supinated: 1 };

  function classifyMods(toks) {
    var hard = [], soft = [], base = [];
    toks.forEach(function (t) {
      if (HARD_MODS[t]) hard.push(t);
      else if (SOFT_MODS[t]) soft.push(t);
      else base.push(t);
    });
    return { hard: hard, soft: soft, base: base, all: toks };
  }

  /* ── 4. Structured accessors ───────────────────────────────────────────── */

  function normalizeEquipment(raw) {
    var s = normalizeExerciseName(raw);
    if (!s) return 'other';
    if (/smith/.test(s)) return 'smith';
    if (/barbell|ez bar|trap bar|hex bar/.test(s)) return 'barbell';
    if (/dumbbell/.test(s)) return 'dumbbell';
    if (/kettlebell/.test(s)) return 'kettlebell';
    if (/cable|pulley/.test(s)) return 'cable';
    if (/machine|leverage|hammer strength|smith/.test(s)) return 'machine';
    if (/bodyweight|body weight|calisthenic/.test(s)) return 'bodyweight';
    if (/resistance band|\bband\b/.test(s)) return 'band';
    var known = { barbell: 1, dumbbell: 1, cable: 1, machine: 1, bodyweight: 1, kettlebell: 1, band: 1, smith: 1, other: 1 };
    return known[s] ? s : 'other';
  }

  function regionOf(muscle) {
    var m = normalizeExerciseName(muscle);
    return MUSCLE_REGION[m] || (m || 'unknown');
  }

  // Compound vs isolation from the movement pattern (the exercise KNOWS this now
  // — no name regex). Single-joint patterns (isolation/core/rotation) → isolation.
  function getMechanics(ex) {
    var mp = ex && ex.movement_pattern;
    if (mp && ISOLATION_PATTERNS[mp]) return 'isolation';
    if (mp && COMPOUND_PATTERNS[mp]) return 'compound';
    return 'compound'; // safe default; progression treats both the same today
  }

  // Equipment/mechanics packaged for progression.js's optional metadata seam.
  // Maps the catalog equipment vocab onto progression's inference vocabulary
  // ('bodyweight'|'dumbbell'|'cable'|'machine'|'barbell'|'other').
  function getProgressionMeta(ex) {
    if (!ex) return { equipment: 'other', mechanics: 'compound' };
    var eq = normalizeEquipment(ex.equipment);
    if (ex.is_bodyweight) eq = 'bodyweight';
    var progVocab = { barbell: 1, dumbbell: 1, cable: 1, machine: 1, bodyweight: 1 };
    return { equipment: progVocab[eq] ? eq : 'other', mechanics: getMechanics(ex) };
  }

  /* ── 5. Exercise family model ──────────────────────────────────────────────
   * Membership criterion: same BASE MOVEMENT + same biomechanical intent.
   * Equipment, grip, incline/flat, and unilateral are VARIANT modifiers within a
   * family — not family boundaries. A different base movement OR a different
   * movement_pattern is a different family. Shared target muscle alone never
   * makes a family (leg extension is not in the squat family).
   *
   * For the curated 57 the mapping is explicit (authoritative, inspectable);
   * unknown/future exercises fall back to a deterministic pattern+base key so a
   * newly-seeded exercise still gets a family without editing this table. */

  // NOTE: keys are NORMALIZED names (normalizeExerciseName output) — hyphens are
  // spaces, apostrophes dropped — so lookups match. "Push-Up" is keyed "push up".
  var FAMILY_BY_NAME = {
    // Biceps / triceps / shoulders isolation
    'barbell curl': 'biceps-curl', 'bicep curl': 'biceps-curl', 'cable curl': 'biceps-curl', 'hammer curl': 'biceps-curl',
    'overhead tricep extension': 'triceps-extension', 'skull crusher': 'triceps-extension', 'tricep pushdown': 'triceps-extension',
    'front raise': 'front-raise', 'lateral raise': 'lateral-raise',
    // Chest
    'bench press': 'bench-press', 'dumbbell press': 'bench-press', 'incline bench press': 'bench-press', 'incline dumbbell press': 'bench-press',
    'cable fly': 'cable-fly', 'push up': 'push-up',
    // Shoulders press / dips
    'overhead press': 'overhead-press', 'dumbbell shoulder press': 'overhead-press', 'dips': 'dip',
    // Back / pulls
    'barbell row': 'row', 'dumbbell row': 'row', 'machine row': 'row', 'seated cable row': 'row',
    'face pull': 'face-pull', 'lat pulldown': 'pulldown', 'straight arm pulldown': 'straight-arm-pulldown',
    'pull up': 'pull-up', 'chin up': 'pull-up',
    // Legs — squat / lunge / press / hinge
    'barbell back squat': 'squat', 'goblet squat': 'squat', 'leg press': 'leg-press', 'leg extension': 'leg-extension',
    'bulgarian split squat': 'lunge', 'dumbbell step up': 'lunge', 'reverse lunge': 'lunge', 'split squat': 'lunge',
    'conventional deadlift': 'deadlift', 'romanian deadlift': 'deadlift', 'trap bar deadlift': 'deadlift',
    'hip thrust': 'hip-thrust', 'single leg hip thrust': 'hip-thrust', 'cable pull through': 'pull-through',
    'leg curl': 'leg-curl', 'seated hip abduction': 'hip-abduction', 'standing hip abduction': 'hip-abduction',
    'cable kickback': 'glute-kickback',
    'seated calf raise': 'calf-raise', 'standing calf raise': 'calf-raise',
    // Core / carry / cardio / plyo
    'crunches': 'crunch', 'dead bug': 'dead-bug', 'plank': 'plank', 'russian twist': 'russian-twist',
    'hanging knee raise': 'leg-raise', 'lying leg raise': 'leg-raise',
    'farmer carry': 'carry', 'incline treadmill walk': 'treadmill', 'treadmill run': 'treadmill', 'box jump': 'jump'
  };

  function getExerciseFamily(ex) {
    if (!ex) return null;
    var explicit = FAMILY_BY_NAME[normalizeExerciseName(ex.name)];
    if (explicit) return explicit;
    // Deterministic fallback for uncurated exercises: pattern + last base token.
    var mods = classifyMods(exTokens(ex.name));
    var base = mods.base.length ? mods.base[mods.base.length - 1] : (mods.all[mods.all.length - 1] || 'unknown');
    var mp = ex.movement_pattern || 'unknown';
    return mp + ':' + base;
  }

  /* ── 6. Descriptive variant + demand tags ──────────────────────────────────
   * variantSignals: how this exercise differs from its family baseline.
   * cautionTags: DESCRIPTIVE joint/ROM demands only (never medical claims —
   * see architecture blueprint §16). Purely additive metadata for future
   * coaching logic; this phase does not prescribe or diagnose on them. */

  function deriveVariantSignals(ex) {
    if (!ex) return {};
    var toks = exTokens(ex.name);
    var pos = null, grip = null;
    toks.forEach(function (t) {
      if (POSITION_WORDS[t] && !pos) pos = t;
      if (GRIP_WORDS[t] && !grip) grip = t;
    });
    return {
      equipment: normalizeEquipment(ex.equipment),
      position: pos,
      grip: grip,
      laterality: ex.is_unilateral ? 'unilateral' : 'bilateral',
      loaded: !(ex.is_bodyweight),
      mechanics: getMechanics(ex)
    };
  }

  function getDemandTags(ex) {
    if (!ex) return [];
    var mp = ex.movement_pattern, tags = {}, name = normalizeExerciseName(ex.name);
    var eq = normalizeEquipment(ex.equipment);
    if (mp === 'vertical_push' || /overhead/.test(name)) tags.overhead_range_of_motion = 1;
    if (mp === 'squat' || mp === 'lunge') tags.deep_knee_flexion = 1;
    if (mp === 'hinge' && (eq === 'barbell')) tags.axial_spinal_loading = 1;
    if (mp === 'squat' && eq === 'barbell') tags.axial_spinal_loading = 1;
    if (ex.is_unilateral) tags.unilateral_balance = 1;
    if (mp === 'carry') tags.grip_endurance = 1;
    if (mp === 'vertical_pull' && ex.is_bodyweight) tags.upper_body_pulling_strength = 1;
    if (/wrist|curl/.test(name) && mp === 'isolation') { /* no wrist tag unless explicit */ }
    return Object.keys(tags);
  }

  /* ── 7. Index + resolution ─────────────────────────────────────────────────
   * createExerciseIndex(catalog) builds the lookup structures once and returns a
   * resolver. resolveExercise(query, catalog) is a one-shot convenience. Every
   * canonicalExerciseId returned is the injected catalog's `id` (== exercises.id). */

  // Build one match-string descriptor (from a name or alias): its token set,
  // token count, and which of its tokens are HARD modifiers. Tier-D matches
  // against these per-string (not a merged token bag) so a query without a
  // modifier prefers the unmodified variant.
  function makeMatchString(raw, via) {
    var toks = exTokens(raw), set = {}, hardMods = [];
    toks.forEach(function (t) { set[t] = 1; if (HARD_MODS[t]) hardMods.push(t); });
    return { raw: raw, via: via, set: set, len: toks.length, hardMods: hardMods };
  }

  function decorate(ex) {
    var aliasKeys = [];
    var strings = [makeMatchString(ex.name, 'name')];
    (ex.aliases || []).forEach(function (a) {
      aliasKeys.push({ raw: a, norm: normalizeExerciseName(a), key: buildExerciseLookupKey(a) });
      strings.push(makeMatchString(a, 'alias'));
    });
    return {
      id: ex.id,
      raw: ex,
      name: ex.name,
      normName: normalizeExerciseName(ex.name),
      lookupKey: buildExerciseLookupKey(ex.name),
      strings: strings,
      aliasKeys: aliasKeys,
      family: getExerciseFamily(ex),
      equipmentNorm: normalizeEquipment(ex.equipment),
      region: regionOf(ex.primary_muscle),
      movement_pattern: ex.movement_pattern || null,
      force_type: ex.force_type || null,
      difficulty: ex.difficulty || null
    };
  }

  var CANDIDATE_CAP = 6;

  function allSameFamily(recs) {
    if (!recs.length) return null;
    var f = recs[0].family;
    if (!f) return null;
    for (var i = 1; i < recs.length; i++) if (recs[i].family !== f) return null;
    return f;
  }

  function projectResult(query, rec, matchType, confidence, extra) {
    var ex = rec ? rec.raw : null;
    var out = {
      query: query,
      normalizedQuery: normalizeExerciseName(query),
      matchType: matchType,
      confidence: confidence,
      canonicalExerciseId: ex ? ex.id : null,
      canonicalName: ex ? ex.name : null,
      matchedAlias: (extra && extra.matchedAlias) || null,
      exerciseFamily: rec ? rec.family : ((extra && extra.exerciseFamily) || null),
      movementPattern: ex ? (ex.movement_pattern || null) : null,
      mechanics: ex ? getMechanics(ex) : null,
      equipment: ex ? normalizeEquipment(ex.equipment) : null,
      primaryMuscles: ex ? (ex.primary_muscle ? [ex.primary_muscle] : []) : [],
      secondaryMuscles: ex ? (ex.secondary_muscles || []) : [],
      variantSignals: ex ? deriveVariantSignals(ex) : {},
      cautionTags: ex ? getDemandTags(ex) : [],
      candidates: (extra && extra.candidates) || [],
      provenance: ex ? 'curated_catalog' : 'unresolved'
    };
    if (extra && extra.reason) out.reason = extra.reason;
    return out;
  }

  function candidateSummary(rec) {
    return { id: rec.id, name: rec.name, family: rec.family, equipment: rec.equipmentNorm };
  }

  function createExerciseIndex(catalog) {
    var records = [];
    var byId = {};
    var exactByName = {};   // normName -> rec
    var exactByAlias = {};  // normAlias -> [rec]
    var byLookupKey = {};   // key -> [{rec, via:'name'|'alias', alias}]

    (Array.isArray(catalog) ? catalog : []).forEach(function (ex) {
      if (!ex || !ex.id || !ex.name) return;
      var rec = decorate(ex);
      records.push(rec);
      byId[rec.id] = rec;
      if (!exactByName[rec.normName]) exactByName[rec.normName] = rec;
      pushKey(byLookupKey, rec.lookupKey, { rec: rec, via: 'name', alias: null });
      rec.aliasKeys.forEach(function (ak) {
        (exactByAlias[ak.norm] = exactByAlias[ak.norm] || []).push(rec);
        pushKey(byLookupKey, ak.key, { rec: rec, via: 'alias', alias: ak.raw });
      });
    });

    function resolve(query, opts) {
      opts = opts || {};
      var normQ = normalizeExerciseName(query);
      if (!normQ) return projectResult(query, null, 'unresolved', 'none', { reason: 'empty_query' });

      // Tier A — exact canonical name.
      if (exactByName[normQ]) return projectResult(query, exactByName[normQ], 'exact_canonical', 'high', {});

      // Tier B — exact alias.
      if (exactByAlias[normQ]) {
        var arr = dedupeRecs(exactByAlias[normQ]);
        if (arr.length === 1) {
          return projectResult(query, arr[0], 'exact_alias', 'high', { matchedAlias: normQ });
        }
        return ambiguousResult(query, arr);
      }

      // Tier C — normalized/expanded key exact (handles "DB bench press", "farmers walk").
      var keyQ = buildExerciseLookupKey(query);
      if (byLookupKey[keyQ]) {
        var hits = dedupeRecs(byLookupKey[keyQ].map(function (h) { return h.rec; }));
        if (hits.length === 1) {
          var via = byLookupKey[keyQ][0].via;
          return projectResult(query, hits[0], via === 'name' ? 'normalized' : 'normalized_alias', 'high',
            { matchedAlias: via === 'alias' ? byLookupKey[keyQ][0].alias : null });
        }
        return ambiguousResult(query, hits);
      }

      // Tier D — per-string token/variant matching with the hard-modifier
      // variant guard. For each record, find its BEST-matching name/alias
      // string; rank records so a query that omits a modifier prefers the
      // unmodified variant, and one that demands a modifier only matches a
      // string that has it.
      var qToks = uniq(exTokens(query));
      var qm = classifyMods(qToks);
      if (qm.base.length || qm.hard.length) {
        var best = {}; // id -> best candidate assessment
        for (var i = 0; i < records.length; i++) {
          var rec = records[i];
          for (var s = 0; s < rec.strings.length; s++) {
            var str = rec.strings[s];
            if (!qm.base.every(function (t) { return str.set[t]; })) continue; // base must be present
            var hardOk = qm.hard.every(function (t) { return str.set[t]; });
            var unreqHard = 0;
            str.hardMods.forEach(function (h) { if (qToks.indexOf(h) === -1) unreqHard++; });
            var softMissing = qm.soft.some(function (t) { return !str.set[t]; });
            var matched = qm.base.length + (hardOk ? qm.hard.length : 0);
            var cand = {
              rec: rec, via: str.via, raw: str.raw, hardOk: hardOk,
              unreqHard: unreqHard, softMissing: softMissing, extra: str.len - matched
            };
            if (!best[rec.id] || betterCand(cand, best[rec.id])) best[rec.id] = cand;
          }
        }
        var cands = Object.keys(best).map(function (k) { return best[k]; });
        if (cands.length) {
          if (qm.hard.length) {
            var hardCands = cands.filter(function (c) { return c.hardOk; });
            if (!hardCands.length) {
              // The base movement exists but the DEMANDED hard variant does not
              // (e.g. "front squat" over a catalog with only back/goblet squat).
              // Never silently collapse onto a different variant.
              var baseRecs = dedupeRecs(cands.map(function (c) { return c.rec; }));
              return projectResult(query, null, 'unresolved', 'none', {
                reason: 'variant_not_in_catalog',
                exerciseFamily: allSameFamily(baseRecs),
                candidates: baseRecs.slice(0, CANDIDATE_CAP).map(candidateSummary)
              });
            }
            cands = hardCands;
          }
          cands.sort(function (a, b) { return betterCand(a, b) ? -1 : (betterCand(b, a) ? 1 : 0); });
          var topKey = rankKey(cands[0]);
          var tied = cands.filter(function (c) { return rankKey(c) === topKey; });
          if (tied.length === 1) {
            var top = tied[0];
            var approx = top.softMissing;
            return projectResult(query, top.rec, 'variant', approx ? 'low' : 'medium',
              approx
                ? { reason: 'soft_modifier_approximate', matchedAlias: top.via === 'alias' ? top.raw : null }
                : { matchedAlias: top.via === 'alias' ? top.raw : null });
          }
          return ambiguousResult(query, tied.map(function (c) { return c.rec; }));
        }
      }

      // Tier E — prefix fallback (partial word, e.g. "ben" → bench-press family).
      if (normQ.length >= 3) {
        var pref = [];
        for (var j = 0; j < records.length; j++) {
          var r = records[j];
          if (r.lookupKey.indexOf(keyQ) === 0 || r.normName.indexOf(normQ) === 0) { pref.push(r); continue; }
          for (var k = 0; k < r.aliasKeys.length; k++) {
            if (r.aliasKeys[k].norm.indexOf(normQ) === 0 || r.aliasKeys[k].key.indexOf(keyQ) === 0) { pref.push(r); break; }
          }
        }
        pref = dedupeRecs(pref);
        if (pref.length === 1) return projectResult(query, pref[0], 'prefix', 'medium', {});
        if (pref.length > 1) return ambiguousResult(query, pref);
      }

      return projectResult(query, null, 'unresolved', 'none', { reason: 'no_match' });
    }

    function ambiguousResult(query, recs) {
      var fam = allSameFamily(recs);
      return projectResult(query, null, fam ? 'family' : 'ambiguous', 'low', {
        exerciseFamily: fam,
        candidates: recs.slice(0, CANDIDATE_CAP).map(candidateSummary)
      });
    }

    function getById(id) { return byId[id] ? byId[id].raw : null; }
    function getFamilyMembers(family) {
      return records.filter(function (r) { return r.family === family; }).map(function (r) { return r.raw; });
    }
    function relationshipsFor(idOrEx) {
      var rec = typeof idOrEx === 'string' ? byId[idOrEx] : byId[idOrEx && idOrEx.id];
      if (!rec) return [];
      return computeRelationships(rec, records);
    }

    // search(query) — the LIST-producing sibling of resolve(). resolve() answers
    // "which single exercise does the user mean" (for auto-select/confidence);
    // search() answers "which exercises should the picker SHOW, best first" for a
    // human to choose from. Both share the SAME normalization, alias index, and
    // hard-modifier variant guard — search is not a second resolver, just a
    // ranked projection of the same matching over every record. Returns
    // { query, normalizedQuery, results[], resolution }, where `resolution` is the
    // full resolve() verdict so a consumer can tell a confident single answer from
    // a family/ambiguous/variant_not_in_catalog list without re-deriving it.
    function search(query, opts) {
      opts = opts || {};
      var limit = opts.limit != null ? opts.limit : 25;
      var normQ = normalizeExerciseName(query);
      if (!normQ) return { query: query, normalizedQuery: '', results: [], resolution: null };
      var keyQ = buildExerciseLookupKey(query);
      var qToks = uniq(exTokens(query));
      var qm = classifyMods(qToks);
      var scored = [];
      for (var i = 0; i < records.length; i++) {
        var a = assessSearch(records[i], normQ, keyQ, qToks, qm);
        if (a) scored.push(a);
      }
      scored.sort(function (a, b) {
        var c = cmpSearchTuple(a, b);
        if (c !== 0) return c;
        return a.rec.normName < b.rec.normName ? -1 : (a.rec.normName > b.rec.normName ? 1 : 0);
      });
      var results = scored.slice(0, limit).map(function (a) {
        return {
          id: a.rec.id,
          name: a.rec.name,
          exercise: a.rec.raw,
          family: a.rec.family,
          equipment: a.rec.equipmentNorm,
          matchType: SEARCH_TIER_NAME[a.tier],
          matchedAlias: a.matchedAlias || null,
          unrequestedHardModifier: a.unreqHard > 0,
          missingRequestedModifier: a.missingReqHard > 0
        };
      });
      return { query: query, normalizedQuery: normQ, results: results, resolution: resolve(query) };
    }

    return {
      resolve: resolve,
      search: search,
      getById: getById,
      getFamilyMembers: getFamilyMembers,
      getRelationships: relationshipsFor,
      records: records,
      size: records.length
    };
  }

  function pushKey(map, key, entry) {
    if (!key) return;
    (map[key] = map[key] || []).push(entry);
  }
  function dedupeRecs(recs) {
    var seen = {}, out = [];
    recs.forEach(function (r) { if (r && !seen[r.id]) { seen[r.id] = 1; out.push(r); } });
    return out;
  }
  // Rank a tier-D candidate: prefer no unrequested hard modifier, then a
  // present soft modifier, then the tightest (fewest extra tokens) match.
  function rankTuple(c) { return [c.hardOk ? 0 : 1, c.unreqHard > 0 ? 1 : 0, c.softMissing ? 1 : 0, c.extra]; }
  function rankKey(c) { return rankTuple(c).join('|'); }
  function betterCand(a, b) {
    var ta = rankTuple(a), tb = rankTuple(b);
    for (var i = 0; i < ta.length; i++) { if (ta[i] !== tb[i]) return ta[i] < tb[i]; }
    return false;
  }

  function resolveExercise(query, catalog, opts) {
    return createExerciseIndex(catalog).resolve(query, opts);
  }

  /* ── 7b. Picker search ranking ──────────────────────────────────────────────
   * Deterministic ranking for the LIST view (index.search). Tiers mirror the
   * resolve() priority — exact canonical > exact alias > normalized key >
   * normalized alias key > variant (hard modifiers satisfied) > related (a
   * demanded hard modifier is absent — a nearby option, never the exact result) >
   * prefix > partial — so the picker orders results with the same identity/variant
   * intelligence resolve() uses, never a bare substring sort. All matching reuses
   * the decorated record's precomputed strings/aliasKeys; no second alias map. */
  var SEARCH_TIER_NAME = [
    'exact_canonical', 'exact_alias', 'normalized', 'normalized_alias',
    'variant', 'related', 'prefix', 'partial'
  ];

  // Lower is better, compared field by field: tier, then a missing REQUESTED hard
  // modifier (flat query vs incline candidate — pushed below true variants), then
  // an UNREQUESTED hard modifier the candidate carries (so "DB bench" prefers flat
  // Dumbbell Press over Incline), then a missing soft modifier, then extra
  // (unmatched) candidate tokens, then name over alias.
  function searchTupleOf(a) {
    return [a.tier, a.missingReqHard || 0, a.unreqHard || 0, a.softMissing || 0,
      a.extra || 0, a.via === 'alias' ? 1 : 0];
  }
  function cmpSearchTuple(a, b) {
    var ta = searchTupleOf(a), tb = searchTupleOf(b);
    for (var i = 0; i < ta.length; i++) { if (ta[i] !== tb[i]) return ta[i] - tb[i]; }
    return 0;
  }
  function mkSearch(rec, tier, x) {
    x = x || {};
    return {
      rec: rec, tier: tier,
      missingReqHard: x.missingReqHard || 0, unreqHard: x.unreqHard || 0,
      softMissing: x.softMissing || 0, extra: x.extra || 0,
      via: x.matchedAlias ? 'alias' : 'name', matchedAlias: x.matchedAlias || null
    };
  }

  // Assess one record against a query for the LIST view. Pure over the decorated
  // record — same primitives resolve() uses — returning the best tier/penalty
  // assessment, or null when nothing matches.
  function assessSearch(rec, normQ, keyQ, qToks, qm) {
    var i;
    // Exact tiers (== resolve()'s confident A–C tiers).
    if (rec.normName === normQ) return mkSearch(rec, 0, {});
    for (i = 0; i < rec.aliasKeys.length; i++) if (rec.aliasKeys[i].norm === normQ) return mkSearch(rec, 1, { matchedAlias: rec.aliasKeys[i].raw });
    if (rec.lookupKey === keyQ) return mkSearch(rec, 2, {});
    for (i = 0; i < rec.aliasKeys.length; i++) if (rec.aliasKeys[i].key === keyQ) return mkSearch(rec, 3, { matchedAlias: rec.aliasKeys[i].raw });

    // Variant / related tiers — per name/alias string, with the hard-modifier
    // guard. A string must contain every BASE query token; a demanded hard
    // modifier it lacks drops it to the weaker 'related' tier (never presented as
    // exact) instead of silently collapsing onto it.
    var best = null;
    if (qm.base.length || qm.hard.length) {
      for (var s = 0; s < rec.strings.length; s++) {
        var str = rec.strings[s];
        if (!qm.base.every(function (t) { return str.set[t]; })) continue;
        var missingReqHard = qm.hard.filter(function (t) { return !str.set[t]; }).length;
        var unreqHard = 0;
        str.hardMods.forEach(function (h) { if (qToks.indexOf(h) === -1) unreqHard++; });
        var softMissing = qm.soft.filter(function (t) { return !str.set[t]; }).length;
        var matched = qToks.filter(function (t) { return str.set[t]; }).length;
        var extra = str.len - matched; if (extra < 0) extra = 0;
        var cand = {
          tier: missingReqHard > 0 ? 5 : 4, missingReqHard: missingReqHard,
          unreqHard: unreqHard, softMissing: softMissing, extra: extra,
          via: str.via, raw: str.raw
        };
        if (!best || cmpSearchTuple(cand, best) < 0) best = cand;
      }
    }
    if (best) return mkSearch(rec, best.tier, {
      missingReqHard: best.missingReqHard, unreqHard: best.unreqHard,
      softMissing: best.softMissing, extra: best.extra,
      matchedAlias: best.via === 'alias' ? best.raw : null
    });

    // Prefix — a partial word that begins a name/alias.
    if (normQ.length >= 2) {
      if (rec.normName.indexOf(normQ) === 0 || (keyQ && rec.lookupKey.indexOf(keyQ) === 0)) return mkSearch(rec, 6, {});
      for (i = 0; i < rec.aliasKeys.length; i++) {
        if (rec.aliasKeys[i].norm.indexOf(normQ) === 0 || (keyQ && rec.aliasKeys[i].key.indexOf(keyQ) === 0)) return mkSearch(rec, 6, { matchedAlias: rec.aliasKeys[i].raw });
      }
    }

    // Partial — a loose substring/token overlap, ranked last so nothing relevant
    // is dropped while never outranking a real match.
    var anyTok = qToks.some(function (t) { return t && rec.normName.indexOf(t) !== -1; });
    if (anyTok || (normQ && rec.normName.indexOf(normQ) !== -1)) {
      var m2 = qToks.filter(function (t) { return t && rec.normName.indexOf(t) !== -1; }).length;
      var recTokLen = uniq(exTokens(rec.name)).length;
      return mkSearch(rec, 7, { extra: Math.max(0, recTokLen - m2) });
    }
    return null;
  }

  function searchExercises(query, catalog, opts) {
    return createExerciseIndex(catalog).search(query, opts);
  }

  /* ── 8. Relationship graph ─────────────────────────────────────────────────
   * Describes exercise↔exercise relationships (a future decision engine picks
   * which is right for a given user). Directional where direction matters
   * (progression/regression). Conservative by construction:
   *   • same family, different equipment  → equipment_substitution (near-equiv)
   *   • same family, same equipment        → variant (near-equiv)
   *   • + difficulty delta                 → progression (harder) / regression (easier)
   *   • different family, SAME compound pattern + force + region
   *                                        → same_pattern_alternative (weakest)
   * Never links by shared muscle alone; never self-links; isolation/core/rotation
   * get NO cross-family net (prevents broad muscle-only substitution). */

  function computeRelationships(rec, records) {
    var out = [];
    for (var i = 0; i < records.length; i++) {
      var other = records[i];
      if (other.id === rec.id) continue;
      var target = { id: other.id, name: other.name, family: other.family, equipment: other.equipmentNorm };
      if (rec.family && other.family === rec.family) {
        var lateralType = other.equipmentNorm !== rec.equipmentNorm ? 'equipment_substitution' : 'variant';
        out.push({ type: lateralType, direction: 'lateral', target: target, basis: 'same_family' });
        var d = (DIFFICULTY_RANK[other.difficulty] || 0) - (DIFFICULTY_RANK[rec.difficulty] || 0);
        if (d > 0) out.push({ type: 'progression', direction: 'harder', target: target, basis: 'same_family_difficulty' });
        else if (d < 0) out.push({ type: 'regression', direction: 'easier', target: target, basis: 'same_family_difficulty' });
      } else if (
        rec.movement_pattern &&
        COMPOUND_PATTERNS[rec.movement_pattern] &&
        other.movement_pattern === rec.movement_pattern &&
        other.force_type === rec.force_type &&
        other.region === rec.region
      ) {
        out.push({ type: 'same_pattern_alternative', direction: 'lateral', target: target, basis: 'same_pattern_force_region' });
      }
    }
    return out;
  }

  function getExerciseRelationships(idOrEx, catalog) {
    return createExerciseIndex(catalog).getRelationships(idOrEx);
  }

  /* ── 9. Validation ─────────────────────────────────────────────────────────
   * Deterministic data-quality checks over a catalog (and, optionally, an
   * explicit relationship list). Errors = must-fix identity problems; warnings =
   * vocabulary drift / soft issues. Fails safely on missing metadata. */

  function validateExerciseCatalog(catalog, opts) {
    opts = opts || {};
    var errors = [], warnings = [];
    var seenName = {}, aliasOwner = {}, canonNames = {};
    var list = Array.isArray(catalog) ? catalog : [];

    list.forEach(function (ex) {
      if (!ex || !ex.id) { errors.push({ code: 'missing_id', ex: ex && ex.name }); return; }
      canonNames[normalizeExerciseName(ex.name)] = ex.id;
    });

    list.forEach(function (ex) {
      if (!ex || !ex.id) return;
      var id = ex.id;
      if (!ex.name || !String(ex.name).trim()) { errors.push({ code: 'missing_canonical_name', id: id }); return; }
      var nkey = normalizeExerciseName(ex.name);
      if (seenName[nkey]) errors.push({ code: 'duplicate_name', id: id, other: seenName[nkey], name: ex.name });
      else seenName[nkey] = id;

      if (ex.movement_pattern != null && MOVEMENT_PATTERNS.indexOf(ex.movement_pattern) === -1)
        warnings.push({ code: 'invalid_movement_pattern', id: id, value: ex.movement_pattern });
      if (ex.force_type != null && FORCE_TYPES.indexOf(ex.force_type) === -1)
        warnings.push({ code: 'invalid_force_type', id: id, value: ex.force_type });
      if (ex.difficulty != null && DIFFICULTIES.indexOf(ex.difficulty) === -1)
        warnings.push({ code: 'invalid_difficulty', id: id, value: ex.difficulty });
      if (ex.tracking_type != null && TRACKING_TYPES.indexOf(ex.tracking_type) === -1)
        warnings.push({ code: 'invalid_tracking_type', id: id, value: ex.tracking_type });
      if (ex.default_unit != null && DEFAULT_UNITS.indexOf(ex.default_unit) === -1)
        warnings.push({ code: 'invalid_default_unit', id: id, value: ex.default_unit });
      if (ex.equipment != null && normalizeEquipment(ex.equipment) === 'other' && EQUIPMENT.indexOf(normalizeExerciseName(ex.equipment)) === -1)
        warnings.push({ code: 'unrecognized_equipment', id: id, value: ex.equipment });

      var localAlias = {};
      (ex.aliases || []).forEach(function (a) {
        var an = normalizeExerciseName(a);
        if (!an) return;
        if (localAlias[an]) warnings.push({ code: 'duplicate_alias', id: id, alias: a });
        localAlias[an] = 1;
        if (aliasOwner[an] && aliasOwner[an] !== id) errors.push({ code: 'alias_collision', alias: a, ids: [aliasOwner[an], id] });
        else aliasOwner[an] = id;
        if (canonNames[an] && canonNames[an] !== id) warnings.push({ code: 'alias_shadows_canonical', id: id, alias: a, canonicalId: canonNames[an] });
      });
    });

    // Optional explicit relationship list: broken targets, self-links, cycles.
    if (opts.relationships) {
      var idset = {}; list.forEach(function (ex) { if (ex && ex.id) idset[ex.id] = 1; });
      var progEdges = {};
      opts.relationships.forEach(function (r) {
        var src = r.sourceId || r.source, tgt = r.targetId || (r.target && r.target.id) || r.target;
        if (!idset[src]) errors.push({ code: 'relationship_source_missing', rel: r });
        if (!idset[tgt]) errors.push({ code: 'relationship_target_missing', rel: r });
        if (src && src === tgt) errors.push({ code: 'self_relationship', id: src });
        if (r.type === 'progression') (progEdges[src] = progEdges[src] || []).push(tgt);
      });
      var cyc = findCycle(progEdges);
      if (cyc) errors.push({ code: 'circular_progression', cycle: cyc });
    }

    return {
      ok: errors.length === 0,
      errors: errors,
      warnings: warnings,
      counts: { exercises: list.length, errors: errors.length, warnings: warnings.length }
    };
  }

  // Validate a derived/explicit relationship graph against a catalog.
  function validateRelationships(relationships, catalog) {
    return validateExerciseCatalog(catalog, { relationships: relationships });
  }

  function findCycle(edges) {
    var WHITE = 0, GRAY = 1, BLACK = 2, color = {}, stack = [];
    function dfs(u) {
      color[u] = GRAY; stack.push(u);
      var next = edges[u] || [];
      for (var i = 0; i < next.length; i++) {
        var v = next[i];
        if (color[v] === GRAY) return stack.slice(stack.indexOf(v)).concat(v);
        if (color[v] === undefined || color[v] === WHITE) { var c = dfs(v); if (c) return c; }
      }
      color[u] = BLACK; stack.pop(); return null;
    }
    var keys = Object.keys(edges);
    for (var i = 0; i < keys.length; i++) {
      if (color[keys[i]] === undefined) { var c = dfs(keys[i]); if (c) return c; }
    }
    return null;
  }

  /* ── 10. Public surface ────────────────────────────────────────────────── */

  var ExerciseIntelligence = {
    // taxonomy (controlled vocabularies)
    MOVEMENT_PATTERNS: MOVEMENT_PATTERNS,
    EQUIPMENT: EQUIPMENT,
    FORCE_TYPES: FORCE_TYPES,
    DIFFICULTIES: DIFFICULTIES,
    TRACKING_TYPES: TRACKING_TYPES,
    DEFAULT_UNITS: DEFAULT_UNITS,
    COMPOUND_PATTERNS: COMPOUND_PATTERNS,
    ISOLATION_PATTERNS: ISOLATION_PATTERNS,
    // normalization
    normalizeExerciseName: normalizeExerciseName,
    buildExerciseLookupKey: buildExerciseLookupKey,
    exTokens: exTokens,
    singularizeToken: singularizeToken,
    // structured accessors
    normalizeEquipment: normalizeEquipment,
    getMechanics: getMechanics,
    getProgressionMeta: getProgressionMeta,
    getExerciseFamily: getExerciseFamily,
    deriveVariantSignals: deriveVariantSignals,
    getDemandTags: getDemandTags,
    // resolution
    createExerciseIndex: createExerciseIndex,
    resolveExercise: resolveExercise,
    searchExercises: searchExercises,
    // relationships
    getExerciseRelationships: getExerciseRelationships,
    // validation
    validateExerciseCatalog: validateExerciseCatalog,
    validateRelationships: validateRelationships
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = ExerciseIntelligence;
  root.ExerciseIntelligence = ExerciseIntelligence;
})(typeof window !== 'undefined' ? window : this);
