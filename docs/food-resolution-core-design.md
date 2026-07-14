# Phase 4.2.1 — Shared Food-Resolution Core: Design
**Status: PROPOSAL — awaiting Effi's approval. No code has moved.**
**Companion to:** `ai-master-blueprint.md` (§4.2.1)
**Inspected at:** commit `1e3e485`, 2026-07-13. Suite green (66/66).

---

## 1. Current-state map

### 1.1 The seven consumer paths and what they run today

| Path | Flow (function-level) |
|---|---|
| **Manual search** | `nuUsdaInputChanged` → `nuRunUsdaSearch` → `nuUsdaSearch` (fetch `/api/usda-search`) → `nuNormalizeUsdaFood` → `nuRenderUsdaResults` + `nuPrefetchPortions`/`nuApplyDefaultPortion` → `nuPickUsda` → `nuBuildServingOptions` + `nuDefaultServingKey` → `nuApplyServing` → `nuSave` → `nuSaveLog` |
| **AI logging** | `nuAiParse` (fetch `/api/ai-food-parse`) → `nuAiResolveItem` (search → `nuAiIsConfident` → `nuAiDedupeChoices`/chooser → `nuAiResolveFood` → `nuAiChooseServing` → alike-gated retry → `nuAiCupServing` → unresolved flag) → sheet render (nutrition.html) → `confirmAiAdd` → `nuAiLogItems` → `nuSaveLog` |
| **Barcode** | scanner → `nuBarcodeLookup` (fetch `/api/usda-barcode`) → `nuNormalizeUsdaFood` → `nuPickUsda` (same card as search) |
| **Saved meals** | `nuSnapshotMealItems` (from food_logs) → stored items → `nuLogSavedMeal` rebuilds `src` → `nuSaveLog` |
| **Favorites / Recents** | identity via `nuFoodKey`; stored `raw_food` → `nuNormalizeUsdaFood` → `nuPickUsda`; no payload → prefilled manual form (`nuOpenModalWithFood`, `nu_editSource` keeps USDA identity) |
| **Editing** | `nuOpenModal(prefill)` → snapshot÷servings → `nuSave` (provenance only re-stamped on a fresh USDA pick; name-intact rule) |
| **Ranking (server)** | `/api/usda-search`: `expandQuery` (rewrites/aliases/typeahead/spell) → parallel USDA pools + supplements → recovery ladder → `buildResponse` (`scoreFood`/`rankPool`, dup-collapse by `nText(desc)|nText(brand)`) |

### 1.2 Where each responsibility lives (function inventory)

**`nutrition.js` (2 337 lines; browser globals, no exports; tested by evaluating the whole file in a Node VM with stubbed `document`/`supabaseClient`/`fetch`):**

- *Pure resolution intelligence (extraction candidates):* `nuRound`, `nuRound1`, `nuScaleMacros`, `nuScalePer100`, `nuNormalizeUsdaFood`, `nuBuildServingOptions`, `nuDefaultServingKey`, `nuAiLabelCount`, `nuAiChooseServing`, `NU_APPROX_UNITS`, `NU_VOLUME_ML`, `NU_CUP_GRAMS`, `nuAiCupServing`, `NU_ASK_CATEGORIES`, `nuAiIsConfident`, `nuAiChoicesAlike`, `NU_SIG_FILLER`, `nuAiNameSig`, `nuAiDedupeChoices`, `nuAiTotals`, `nuFoodKey` (identity), friendly names (`NU_NAME_NOISE/DROP/CUTS/KEEP_PLURAL`, `nuNameSingular`, `nuTitleCase`, `nuAiDisplayName`), chip labels (`NU_FILLER`, `nuShortLabel`)
- *Resolution orchestrators (async, currently reach global fetch wrappers):* `nuAiResolveItem`, `nuAiResolveFood`, `nuAiResolveChoice`
- *Source adapters (browser-specific: Supabase token + fetch):* `nuUsdaSearch`, `nuFetchUsdaDetail` (+ `nu_detailCache`), `nuAiParse`, `nuBarcodeLookup`
- *Save boundary (NOT resolution — stays untouched in 4.2.1):* `nuSaveLog`, `nuUpsertFood`, `nuDeleteLog`, `nuFetchLogs`, `nuDayTotals`; replay sites `nuLogSavedMeal`, `nuAiLogItems`; saved-meals/favorites/recents data access (`nuSnapshotMealItems`, `nuUpsertSavedMeal`, `nuFetchSavedMeals`, `nuLoadFavorites`, `nuToggleFavorite`, `nuFavCandidate`, `nuFetchRecentLogged`, `nuFetchRecentFoods`)
- *UI (stays):* the entire modal (`nuOpenModal`…`nuModalMarkup`), search view, scanner/camera, `nuApplyServing` + `nuApplyDefaultPortion` (DOM- and cache-coupled), steppers, previews

