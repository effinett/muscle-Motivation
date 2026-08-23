/* ──────────────────────────────────────────────────────────────────────────
 * Muscle Motivation — Program Catalog  ·  Phase 4.3.6 (CP1b)
 *
 * The ONE interpretation layer over public.programs. Before this module a
 * Program was a text slug repeated across nine artifacts; three of them held
 * canonical metadata and had already drifted (schedules.js said "90-Day Fat
 * Loss Blueprint", program-state.js said "90 Day Fat Loss Blueprint").
 *
 * This module owns canonical Program IDENTITY and CATALOG metadata only:
 *   slug · name · description · goal · difficulty · duration_weeks ·
 *   recommended_days_per_week · equipment_summary · access flags · status ·
 *   sort_order · page_path
 *
 * It deliberately does NOT own:
 *   - Stripe pricing                 → api/create-checkout-session.js
 *   - long-form marketing copy       → store.html, program-*.html
 *   - execution schedules / sessions → schedules.js (PROGRAM_SCHEDULES)
 *   - workout prescriptions          → program_workouts (entitlement-gated)
 *   - ENTITLEMENT ENFORCEMENT        → CP2 (entitlement-core.js)
 *
 * Access flags are exposed as DATA so surfaces can describe a Program's access
 * model. Nothing here decides whether a user may open one — that stays with
 * the existing per-surface purchase checks until CP2 replaces them.
 *
 * Caching (4.3.5F discipline). The catalog is public, immutable-in-practice
 * product metadata containing NO user data, so it is safe to hold in a
 * session-scoped cache under roadmap §2.5 (which governs authenticated and
 * per-user data). One fetch per browser session, deduped in-flight; every
 * later page load in that session reads it synchronously with no network. The
 * Home ↔ Train ↔ Nutrition ↔ Progress path therefore pays zero additional
 * requests after the first load.
 *
 * Browser: globals below. Node: guarded module.exports of the pure parts.
 * ──────────────────────────────────────────────────────────────────────── */

var PC_CACHE_KEY = 'mm_program_catalog_v1';

/* ── pure ───────────────────────────────────────────────────────────────── */

// Normalize a public.programs row into the shape every surface consumes.
// Unknown/missing columns degrade to null rather than throwing, so a catalog
// row added later cannot break an older page.
function pcNormalizeProgram(row) {
  if (!row || !row.slug) return null;
  return {
    slug: row.slug,
    name: row.name || row.slug,
    description: row.description || '',
    goal: row.goal || null,
    difficulty: row.difficulty || null,
    durationWeeks: row.duration_weeks != null ? row.duration_weeks : null,
    recommendedDaysPerWeek: row.recommended_days_per_week != null
      ? row.recommended_days_per_week : null,
    equipmentSummary: row.equipment_summary || null,
    includedWithMembership: row.included_with_membership === true,
    standalonePurchasable: row.standalone_purchasable === true,
    status: row.status || 'draft',
    sortOrder: row.sort_order != null ? row.sort_order : 0,
    pagePath: row.page_path || null,
  };
}

function pcNormalizeCatalog(rows) {
  var out = [];
  (rows || []).forEach(function (r) {
    var p = pcNormalizeProgram(r);
    if (p) out.push(p);
  });
  return pcSortCatalog(out);
}

// Deterministic catalog order: sort_order, then slug as a stable tie-break.
function pcSortCatalog(list) {
  return (list || []).slice().sort(function (a, b) {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.slug < b.slug ? -1 : (a.slug > b.slug ? 1 : 0);
  });
}

function pcBySlug(list, slug) {
  if (!slug) return null;
  var found = (list || []).filter(function (p) { return p.slug === slug; });
  return found.length ? found[0] : null;
}

// The Program that best represents a goal. Several Programs may share a goal
// (glute_builder and muscle_gain are both `muscle`), so the lowest sort_order
// wins — which reproduces the legacy GOAL_PROGRAM_MAP exactly:
// fatloss → fat_loss_blueprint, muscle → muscle_gain.
function pcByGoal(list, goal) {
  if (!goal) return null;
  var matches = pcSortCatalog((list || []).filter(function (p) {
    return p.goal === goal;
  }));
  return matches.length ? matches[0] : null;
}

// '' for an unknown slug — parity with the retired schedules.js programName().
function pcProgramName(list, slug) {
  var p = pcBySlug(list, slug);
  return p ? p.name : '';
}

function pcPagePath(list, slug) {
  var p = pcBySlug(list, slug);
  return p ? p.pagePath : null;
}

// Is this purchases.product value a Program (rather than a membership)?
// Replaces the legacy `PROGRAM_META[p.product]` membership test.
function pcIsProgramProduct(list, product) {
  return !!pcBySlug(list, product);
}

/* ── data access (browser) ──────────────────────────────────────────────── */

var pcMemory = null;    // normalized catalog for this page
var pcInflight = null;  // single-flight promise, dedupes concurrent callers

// Synchronous read. Returns the catalog if this page or an earlier page in the
// same session already loaded it, else null. Never issues a request — callers
// that need a guaranteed catalog await pcLoadCatalog() instead.
function pcCached() {
  if (pcMemory) return pcMemory;
  try {
    if (typeof sessionStorage === 'undefined') return null;
    var raw = sessionStorage.getItem(PC_CACHE_KEY);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return null;
    pcMemory = parsed;
    return pcMemory;
  } catch (e) {
    return null;
  }
}

function pcStore(catalog) {
  pcMemory = catalog;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(PC_CACHE_KEY, JSON.stringify(catalog));
    }
  } catch (e) { /* private mode / quota — memory cache still works */ }
  return catalog;
}

// Load the published catalog. One network request per browser session.
// Degrades to [] on failure, which makes every consumer behave exactly as it
// did when a legacy constant had no entry for a slug.
async function pcLoadCatalog() {
  var cached = pcCached();
  if (cached) return cached;
  if (pcInflight) return pcInflight;

  pcInflight = (async function () {
    try {
      var res = await supabaseClient
        .from('programs')
        .select('slug, name, description, goal, difficulty, duration_weeks, ' +
                'recommended_days_per_week, equipment_summary, ' +
                'included_with_membership, standalone_purchasable, ' +
                'status, sort_order, page_path')
        .eq('status', 'published')
        .order('sort_order', { ascending: true });
      if (res.error) throw res.error;
      var catalog = pcNormalizeCatalog(res.data);
      if (!catalog.length) return [];
      return pcStore(catalog);
    } catch (e) {
      console.error('pcLoadCatalog:', e);
      return [];
    } finally {
      pcInflight = null;
    }
  })();

  return pcInflight;
}

function pcClearCache() {
  pcMemory = null;
  pcInflight = null;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(PC_CACHE_KEY);
    }
  } catch (e) { /* nothing to clear */ }
}

// Shared display name for a stored program_slug. Moved here from schedules.js
// so the catalog is the single source of Program names. Reads the cache only —
// surfaces that never load the catalog get '' exactly as they did before when
// a slug was missing from the retired PROGRAM_NAMES map, and every call site
// already guards for that.
function programName(slug) {
  return pcProgramName(pcCached() || [], slug);
}

/* Node: export the PURE parts only (no fetchers — they need supabaseClient). */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PC_CACHE_KEY: PC_CACHE_KEY,
    pcNormalizeProgram: pcNormalizeProgram,
    pcNormalizeCatalog: pcNormalizeCatalog,
    pcSortCatalog: pcSortCatalog,
    pcBySlug: pcBySlug,
    pcByGoal: pcByGoal,
    pcProgramName: pcProgramName,
    pcPagePath: pcPagePath,
    pcIsProgramProduct: pcIsProgramProduct,
  };
}