**`api/usda-search.js` (1 229 lines):** query understanding (`nText`, `stem`, `stripMeasurements`, `BRAND_ALIASES`, `TERM_REWRITES`, `PHRASE_REWRITES`, `COMMON_FOODS`/`completeEntry`, dictionary + `spellCorrect`/`splitCompound`/`editDistanceLe`, `expandQuery`), ranking (`KNOWN_BRANDS`, `WHOLE_FOOD_CATEGORIES`, term lists, `FOOD_INTENT`, `scoreFood`, `rankPool`, `buildResponse`), pool orchestration + zero-result recovery ladder (`searchFoods`), `trimFood` (the Candidate shape), HTTP/auth. `_internals` already exported for tests.

**`api/usda-food.js`:** portion trimming (`trimPortions`, `naturalScore`) — the Portions contract. **`api/usda-barcode.js`:** GTIN variants + `pickBest`; already reuses `trimFood` from usda-search `_internals` — cross-module contract reuse exists server-side today. **`api/ai-food-parse.js`:** `parseFoods` (model call, §11-safe schema), caps — the ResolveRequest producer.

### 1.3 Key structural facts driving the design

1. **The client resolution intelligence is trapped in a browser-global file.** `nutrition.js` has no exports; Node consumers (the 4.4 coach route, benchmarks) can only reach it by VM-evaluating the whole file with faked browser globals — workable for tests, wrong for production reuse.
2. **The ranking engine is already shared** — every surface reaches it through `/api/usda-search`, and its pure core (`buildResponse`) is already separated from I/O with `_internals` exposed. It does not need to move in 4.2.1; restructuring it is exactly 4.2.2's job (Candidate Reranking, benchmark-driven).
3. **The contracts already exist implicitly and are consistent** — trimmed Candidate (search + barcode return the same shape), parsed item (ai-food-parse schema), `src` provenance object (identical shape built in three places: `nuSave`, `nuLogSavedMeal`, `nuAiLogItems`). 4.2.1's job is to make them explicit and owned by one module, not to invent new ones.
4. **`nuFoodKey` output is persisted data** (`user_food_favorites.food_key`, saved-meal items). Its format (`usda:<fdcId>` / `custom:<lowercased name>`) must be pinned by a regression test before the function moves.

---

## 2. Proposed shared-core module structure

One new file: **`food-core.js`** at repo root (same tier as `nutrition.js`/`snapshot.js`).

- Loaded in the browser via `<script src="food-core.js">` **before** `nutrition.js` (two pages: `nutrition.html`, `app.html`).
- Node-requirable via the proven guarded-exports pattern from `snapshot.js`/`weight.js` (`if (typeof module !== 'undefined') module.exports = {…}`). No secrets, no framework — it's client-served code and server-requirable code at once.
- **Function names do not change.** Blocks move verbatim; the browser sees the identical globals it sees today.

Internal layers (sections within the one file, mirroring nutrition.js's existing comment-banner style):

| Layer | Contents (moved verbatim from nutrition.js) |
|---|---|
| **A. Scaling math** | `nuRound`, `nuRound1`, `nuScaleMacros`, `nuScalePer100` |
| **B. Candidate normalization** | `nuNormalizeUsdaFood` |
| **C. Serving engine** | `nuBuildServingOptions`, `nuDefaultServingKey`, `nuAiLabelCount`, `nuAiChooseServing`, `NU_APPROX_UNITS`, `NU_VOLUME_ML`, `NU_CUP_GRAMS`, `nuAiCupServing` |
| **D. Confidence & chooser** | `NU_ASK_CATEGORIES`, `nuAiIsConfident`, `nuAiChoicesAlike`, `NU_SIG_FILLER`, `nuAiNameSig`, `nuAiDedupeChoices` |
| **E. Resolution orchestrator** | `nuCreateResolver(source)` factory wrapping today's `nuAiResolveFood` / `nuAiResolveItem` / `nuAiResolveChoice` bodies (see §4) |
| **F. Identity** | `nuFoodKey` |
| **G. Display names** | `nuAiDisplayName` + its four tables + `nuNameSingular` + `nuTitleCase`; `nuShortLabel` + `NU_FILLER` |
| **H. Totals** | `nuAiTotals` |

**What deliberately does NOT move in 4.2.1:**
- `api/usda-search.js` ranking/query understanding — already shared server-side; restructure belongs to 4.2.2 with the benchmark suite in hand.
- The save boundary (`nuSaveLog`, `nuUpsertFood`, provenance rules) — §11-critical, battle-tested, out of scope by Effi's instruction.
- `nuApplyServing`/`nuApplyDefaultPortion` — DOM- and session-cache-coupled; they *call into* core math but remain UI.

---

## 3. Public interfaces

**Browser (unchanged):** every global that pages call today keeps its exact name and signature — `nuAiResolveItem(parsed)`, `nuAiResolveChoice(item, ci)`, `nuNormalizeUsdaFood(f)`, `nuBuildServingOptions(f, portions)`, `nuAiDisplayName(name)`, `nuFoodKey(o)`, `nuAiTotals(items)`, etc. `nutrition.html`/`app.html` call sites need zero edits.

**Node (new, guarded `module.exports`):**

```js
module.exports = {
  // pure helpers (all of layers A–D, F–H by name)
  nuScaleMacros, nuScalePer100, nuNormalizeUsdaFood,
  nuBuildServingOptions, nuDefaultServingKey, nuAiChooseServing, /* … */
  nuFoodKey, nuAiDisplayName, nuAiTotals,
  // the orchestrator factory
  nuCreateResolver,   // (source) => { resolveItem, resolveFood, resolveChoice }
};
```

A future server consumer (4.4 coach tools, 4.9 photo route) does:

```js
const { nuCreateResolver } = require('../food-core.js');
const { searchFoods } = require('./usda-search.js')._internals;
const resolver = nuCreateResolver({ search: serverSearch, portions: serverPortions });
```

— the identical resolution semantics the browser runs, no VM tricks, no DOM.

---

## 4. Source-adapter boundaries

The core never fetches, never authenticates, never touches Supabase. Everything enters through one injected adapter:

```js
// SourceAdapter contract
{
  search(query)   → Promise<Candidate[]>   // trimmed shape, ranked
  portions(fdcId) → Promise<Portion[]>     // trimmed portions, [] on any failure
}
```

Producers of core inputs (all outside the core):

| Adapter | Produces | Lives |
|---|---|---|
| `nuUsdaSearch` + `nuFetchUsdaDetail` (browser) | Candidate[] / Portion[] | nutrition.js (unchanged) |
| `searchFoods` + detail fetch (server, future) | same | api/, when 4.4 needs it |
| `nuAiParse` → `/api/ai-food-parse` | ResolveRequest[] | nutrition.js / api (unchanged) |
| Barcode `/api/usda-barcode` | one Candidate | unchanged — already emits the trimmed shape |
| Saved-meal items / favorites `raw_food` | stored Candidate (raw) | unchanged |
| Voice (4.3) | dictation → same `nuAiParse` → ResolveRequest[] | zero new resolution logic |
| Photo (4.9) | vision route → ResolveRequest[] | zero new resolution logic |

`nutrition.js` binds the browser adapter once at load:

```js
var nu_resolver = nuCreateResolver({ search: nuUsdaSearch, portions: nuFetchUsdaDetail });
function nuAiResolveItem(p)      { return nu_resolver.resolveItem(p); }
function nuAiResolveChoice(i, c) { return nu_resolver.resolveChoice(i, c); }
```

Call sites in nutrition.html keep working verbatim.

---

## 5. Shared contracts (request / candidate / result)

Formalized as documented shapes in food-core.js's header (JS objects, no TypeScript — consistent with the codebase):

1. **ResolveRequest** — `{ text, query, brand, quantity, unit, grams }`. Already the ai-food-parse item schema; becomes THE input contract for every interface (manual search is the degenerate `{ query }`).
2. **Candidate** — the trimmed USDA food `/api/usda-search` and `/api/usda-barcode` already return: `{ fdcId, description, dataType, foodCategory, brand, gtinUpc, servingSize, servingSizeUnit, householdServing, nutrients{kcal,protein,carbs,fat,fiber,sugar}, group, score }`. Owner: `trimFood` in usda-search (unchanged); food-core documents and consumes it.
3. **NormalizedFood** — `nuNormalizeUsdaFood` output (per-serving macros + identity + `is_liquid`/`has_serving` flags + `raw`).
4. **Portion** — `{ label, gramWeight, amount }` (usda-food's trimmed shape).
5. **ResolvedItem** — `nuAiResolveItem` output: `{ parsed, food, servings, perUnit, serving_description, serving_amount, serving_unit, grams, matchedUnit, unitUnresolved? }` ∪ `{ parsed, unmatched:true }` ∪ `{ parsed, needsChoice:true, choices[] }`.
6. **SaveSrc** — the provenance object `nuSaveLog` consumes: `{ name, usda_fdc_id, brand, gtin_upc, serving_amount, serving_unit, serving_description, grams, fiber, sugar, calories, protein, carbs, fat, raw }`. Today built by hand in three places (`nuSave`, `nuLogSavedMeal`, `nuAiLogItems`); 4.2.1c introduces one `nuBuildSaveSrc` builder in the core so the shape can never drift again.

---

## 6. Incremental migration order (subphases + checkpoints)

Each subphase is one commit, independently shippable, full suite green + live smoke before the next. **Approval checkpoints marked ✋ wait for Effi.**

**✋ Checkpoint 0 — this document.** Nothing moves until approved.

**4.2.1a — Verbatim extraction + script tags.**
Move layers A–D, F–H (pure functions and tables only — NOT the orchestrators) from nutrition.js into food-core.js, byte-identical bodies. Add `<script src="food-core.js">` before nutrition.js in `nutrition.html` and `app.html`. Add guarded `module.exports`. Update the test harness to VM-load food-core.js before nutrition.js (2-line change). Add the new `nuFoodKey`-format pin test.
*Verify:* 66/66 + new tests; live smoke of all seven paths. **✋ approval to continue.**

**4.2.1b — Orchestrator + adapter injection.**
Move `nuAiResolveFood`/`nuAiResolveItem`/`nuAiResolveChoice` bodies into `nuCreateResolver(source)`; nutrition.js binds the browser adapter and keeps the three global names as one-line delegates. Bodies stay verbatim except `nuUsdaSearch(...)` → `source.search(...)` and `nuFetchUsdaDetail(...)` → `source.portions(...)` (two mechanical substitutions).
*Verify:* the 21 resolution tests pass **unchanged** (they call the same globals); add one new test resolving through a hand-built fake adapter to prove Node-side use works without nutrition.js loaded at all. **✋ approval.**

**4.2.1c — SaveSrc builder.**
`nuBuildSaveSrc(food, resolved)` in the core; `nuAiLogItems` and `nuLogSavedMeal` call it. Existing src-shape test asserts field-for-field equality, so any drift fails loudly. `nuSave`'s inline src handling is left alone (it passes `nu_pendingSource` directly — different input shape; unifying it is optional polish, not required, and touching `nuSave` risks the edit-provenance rules).
*Verify:* suite + a saved-meal replay smoke + an AI-log smoke against live data. **✋ approval.**

**4.2.1d — Benchmark foundation** (see §8). **✋ approval → 4.2.1 exit.**

**Exit criteria for 4.2.1:** (1) no resolution logic remains that only one feature can reach; (2) the resolver runs in plain Node through `require()` with a fake adapter; (3) contracts documented in one place; (4) benchmark runner executes a corpus through the exact production resolver; (5) all seven consumer paths verified live.

If 4.2.1E starts meanwhile, it runs on its own branch touching only exercise files/DB — zero file overlap with this plan.

---

## 7. Move / wrap / stay / delete-later ledger

| Disposition | Items |
|---|---|
| **MOVE verbatim** (4.2.1a) | Layers A–D, F–H listed in §2 — every function and config table by name |
| **WRAP** (4.2.1b) | `nuAiResolveItem`, `nuAiResolveFood`, `nuAiResolveChoice` — bodies move into the factory; globals become delegates |
| **STAY source-specific** | `nuUsdaSearch`, `nuFetchUsdaDetail` + `nu_detailCache`, `nuAiParse`, `nuBarcodeLookup` + scanner, all modal/UI code, `nuApplyServing`, `nuApplyDefaultPortion`, `nuPrefetchPortions`, entire save/favorites/recents/saved-meals persistence, all of api/* |
| **DELETE later** (explicitly NOT in 4.2.1) | (a) duplicated `getUserFromToken` across four api files — server cleanup when 4.2.2 touches that tier; (b) the three overlapping name-simplification systems (`NU_FILLER` chips vs `NU_SIG_FILLER` signatures vs `NU_NAME_NOISE` display) — consolidation candidate once benchmarks can prove equivalence; (c) VM-evaluation of nutrition.js in tests — shrinks naturally as coverage shifts to `require()`d core |

---

## 8. Test & benchmark evolution

**`nutrition-resolve.test.js` keeps its regression role untouched.** Same file, same exact assertions, same canned payloads, still `npm test`. Only its bootstrap changes (VM-load food-core.js first in 4.2.1a; from 4.2.1b it may additionally `require()` the core directly, which is stricter, not weaker).

**New, additive benchmark layer (4.2.1d):**
- `benchmarks/resolve-cases.jsonl` — one case per line: `{ input: ResolveRequest, expect: { fdcId | needsChoice | unmatched, servings?, serving_description?, unitUnresolved? }, tags: [...] }`. Seeded by mechanically exporting the 21 existing regression scenarios, then extended freely.
- `benchmarks/run-resolve.js` — builds the resolver via `nuCreateResolver` with (tier 1) a fixture adapter over canned pools — deterministic, CI-safe — and (tier 2, optional) the live adapter, gated on `USDA_API_KEY` exactly like usda-search.test.js's live tier. Output: per-case pass/fail + aggregate accuracy and chooser/unmatched rates.
- **Division of labor:** regression tests = "must never break" (behavior Effi approved); benchmark corpus = "score to improve" (4.2.2's ranking work optimizes against it; 4.2.7 grows it to thousands of cases). **Promotion rule:** when a benchmark case's behavior is deliberately fixed, it gains an exact regression test. Nothing ever moves the other direction.

---

## 9. Risks, per surface

| Surface | Risk | Mitigation |
|---|---|---|
| **All pages** | Missing/late `food-core.js` script tag → every resolution global undefined → food modal dead | Tags added in the same commit as the extraction; both pages smoke-tested; the harness fails immediately if load order breaks |
| **Browser cache** | Stale cached `nutrition.js` (old, self-contained) + new HTML: both files define the moved names — old nutrition.js loads second and redefines them with identical old code → still consistent. Stale HTML + new files: old HTML doesn't reference food-core, but old cached nutrition.js is self-contained → consistent. No mixed state is broken | Verified reasoning above; deploy is atomic on Vercel |
| **Search** | `nuNormalizeUsdaFood`/`nuApplyDefaultPortion` interplay (result-row mutation) — only the former moves | `nuApplyDefaultPortion` stays; calls core math across the file boundary exactly as it does today |
| **AI logging** | Retry-ladder semantics (alike gate, cup table precedence, unresolved flag) altered during the move | Bodies move verbatim; 21 assertions cover every rung; live QA re-run at each checkpoint |
| **Barcode** | Only its normalize call relocates | Covered by smoke; server route untouched |
| **Saved meals** | Replay src shape drift in 4.2.1c | Existing src-shape test asserts all 15 fields; builder is compared field-for-field |
| **Favorites / Recents** | `nuFoodKey` moves and its output is PERSISTED in `user_food_favorites.food_key` — any format change orphans stars | New pin test in 4.2.1a asserts exact `usda:<id>` / `custom:<name>` strings before the function moves |
| **Editing** | Provenance rules (`nu_pendingSource` name-intact, edit never rewrites source columns) | `nuSave`/`nuSaveLog` are not touched in any subphase |
| **food_logs persistence** | Snapshot math (`nuScaleMacros` shared by display + save) diverging | The function moves whole; both callers use the moved copy — one implementation, as today |
| **Server routes** | None modified in 4.2.1 | — |

## 10. Behavior-equivalence strategy

- **Byte-for-byte where practical:** 4.2.1a/b are relocations — function bodies copied verbatim (4.2.1b's two mechanical `source.` substitutions excepted). The PR diff will read as pure moves.
- **Assertion-for-assertion everywhere:** the 66-test suite (21 resolution + 18 search + 23 progression + 4 route) runs green at every checkpoint with **zero assertion edits** through 4.2.1b; 4.2.1c adds assertions, changes none.
- **Live verification:** after each checkpoint, the seven paths in §1.1 exercised against production (search a food, AI-log a meal, scan a barcode, replay a saved meal, tap a favorite, edit an entry, check totals) with Effi's owner account, entries cleaned up after.

---

*End of proposal. Awaiting approval at Checkpoint 0.*
