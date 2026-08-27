# Muscle Motivation — Roadmap Phase History

Append-only closure record for the canonical roadmap (`docs/ROADMAP.md`).

**Rules:**

- **Append-only.** Earlier rows are not rewritten. Never rewrite history to make it look cleaner.
- One record per **closed phase**, added at closure time (see `docs/ROADMAP.md` §12.5).
- **Never written automatically by CI.**
- Record only what repository evidence supports. Where a detail cannot be reconstructed from the
  repository or git history, write **`historical detail not reconstructed`** rather than guessing.

**Fields:** date · phase · status · merge SHA · major shipped scope · deferred-out scope ·
exit-criterion result.

> This file was initialized on 2026-08-14 during canonical-roadmap adoption. The phases below closed
> **before** the roadmap-governance process existed, so their records are reconstructed from git history
> and committed documentation. Their exit-criterion fields are marked accordingly — they were not
> evaluated against a written exit criterion at the time.

---

## 4.2 — Core Feature Reliability

| Field | Value |
|---|---|
| **Closed** | 2026-08-03 |
| **Status** | COMPLETE |
| **Closing SHA** | `c34f8d962021f5a23e63df032a39370869e75de5` — *feat(eval): Phase 4.2.11 — continuous-evaluation CI, direction-aware gate & governance* (merged `7a1c17b7748ebb869e1517b622cba7c674e2017a`, PR #1) |
| **Span** | 2026-07-13 (`299b74a`, Phase 4.2.1 design checkpoint) → 2026-08-03 |

**Major shipped scope**

- **Nutrition track.** Shared food-resolution core (`food-core.js`); candidate reranking
  (`food-ranking.js`, 4.2.2, `b6ead17`); confidence and clarification; correction memory
  (`food-memory.js`, 4.2.4); vague portion intelligence (`food-portion.js`, 4.2.5); meal-level reasoning
  (`food-meal.js`, 4.2.6); food-core hardening with tiered identity/intent/quality ranking signals (4.2.7);
  shared presentation core (`food-display.js`, 4.2.8, `47b9736`); the nutrition evaluation suite
  (4.2.9, `f0ccb42`); confidence and ambiguity hardening (4.2.10a–d, `3313349` → `d8ffeba`);
  continuous-evaluation CI with a direction-aware gate and baseline governance (4.2.11, `c34f8d9`).
- **Exercise track.** Shared exercise-intelligence foundation (`exercise-core.js`, 4.2.1E, `32abb43`);
  picker integration via shared search (4.2.1F, `1d91276`); canonical catalog expansion to 141 rows
  (4.2.1G, `921e8c8`); custom-exercise lifecycle (`exercise-custom.js`, 4.2.1H); discovery filters
  (`exercise-filters.js`, 4.2.1I); logging reliability (`exercise-log.js`, 4.2.1J); canonical/custom PR and
  logged identity (4.2.1K, `061d4e7`); picker filter mobile UX (4.2.1L, `d5f6484`).

**Deferred out of this phase**

- Exercise detail surface, exercise media, exercise favorites/recents, and the rule-based substitution
  engine — planned under later historical exercise phases, never built. Carried forward to
  **4.3.6H / 4.3.6I / 4.3.6J** and **5.1.6 / 5.1.7**.
- Legacy pre-4.2.1K custom `workout_exercises` rows remain name-keyed; the backfill deliberately did not
  guess ambiguous rows. See `docs/ROADMAP.md` §10.1.
- Nutrition open loops: portion-correction persistence and gram-edit capture; meal-context confidence
  gating (shipped default-off); word-order ranking sensitivity; yogurt fat-basis presentation ordering.
  Carried forward to **5.4.12–5.4.14**.
- Branch protection requiring the `verify` check — recorded as deferred in `.github/workflows/ci.yml`.
  Deferred at the time; **subsequently configured on 2026-08-14** — see "Completed repository actions"
  below.

**Exit criterion** — no written exit criterion existed at the time. Evidence of completion: the
`npm run verify` gate is green in CI, and the committed evaluation baseline records 288 cases at 100%
scored pass rate with a 0% false-confidence rate (`nutrition-evaluation/BASELINE.md`,
`nutrition-evaluation/HISTORY.md`).

---

## 4.3.1 — PWA Install Foundation

| Field | Value |
|---|---|
| **Closed** | 2026-08-03 |
| **Status** | COMPLETE |
| **Merge SHA** | `c04e64c9f73b69050659c3f1dad4676d133e66e3` (PR #2), implementation `1d6248a9b35fb18afeab41f0799f54593a9a263d` |
| **Follow-up** | `b8285a84f77290fbcbd4937a6400b8537ef552b1` (PR #3) — `848b3e6` iPhone PWA rest-timer / safe-area fix |

**Major shipped scope** — `manifest.webmanifest`; the generated icon set including maskable variants and
`apple-touch-icon`; root `favicon.ico`; a dependency-free icon generator; per-page head metadata on every
root HTML page except `calculator.html`; manifest content-type headers; static validation tests. Design
record: `docs/pwa-foundation.md`.

**Deferred out of this phase** — Android install validation (carried to **4.3.5K**). Deliberately shipped
with no service worker, no Cache Storage, no offline behavior, no background sync, no push, and no
install-prompt UI.

**Exit criterion** — no written exit criterion at the time. The app became installable with stable
manifest identity and no caching surface.

---

## 4.3.2 — Service Worker & Update Safety

| Field | Value |
|---|---|
| **Closed** | 2026-08-06 |
| **Status** | COMPLETE |
| **Merge SHA** | `a9d93ef2831f8e891b16cf1eaa6e6d140e2ab6f5` (PR #4) |
| **Span** | `49c4350434be06564346dfd1524f2650573489b6` (2026-08-03, cache-policy core) → `c8f56e5da5e6d6037ffb9319281665b73017c90a` (2026-08-04, controlled updates) |

**Major shipped scope** — `sw-policy.js` as the single source of truth for the frozen static allowlist,
`mm-static-vN` cache naming, and default-deny request eligibility; `sw.js` + `sw-runtime.js` worker runtime
that fails safe by attaching no listeners if policy load fails; registration, update detection, and a
user-controlled refresh flow with an explicit **Update now / Later** banner; bottom-control clearance
measurement; a session reload-loop guard; `updateViaCache: 'none'` plus script revalidation headers.

Privacy boundary held throughout: HTML navigations, `/api/*`, Supabase auth/session state, and any
authorization-bearing request are never cached or intercepted. `skipWaiting()` only ever runs from an
explicit user action.

**Deferred out of this phase**

- Shared app-wide dirty-state / unsaved-work registry — carried forward to **4.3.5G**.
- Canonical production hostname confirmation (apex vs `www`) for the registration guard — carried forward
  to **4.3.5H**.

**Exit criterion** — no written exit criterion at the time. Safe update lifecycle with versioned caches and
an intact privacy boundary.

---

## 4.3.3 — Install Onboarding & Update UX

| Field | Value |
|---|---|
| **Closed** | 2026-08-09 |
| **Status** | CLOSED |
| **Merge SHA** | `b20ff3a6b5149816ed2e2537d5e00f979e411b72` (PR #5); cache-version validation follow-up `e0f52c865045ebb7767f1d85632b71e84198eecf` (PR #6, `8e4214b`) |
| **Span** | `67e72b8a7c2e3a5c2f1e4d7407ddc7791e987a5a` (2026-08-07) → 2026-08-09 |

**Major shipped scope** — shared install-eligibility core (`pwa-install.js`); install onboarding UI
(`pwa-install-ui.js`); install lifecycle and value-signal wiring (`pwa-install-register.js`); service-worker
update-UX hardening (`05b06ef`) including corrected update-banner `aria-busy` semantics; workout-completion
signal validation and bootstrap guarding.

**Production validation** — completed, including desktop and installed-iPhone update behavior. All
verification and privacy guarantees from this phase are preserved.

**Deferred out of this phase** — Android install validation remained open; carried to **4.3.5K**.

**Exit criterion** — no written exit criterion at the time. Real-device production validation of the
install and update flows was completed before closure.

---

## 4.3.4 — Dashboard 2.0 & App Navigation

| Field | Value |
|---|---|
| **Closed** | 2026-08-12 |
| **Status** | CLOSED |
| **Merge SHA** | `eb506d38de3da06dded5cd64b46fea4c76c554d9` (PR #8) |

**Major shipped scope** — premium mobile-first Home with a consolidated header and reduced clutter;
Today's Plan as Home's primary action; weekly training progress from real workout history; Calories +
Protein nutrition snapshot; deterministic Coach Insight (the precursor to the AI Coach); progress snapshot
with weight and trend; **Home / Train / Nutrition / Progress** bottom navigation via a data-driven route
registry (`app-nav.js`); the app-shell CSS layer (`app-shell.css`) with one bottom-clearance strategy plus
skip link, visually-hidden helper, focus-visible ring, and a reduced-motion block; shared program/session
state (`program-state.js`) and dashboard model (`dashboard-model.js`); theme-token foundation; modular
dashboard architecture.

**Integration contracts established** (later phases must preserve these): the rendered nav carries
`data-mm-sw-bottom-control`, which the 4.3.2/4.3.3 update banner and install sheet already query;
`--mm-nav-base-height` / `--mm-bottom-clearance` are the one bottom-clearance strategy. A **Coach**
destination is reserved in the registry with `available: false` and renders nothing until 4.4 ships.

**Deferred out of this phase**

- Dashboard customization and module reordering — **4.9.1 / 4.9.2**.
- Optional Carbs/Fat on Home — **4.9.3**; Calories + Protein remains the default.
- Nutrition zero-state currently replaces the module with "Nothing logged yet today" instead of showing
  empty progress tracks — carried to **4.3.5A**.

**Exit criterion** — no written exit criterion at the time. The current app-shell architecture was
established and is the foundation 4.3.5 hardens.

---

# Completed repository actions

Repository-level obligations rather than product phases. Closed entries stay here.

## Branch protection — `verify` required on `main` · **CONFIGURED 2026-08-14**

**Required by** `docs/ROADMAP.md` §2.2 (Engineering Invariants). Precedes 4.3.5 implementation; it was
deliberately not left as a paid-launch item.

**Configured on:** 2026-08-14
**Branch:** `main`
**Configured by:** Effi (repository owner), manually in the GitHub web UI

**Settings reported as enabled:**

- Require a pull request before merging
- Require status checks to pass before merging
- Require branches to be up to date before merging
- Required status check: **`verify`** (workflow *Continuous Evaluation*, `.github/workflows/ci.yml`)

**Evidence — read this distinction carefully:**

| Fact | How it is known |
|---|---|
| `main` is protected | **Tool-verified.** The GitHub branches API returns `"protected": true` for `main` (read 2026-08-14 at `aec3acc`). |
| The four specific settings above | **Owner-confirmed, not tool-read-back.** |

The available GitHub tooling exposes no branch-protection or ruleset endpoint, so the individual
settings could not be read back programmatically from this environment (no `gh`/`hub` CLI, no
protection API in the toolset, no API token for a direct REST call — git authenticates over SSH,
which cannot sign REST settings requests). The `protected: true` flag confirms a rule **exists**; it
does not enumerate what the rule contains. The settings list above is recorded on the owner's
confirmation.

**If the configuration is ever revised**, append a new dated entry rather than editing this one.

---

# Roadmap decisions

Decisions that change roadmap scope or targets without closing a phase.

## 2026-08-14 — Phase 4.3.5F navigation-performance target defined

**Decision:** 4.3.5F now carries an explicit requirement, a measured starting point, and provisional
numeric targets (`docs/ROADMAP.md` → 4.3.5F). Recorded so "effectively instantaneous" has a concrete
boundary and cannot drift into an unapproved architecture change.

**Static audit taken before any implementation** (unminified source as served; no build step):

- Every destination reloads **133 KB** of shared same-origin JS + **35 KB** of `app-shell.css` and
  re-fetches **two cross-origin CDN scripts** (lucide via unpkg, supabase-js via jsdelivr) with **no
  `preconnect`**.
- Per-destination totals: Home ~289 KB · Train ~463 KB · **Nutrition ~634 KB** · Progress ~226 KB.
- The service worker's `STATIC_ALLOWLIST` is frozen to five icon paths, so **no HTML/CSS/JS is
  cache-eligible today**; the two CDN scripts are cross-origin and cannot enter a same-origin
  allowlist without a separate approved policy change.
- The only resource hints in the app are two font `preconnect`s — no route prefetch, no CDN or
  Supabase `preconnect`.

**Targets set:** tap acknowledged ≤ 100 ms (hard) · warm repeat navigation ≤ 600 ms p75 · first
navigation ≤ 1200 ms p75 · zero white flashes · zero duplicate shared-bootstrap initialization.
Measured on a mid-tier Android device, judged on Nutrition as the worst case.

**Explicitly recorded guard:** the two latency numbers are engineering targets, not contractual
thresholds. If the device baseline shows either is unreachable inside the current multi-page
architecture, **the target is revised — the architecture is not escalated.** SPA conversion, a
navigation rewrite, a route-system replacement, and an app-shell rebuild all remain outside 4.3.5 and
require separate explicit approval.

No implementation was performed; 4.3.5 has not started.

---

## 2026-08-20 — Phase 4.8 workout-editing capabilities recorded

**Decision:** two owner-approved capabilities that previously existed only outside the roadmap are now
written into the canonical roadmap as **4.8.11 — Active workout editing foundation** and **4.8.12 —
Exercise reordering** (`docs/ROADMAP.md` → Phase 4.8, "Workout editing"), and added to §11 Protected
Future Commitments.

**Scope recorded:**

- **4.8.11** — rename a workout while it is in progress; the rename persists to the session and into
  history and survives app/PWA restart; it must **never** silently rename the source template, routine,
  or program; the architecture distinguishes session-instance name from source-template name with no
  hidden coupling.
- **4.8.12** — hold/long-press-and-drag exercise reordering in both builders and active workouts, as
  **one shared reusable pattern**; edge auto-scroll, stable drop targets, no conflict with ordinary
  vertical scrolling, persistent order, canonical exercise identity unchanged; a non-drag Move Up /
  Move Down alternative is binding, not optional.

**Internal sequencing recorded as binding:** 4.8.11 before 4.8.12 — reorder is a drag interaction on top
of session-editing semantics, and building it on unstable session identity would produce a second
workout system.

**Numbering note (why 4.8, not 4.7).** The approval named "Phase 4.7 — Training Engine 2.0". In the
canonical roadmap **4.7 is AI Coach Action Tools** and **4.8 is Training Engine 2.0**, so the name and
the number pointed at different phases. Effi resolved this on 2026-08-20 in favour of the **name**: the
capabilities were placed in **Phase 4.8 — Training Engine 2.0**. **No phase was renumbered or
reordered**; 4.7 is untouched and the post-launch order `4.6 → 4.7 → 4.8 → 4.9 → 5.0 → 5.1` is unchanged.

**Dependency recorded:** §9.5 now names 4.8.12 as the owner of the shared reorder pattern and points at
5.0.1 (swipe framework), 5.0.3 (gesture-conflict prevention), and 5.0.4 (accessible alternatives) so two
competing drag systems are not built.

This is a roadmap planning update, not implementation completion. No production code, schema, migration,
test, or performance target was changed. Phase 4.3.5 remains open and its 4.3.5F targets are unchanged;
4.8 has not started.

---

## 2026-08-20 — Phase 4.3.5 stays open; 4.3.6 permitted to begin in parallel

**Decision (owner-approved, Effi):** Phase 4.3.5 — Mobile UX & App-Shell Hardening **remains OPEN and is
NOT closed**, pending its required instrumented Android navigation-performance validation. That
external-only validation dependency **does not block Phase 4.3.6 implementation from beginning.**

**Reason:** the sole remaining 4.3.5 item is **4.3.5F instrumented Android measurement**, and the owner has
**no current access to a physical Android device**. The blocker is external hardware access, not
unfinished implementation work.

**Accepted state at the time of this decision:** the 4.3.5 implementation is merged, verified, deployed,
and accepted — including the exercise picker/input fixes, the quick-workout auto-scroll fix, the final
picker drag-preview interaction, the workout-date integrity fix, the authenticated-menu cleanup, and the
shared Back-control polish. Real-device UX validation is complete on **iPhone Safari** and the **installed
iPhone PWA**, with qualitative **Android Chrome** and **Android installed-PWA** observation. No noticeable
full-page white flashes were observed. CI, local verification, and production state are green.

**What this decision explicitly does NOT do:**

- It does **not** mark 4.3.5 complete, and 4.3.6 starting is **not** evidence that 4.3.5 closed.
- It does **not** record 4.3.5F as passed, waived, or optional. The measurement obligation stays binding.
- It does **not** weaken, revise, or delete any performance target. Tap acknowledgement ≤ 100 ms · warm
  repeat navigation p75 ≤ 600 ms · first navigation p75 ≤ 1200 ms · zero full-page white flashes · zero
  avoidable duplicate shared-bootstrap fetch/init all stand exactly as defined on 2026-08-14.
- Qualitative Android UX observation is **not** accepted as the instrumented p75 measurement.
- It does **not** make 4.3.5 permanently uncloseable. 4.3.5 closes normally once the measurement is taken
  and §12.5 is satisfied.

**Resumption point:** when a suitable device is available, 4.3.5 resumes at **Android USB /
`chrome://inspect` instrumented navigation-performance measurement**, evaluated against the exact
then-current 4.3.5F targets.

**Measurement-integrity condition:** 4.3.6 must not silently modify or invalidate the deferred 4.3.5F
measurement contract. If 4.3.6 or later work materially changes the app-shell/navigation performance
surface before 4.3.5F is measured, the eventual measurement is interpreted against the **actual production
state at measurement time** and that circumstance must be recorded here. **Never create a historical claim
that the original 4.3.5 build was measured when later code is what was actually measured.**

**Roadmap edits made:** `docs/ROADMAP.md` — 4.3.5 heading status changed from `NEXT` to
`OPEN — VALIDATION DEBT` with a status block carrying the exception and the anti-inference guards · a
4.3.5F "Status — OUTSTANDING" note · a §4 overlap note on the critical path · new §10.8 preserved deferral ·
§13 Execution Order updated. **No phase was reordered, renumbered, or closed; no target was revised; no
implementation file was touched.**

This is a **sequencing exception, not a phase completion.**

---

## 2026-08-21 — Phase 4.3.6 owner decisions O1–O5 and R2 locked (design only)

**Decision (owner-approved, Effi):** following a read-only pre-implementation reconciliation audit of the
training-content and entitlement architecture, five owner decisions and one access-model decision are
locked for Phase 4.3.6. Recorded in `docs/ROADMAP.md` → Phase 4.3.6 → "Owner decisions — locked
2026-08-21". **This is a decision lock, not implementation.**

**Decisions:** O1 membership grants membership-included Programs while standalone purchases remain
independent and are never devalued · O2 Browse works at zero/one/many ownership, exposing catalog metadata
only and never protected session prescriptions · O3 the narrowest author mechanism sufficient to separate
private user Routines from platform-published ones, with no roles/grants system · O4 snapshot-only
history→Routine conversion with no identity guessing, no custom replacement, and no history mutation ·
O5 Programs stays inside Train with no fifth bottom-navigation tab.

**R2 — access model for the three live Programs.** `fat_loss_blueprint`, `muscle_gain`, and
`glute_builder` are each **membership-included AND standalone-purchasable**. Standalone purchases are
independent entitlements that survive absence, expiry, or cancellation of a membership. Scoped to these
three Programs only; future Programs may use any combination.

**Canonical directions approved:** evolve `workout_templates` into the canonical Routine (no third
workout-definition system) · converge `program_workouts` non-destructively toward Routine content plus a
Program→Routine relationship · create a real canonical Program catalog entity · keep `purchases`
authoritative for commerce with the Stripe webhook as its only writer and one shared entitlement resolver
above it. **No `subscriptions` table. No grants table.**

**Audit evidence that motivated these decisions** (read-only, no changes): no Program entity exists — a
Program is a text slug repeated across **nine** artifacts, one of which is the `purchases.product` CHECK
constraint, so selling a new Program requires DDL (now recorded as §10.9) · entitlement is interpreted at
**seven** independent decision points with divergent `status` predicates, one of them inside the
`program_workouts` RLS policy · `workout_templates` and `program_workouts` carry two hand-synchronised
JSONB exercise prescriptions · **230 of 610** logged exercise rows still carry legacy name-only identity,
which is why O4 forbids backfilling · production history shows 115 workouts, **zero** program-launched.

**Unresolved and explicitly deferred to Effi** — three production metadata conflicts blocking the CP1a
catalog backfill: Fat Loss "90 Day" vs "12-week" · Glute Builder goal (three sources disagree) · Muscle
Gain canonical display name. **An implementer must not silently resolve these.**

**4.3.5 is unaffected.** It remains **OPEN — VALIDATION DEBT**; 4.3.5F instrumented Android measurement
remains outstanding and its targets are unchanged. O5 removes the largest threat to that measurement by
keeping bottom navigation at the four destinations **Home · Train · Nutrition · Progress**, preserving the
p75 basis. The measurement-integrity condition still binds: later checkpoints touch Home's and Train's
authenticated bootstrap, so the eventual measurement must be interpreted against the actual production
state at measurement time and that circumstance recorded here.

No production code, schema, migration, RLS policy, Stripe configuration, test, or performance target was
changed. No Program was created and no Routine was converted. **CP1a has not started.**

---

## 2026-08-22 — Phase 4.3.6 CP1b changed the 4.3.5F measurement surface

**Recorded because 4.3.5F is still unmeasured.** Phase 4.3.5 remains **OPEN — VALIDATION DEBT**; the
instrumented Android navigation measurement has not been taken, and its targets are unchanged. Under the
measurement-integrity condition, any change to the app-shell/navigation performance surface before that
measurement must be recorded so the eventual numbers are interpreted against the real production state.

**What changed.** CP1b routed Program identity/catalog metadata through the canonical `public.programs`
catalog (`program-catalog.js`), retiring `PROGRAM_META`, `PROGRAM_URLS`, `GOAL_PROGRAM_MAP` and the
`schedules.js` `PROGRAM_NAMES` map. Home (`app.html`), Profile and Train (`workout.html`) now consume the
catalog; `workout-history.html` and `workout-complete.html` load the module as a cache reader only.

**Effect on the four measured destinations (Home · Train · Nutrition · Progress):**

- **First page load of a browser session** — one additional Supabase request for the 3-row published
  catalog, issued **in parallel** with an existing query (`purchases` on Home, the ownership check on
  Train) rather than sequentially. The number of *sequential* round trips on Home's critical path is
  unchanged.
- **Every later navigation in that session** — **zero** additional requests. The catalog is held in a
  session-scoped cache, so the repeat-navigation path the 4.3.5F warm target is judged on pays nothing.
- **Payload** — `program-catalog.js` (~6 KB unminified) is added to Home, Train, Profile,
  workout-history and workout-complete.
- **Nutrition and Progress are untouched.**
- Bottom navigation is unchanged at four destinations; no route, shell, or prefetch behaviour changed.

**Interpretation rule for the eventual measurement:** the Android p75 numbers, when taken, measure the
**post-CP1b** production state — not the original 4.3.5 build. That distinction must be stated when the
result is recorded. **No 4.3.5F target was changed.**

**Also recorded:** roadmap §10.10 — a latent `TRUNCATE` grant to `anon`/`authenticated` across the
`public` schema (Supabase default; `TRUNCATE` bypasses RLS). Verified **LOW** and not reachable through
PostgREST, deferred to a dedicated security checkpoint rather than fixed inside feature work.

---

## 2026-08-23 — Phase 4.3.6 CP2-RLS — `program_workouts` read policy aligned with the entitlement model

**Why this exists.** CP2b (migrating client entitlement call sites to the shared resolver) was **BLOCKED**:
the CP2a resolver would have returned *allow* for membership-included access and for `past_due`, while the
`program_workouts` RLS policy still required a standalone purchase with `status = 'active'`. A user would
have seen an unlocked Program and then received an empty workout. Rather than weaken the client or quietly
edit a live paid-content policy inside a refactor, database enforcement was aligned first, in its own
reviewed checkpoint.

**Before** — standalone ownership only, `active` only:

```sql
EXISTS (SELECT 1 FROM purchases p
        WHERE p.user_id = auth.uid()
          AND p.product = program_workouts.program_slug
          AND p.status  = 'active')
```

**After** — Branch S OR Branch M, mirroring `entitlement-core.js`. Migration
`align_program_workouts_entitlement_rls` (2026-08-23), applied with `ALTER POLICY` so the name, command
(SELECT) and role (`authenticated`) are preserved and the table is never momentarily unprotected:

- **Branch S — standalone ownership.** `p.product = program_slug` with status `active` or `past_due`.
  Deliberately independent of every catalog fact: a purchased Program stays readable even once it is
  un-published, retired, or withdrawn from sale. **Sellability is never an ownership condition.**
- **Branch M — membership.** `p.product = 'ai_membership'` with status `active` or `past_due`, **and** the
  catalog row for that slug has `included_with_membership = true` **and** `status = 'published'`. Draft
  and retired Programs are not part of the active membership library.

**Intentional widening.** This checkpoint deliberately widens SELECT for two previously denied cases:
membership-included access, and `past_due` during Stripe's dunning retry. `canceled` and `refunded` remain
denied, and `refunded` remains terminal. **No prescription content became public** — the policy is still
`TO authenticated` and still requires a qualifying purchase; anonymous access returns nothing.

**No `SECURITY DEFINER` helper was needed.** Ordinary RLS composition expresses the model correctly: the
nested `programs` lookup is itself filtered by the `programs` policy (`status = 'published'`). The policy
*also* states `g.status = 'published'` explicitly, so that if the `programs` policy is ever widened — for
an admin surface, say — the membership branch cannot silently begin granting drafts.

**Tested against real RLS** using `SET LOCAL role authenticated` with JWT claims, in rolled-back
transactions: 6 standalone cases, 7 membership cases, 4 mixed cases, plus anon denial — **17/17 as
expected**, including the two that matter most (a standalone purchase survives a retired + unsellable +
un-included Program; membership does **not** grant a draft or retired Program). Every synthetic row was
rolled back and verified gone: purchases still 5, programs still 3, `program_workouts` still 47, zero test
users leaked.

**Production equivalence: nobody gained or lost access.** Measured per real identity before and after —
the owner account still sees 16/15/16 prescriptions across the three Programs; the refunded-only account
still sees 0. The widening is entirely forward-looking.

**Rollback** (tested in a transaction; restores the previous `qual` byte-for-byte and re-denies
membership-only access):

```sql
ALTER POLICY program_workouts_read ON public.program_workouts
USING (EXISTS (SELECT 1 FROM public.purchases p
               WHERE p.user_id = auth.uid()
                 AND p.product = program_workouts.program_slug
                 AND p.status = 'active'));
```

**Unchanged:** `purchases` (rows, policies, `product` CHECK, webhook-only writes) · `programs` rows and
flags · `workout_templates` RLS · all grants (no write privilege widened; `program_workouts` still has
exactly one policy, SELECT) · Stripe · every application file. The §10.10 `TRUNCATE` debt was deliberately
**not** bundled in.

**Phase 4.3.5 remains OPEN — VALIDATION DEBT.** This is a database-only checkpoint: no page, bootstrap,
route, navigation, or payload changed, so the four-destination 4.3.5F measurement surface is untouched and
its targets are unchanged. **CP2b did not resume here and is not complete.**

---

## 2026-08-23 — Phase 4.3.6 CP2b — Program access centralized; `past_due` now live

**Approved behaviour change, stated plainly:** Program access for users in Stripe's `past_due` dunning
window changes **from denied to temporarily allowed**, and a qualifying membership now grants
membership-included Programs. This matches the CP2a policy and the CP2-RLS database policy. It is not a
pure refactor.

**Migrated onto `entitlement-core.js`:** the three Program pages (`program-fat-loss`,
`program-muscle-gain`, `program-glute-builder`), `workout.html` `loadRecommended`, and `program-state.js`
(`pgLoadOwnedPrograms` → **`pgLoadAccessiblePrograms`**, renamed because a membership grants access
without ownership). `profile.html` uses `entHasQualifyingMembership` for its billing card rather than a
fabricated Program object. Every page-local `\.eq('status','active')` and `.in('status', […])` on
`purchases` is gone; queries are now deliberately unfiltered so the resolver stays the only policy.

**4.3.5F measurement surface — changed again, recorded as required.** The Android measurement is still
outstanding, so this note keeps the eventual numbers attributable.

- **Home** — still **1** `purchases` request, still parallel with the catalog fetch. The query lost its
  `status` filter (same round trip, ~5 extra rows at current scale). Sequential round-trip count
  unchanged.
- **Train** — still **1** `purchases` request, still parallel with the catalog fetch.
- **Profile** — **2 → 1**. The Programs list and the billing card now share one fetch. *(Profile is not
  one of the four measured destinations, but the duplicate is genuinely gone.)*
- **Payload** — `entitlement-core.js` (~5 KB unminified) added to Home, Train, Profile and the three
  Program pages. **Nutrition and Progress do not load it** and are untouched.
- Bottom navigation, routes, prefetch and app-shell architecture are unchanged; **no 4.3.5F target was
  altered**.

**The eventual Android p75 therefore measures the post-CP2b state**, not the original 4.3.5 build and not
the post-CP1b state. That must be stated when the result is filed.

**Client ↔ database parity is now a matched pair.** The resolver and the `program_workouts` policy encode
the same rules, and `entitlement-consumers.test.js` pins that agreement case by case. **Changing one
without the other reintroduces the CP2b block.** One deliberate asymmetry is documented in those tests:
the resolver is publication-agnostic, because the catalog loader and the `programs` RLS both filter to
`status = 'published'`, so an unpublished Program never reaches the client to be resolved.

**Unchanged:** `program_workouts` / `workout_templates` / `purchases` / `programs` RLS · the
`purchases.product` CHECK · Stripe and the webhook as sole writer · progression, `user_programs`,
optional/progression mode, workout history and template execution · the public store page. No CP3 work.

---

## 2026-08-23 — Phase 4.3.6 CP3 — shared Routine contract extracted

**What.** `routine-core.js` now owns the Routine exercise PRESCRIPTION shape shared by
`workout_templates.exercises` and `program_workouts.exercises` — `name · exercise_id · sets · reps_low ·
reps_high · notes · rest_sec`. The two arrays have always had to match, and the code said so in comments,
but nothing enforced it. **No schema change, no migration, no RLS change, no database write.**

**Defaults are carried over verbatim, none invented:** `sets 3` (`TEMPLATE_DEFAULT_SETS`), `reps_low 8`,
`reps_high 12`, `rest_sec 90` — all previously inline in `saveTemplate` and `addTemplateExercise`. Read
paths never applied defaults and still do not.

**Identity is preserved, never repaired.** The core performs no lookup at all (asserted by test). A
canonical `exercise_id` is carried through; a name-only entry stays name-only. All 325 `program_workouts`
entries are name-keyed, and inventing ids for them would silently "fix" the protected identity debt in
roadmap §10.1. Resolution stays with the caller via `libraryExerciseId`, exactly as `saveTemplate` always
did it.

**Round-trip gate — measured against real data before merge.** All **512** live prescription entries (187
templates + 325 program) were verified read-only to already satisfy every normalizer invariant: names
trimmed and non-empty, integer sets ≥ 1, integer reps with `reps_high ≥ reps_low`, trimmed notes, non-zero
integer rest, and `exercise_id` string/null/absent. Normalization therefore **cannot alter any value**.
The 512 entries reduce to **40 distinct shapes**, and all 40 were round-tripped through the real module:

- **Semantic equality: 40/40 — zero semantic drift.**
- **Value drift: 0.** No stored value is changed by normalization.
- **Literal equality: 4/40.** The other 36 differ *only* by materializing `exercise_id: null` where the
  key was absent. That is the omitted-vs-null case, it is semantically identical to every consumer
  (`ex.exercise_id != null`), and it matches what the write path has always emitted. **No stored row was
  rewritten** — reads normalize in memory only.
- Idempotent, order-preserving, inputs never mutated.

**Consumers migrated** (all in `workout.html`): `saveTemplate`, `addTemplateExercise`,
`duplicateTemplate`, and `editTemplate`. The last two previously deep-cloned with
`JSON.parse(JSON.stringify(...))`; normalizing also deep-copies, so the no-shared-reference guarantee is
unchanged.

**Validation is deliberately narrow** — `valid` / `legacy_identity` / `invalid` only. Publish eligibility
is CP6 and history candidacy is CP7; a test asserts the CP3 module contains no publish/draft/candidate
vocabulary. A test also asserts CP3 added none of the CP4+ Routine metadata fields.

**4.3.5F:** `routine-core.js` (~6 KB unminified) is added to **Train only**; Home, Nutrition and Progress
do not load it, and no new network request, route, prefetch or navigation change was introduced. The
measurement surface is otherwise as recorded for CP2b.

**Unchanged:** all RLS · `purchases` and its CHECK · Stripe · progression, `user_programs`,
optional/progression mode, workout history, template execution · entitlement. **CP4 has not started.**

---

## 2026-08-23 — Phase 4.3.6 CP4 — `workout_templates` becomes the canonical Routine

**Additive schema + a security-safe RLS split. This checkpoint adds CAPABILITY, not behaviour: no
platform Routine exists, nothing is published, and READ exposure is unchanged for every user.**
Migration `routine_model_additive_columns_and_rls_split`.

**Columns added** (six): `description`, `goal`, `difficulty` — all nullable, existing rows stay null
rather than guessed · `tags text[] not null default '{}'` — metadata only, never entitlement or execution
input · `is_platform boolean not null default false` · `visibility text not null default 'private'`.
No column was dropped, renamed or retyped; **no row was rewritten**.

**Constraints:** `visibility in ('private','published')` · `goal in ('fatloss','recomp','muscle')` —
reusing the live `profiles.goal` vocabulary, no new taxonomy · and the structural one that matters,
`visibility = 'private' OR is_platform = true` — **a user-owned Routine can never be published**,
enforced by CHECK rather than by application code.

**Two fields were deliberately NOT added, with reasons:**

- **`status`** — it would duplicate `visibility` (both carrying `'published'`) and allow contradictory
  rows such as `status='draft'` + `visibility='published'`. Lifecycle belongs to the CP6 publishing
  workflow as **one** state machine, not two. `visibility` alone covers the security-relevant axis.
- **`source_workout_id`** — no consumer until CP7, and at 38 rows the later migration is trivial. Its
  semantics (snapshot, `ON DELETE SET NULL`, independence from live history) are best reviewed alongside
  the conversion code that writes it.

`tags` is the weakest-justified column added — it has no consumer before CP6 either — and is recorded as
such rather than presented as load-bearing.

**RLS split — the single `ALL` policy became four.** `workout_templates_own` (`ALL`, `auth.uid() =
user_id`) was replaced by explicit SELECT / INSERT / UPDATE / DELETE policies. **SELECT was NOT widened:**
it remains owner-only, so no user's read exposure changed. Platform-read arrives deliberately in CP6/CP8 —
schema capability and live publication are separate concerns.

- **SELECT** `auth.uid() = user_id`
- **INSERT** `WITH CHECK (auth.uid() = user_id AND is_platform = false AND visibility = 'private')`
- **UPDATE** `USING (auth.uid() = user_id AND is_platform = false)` + the same `WITH CHECK` — the USING
  clause stops a client touching platform rows, the WITH CHECK stops it promoting a row it owns
- **DELETE** `USING (auth.uid() = user_id AND is_platform = false)`

**Hard gate — 17/17 against real RLS**, using two real owners (8 and 7 private Routines) and rolled-back
transactions. Cross-user isolation: each owner sees exactly their own rows and zero of the other's;
anonymous sees none. Write protection, all correctly refused: insert for another user · insert with
`is_platform=true` · insert with `visibility='published'` · promote own row to platform · publish own row ·
both at once · update another user's row (0 rows affected) · delete another user's row (0 rows affected).
Permitted and confirmed: insert/update/delete of one's own private Routine. Every synthetic row was rolled
back and verified gone — still 38 rows, still 38 private and non-platform, owners still hold 8 and 7, 83
history links intact.

**Application compatibility: no code change was required.** All seven statements `workout.html` issues
today — saveTemplate insert and update, duplicate, loadTemplates, launch-by-id, `times_used` bump, delete —
were replayed under the new policies as the real owner and all succeeded unchanged. The new columns default
in a way that makes old queries valid.

**Rollback** (tested in a transaction; restores the prior policy exactly): drop the four policies and
recreate `workout_templates_own` as `FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() =
user_id)`. **The added columns should simply be left in place** — they are nullable or defaulted, no code
reads them, and dropping them is riskier than ignoring them.

**4.3.5F: no impact.** Schema and policy only; no application file changed, so no payload, request,
navigation, prefetch or app-shell change. Phase 4.3.5 remains **OPEN — VALIDATION DEBT**.

**Unchanged:** `program_workouts` (shape, RLS, data, launch reads — convergence is CP8) · `purchases`,
entitlement-core, CP2-RLS, Stripe · progression, `user_programs`, workout history. **CP5, CP6, CP7 and CP8
have not started.**

---

## 2026-08-23 — Phase 4.3.6 CP5 — Train Programs experience

**Programs now has a permanent home inside Train.** Train's start view had grown to five stacked sections
in one scroll (Recommended · My Workouts · One-Off Workout · History · My Exercises); adding Programs as a
sixth would have buried it. The five sections were regrouped into three panes behind a segmented control —
**Today · Workouts · Programs** — with **no section's internals changed**.

**Bottom navigation is untouched at four destinations** (Home · Train · Nutrition · Progress) per owner
decision O5. Pane state is view-local: no router, no history entry, no app-shell change.

- **Today** — Recommended + One-Off Workout (start something now)
- **Workouts** — My Workouts + History + My Exercises (the library)
- **Programs** — My Programs + Browse Programs

**My Programs / Browse.** Every card is classified by `resolveProgramAccess`; the page contains no
entitlement logic of its own. My Programs is the accessible subset; **Browse always shows the full
published catalog, including Programs the user already has** — hiding them would make the catalog look
broken once a user has everything. Badges are `Owned` (standalone) and `With membership`; membership
access is never described as ownership.

**Browse security boundary held.** The Programs pane reads `programs` only and **never**
`program_workouts`. Session count would have required querying protected prescription rows, so it was
**omitted rather than obtained by weakening RLS** — asserted by test. No prescription field appears on a
card, and all catalog strings are escaped.

**Progression honesty.** No progress is displayed on Program cards. There is exactly **one**
program-launched workout in production, and inventing completion states from that would be fabrication.
CTAs are `View Program` (accessible) or `Included with membership` / `Learn More` (not), all linking to the
canonical catalog `page_path` — no page path is hard-coded and **no new checkout surface was introduced**.

**4.3.5F measurement surface — changed, recorded as required.** The Android measurement is still
outstanding.

- **Train `purchases` requests: 1 → 1.** The recommended card and the Programs pane now share a single
  deduped fetch (`loadPurchaseRowsOnce`); before CP5 the recommended card fetched its own. Net requests are
  unchanged, and a second consumer was added for free.
- **Programs data loads only when the pane is opened** — Train startup pays nothing for it.
- **Catalog:** still the session-cached `pcLoadCatalog`, still parallel with the purchases read.
- **`user_programs`:** unchanged, still read only by the recommended card.
- **Payload:** Train only, roughly +3.5 KB CSS and +4 KB JS inline. Home, Nutrition and Progress untouched.
- No route, prefetch, bottom-nav or app-shell change. **No 4.3.5F target altered.**

The eventual Android p75 therefore measures the **post-CP5** state.

**Responsive validation — desktop browser simulation, NOT real-device.** The shipped CSS and card-rendering
code were rendered in fixed-width iframes at **320 / 390 / 430 px**: zero horizontal overflow at every
width, zero Program-name clipping, cards scaling 296 / 366 / 406 px. Two tap targets measured **38 px and
40 px** and were raised to a **44 px minimum** as a result. Real-device confirmation is still owed and is
not claimed here.

**Unchanged:** CP4 Routine metadata (`is_platform`, `visibility`, `tags`, …) stays unread — CP5 is built on
the Program catalog, not Routine metadata · `program_workouts` shape, RLS, data and its two execution reads
· entitlement-core, CP2-RLS, `purchases`, Stripe · progression and workout history. **CP6, CP7 and CP8 have
not started.**

---

## 2026-08-24 — Phase 4.3.6 CP6 — controlled Routine publishing

**The first platform authoring capability. Publishing is a privileged, server-authorized action; normal
users remain private-only and cannot promote or publish anything.**

**No new lifecycle column.** CP4's decision holds — `is_platform` + `visibility` express every state:
`user_private` (false/private) · `platform_draft` (true/private) · `platform_published` (true/published) ·
unpublish returns published → private. The fourth combination is impossible by database CHECK, which makes
"a user can never publish their own Routine" **structural** rather than a policy detail.

**Privileged identity — config, not schema.** `/api/routine-admin` verifies the caller's Supabase bearer
token server-side (the same `getUserFromToken` pattern as `/api/ai-food-parse` — a client-supplied user id
is never trusted), then requires that id to appear in **`ROUTINE_ADMIN_USER_IDS`**, a server-only
environment variable. No roles table, no grants table, no RBAC. **It fails closed: unset ⇒ nobody is
authorized.**

> ⚠️ **Deployment step owed by Effi.** `ROUTINE_ADMIN_USER_IDS` is not yet set in Vercel, so the endpoint
> currently refuses every caller. That is the intended safe default, but authoring stays inert until the
> variable is configured with the owner's Supabase auth user id.

**Six privileged actions**, one endpoint: `list` · `get` · `create` · `update` · `publish` · `unpublish`.
`buildPatch` deliberately cannot accept `is_platform` or `visibility`, so **a save can never publish** —
publication is only ever its own explicit action, re-validated server-side at the moment it happens.

**Publish eligibility** is centralized in `routine-lifecycle.js` (pure, shared by server and tests):
platform-owned · not already published · non-empty name · description present · goal in
`fatloss|recomp|muscle` · at least one exercise · no malformed prescription · **every exercise carries a
canonical `exercise_id`**. Reasons accumulate as stable codes so the author is told everything to fix.

**Identity safety.** Name-only entries are rejected as `legacy_identity`. A user custom exercise is blocked
**by the shape of the CP3 contract** — it carries only `exercise_id`, so a custom-derived entry arrives
null and fails the same check. Nothing is resolved, guessed or backfilled; a test asserts the lifecycle
core references no lookup of any kind.

**RLS: SELECT was NOT widened.** No consumer needs published Routine reads — CP5's Programs UI is built on
the Program catalog and CP8 owns Program→Routine — so the CP4 owner-only policy is untouched. Platform
rows are managed entirely through the service-role path. Verified **9/9 against real RLS** in a rolled-back
transaction: a normal user cannot set `is_platform`, cannot publish, cannot promote an existing own row,
cannot edit or delete a platform row (0 rows affected), and **cannot see platform drafts or published rows
at all**; anonymous sees nothing; own-Routine access is unaffected. Every synthetic row rolled back — still
38 routines, 0 platform, 0 published.

**Secret containment (hard gate):** no `SERVICE_ROLE`, `ROUTINE_ADMIN_USER_IDS` or `process.env` appears in
any browser-delivered file. The allowlist is referenced only by the server route and its test. The studio
page holds no user id, no email allowlist and no client-side role check — it calls the API and renders
whatever the server permits, treating a 403 as "not an author".

**Authoring surface:** `routine-studio.html`, an internal page that is **unlinked from all navigation** and
`noindex`. It reuses `routine-core.js` for the prescription contract and shows a real preview — name,
description, goal, difficulty, tags and the ordered prescription — **without ever changing visibility**.
Publish requires an explicit confirmation dialog showing name, exercise count, goal and the eligibility
verdict. It conforms to the repo-wide error-reporter and PWA-metadata invariants rather than exempting
itself.

**4.3.5F: no impact.** Home, Train, Nutrition and Progress load none of the authoring code — asserted by
test. No payload, request, navigation or app-shell change. Phase 4.3.5 remains **OPEN — VALIDATION DEBT**.

**Rollback:** remove the endpoint and the studio page, or simply unset `ROUTINE_ADMIN_USER_IDS` — which
alone disables all authoring. Any platform rows can be unpublished (`visibility` → `private`); nothing
needs deleting, and no user data is involved.

**Unchanged:** `program_workouts` shape, RLS, data and both execution reads · CP5 Programs UI · entitlement,
`purchases`, Stripe · all 38 user Routines, still private and non-platform with zero automatic changes.
**CP7 and CP8 have not started.**

---

## 2026-08-25 — Phase 4.3.6 CP7 — workout history → private Routine drafts

**Conversion is copy-only and user-confirmed.** It creates private user Routines, never mutates history,
never guesses exercise identity, and does not begin Program→Routine convergence.

**The audit changed the design.** Of **121** completed workouts only **13 (11%)** are fully canonical; **106
(88%)** contain a custom or name-only exercise (645 entries: 53% canonical, 11% custom, 36% legacy). Manual
identity resolution is therefore the *dominant* path, not an edge case, so the review screen is built around
resolving exercises rather than confirming a name.

**Deterministic derivation**, grounded in that data (1838 of 1899 sets qualify; `is_warmup` unused; all notes
fields empty): a set counts only if completed, not a warm-up, and carrying positive whole reps. `sets` is
their count, `reps_low`/`reps_high` their observed min and max. Rest has no source in history so it takes the
CP3 default, **flagged as defaulted and disclosed in the UI**. Notes are empty — performance logs are not
coaching notes. **Historical load is never carried**: the contract has no load field and CP7 invents none.

**Identity is preserved, never repaired.** Canonical carries through; custom and name-only entries are
surfaced for the user to replace through the normal exercise picker. An explicit pick is the only thing that
grants identity, and a non-canonical pick is refused rather than stored. **The CP3 contract was not widened**
to hold custom identity.

**Provenance:** `workout_templates.source_workout_id uuid NULL` → `workouts(id)` **ON DELETE SET NULL**,
never CASCADE — a Routine is a snapshot, so deleting history costs it a breadcrumb and nothing else. No
unique constraint: converting the same workout twice is allowed. No index (39 rows, owner-scoped). Existing
rows unaffected.

**Review UX:** Train → Workouts → History → *Save as Routine* → review → *Create Routine*. A **full view,
not a sheet** — no scroll lock, no focus trap, no dialog close-event semantics, applying the CP6 lesson
directly. Create is disabled until every flagged item is resolved, eligibility is re-checked at submit, and
cancelling or leaving by any path discards the draft. The button renders only where conversion can be
completed, so `workout-history.html` gets no dead-end control.

**Live production validation** (browser, authenticated): all 10 loaded workouts analysed as `needs_review` —
matching the 88% audit figure. A 9-exercise workout with 6 flagged entries was resolved through the real
picker and created as a private Routine. **History immutability was proven sharply**: after conversion the
source workout still held **6 custom + 3 canonical** exercises while the Routine held **9/9 canonical**, and
the workout's `updated_at` still equals its `created_at` — it has never been written. The Routine was then
deleted through the ordinary user path and history remained complete (9 exercises, 27 sets). Final state: 121
workouts, 39 Routines, 0 test rows left.

**Unchanged:** `program_workouts` shape, RLS, data and both execution reads · CP6 platform authoring and its
validation row · entitlement, `purchases`, Stripe · CP5 Programs UI. `routine-history.js` loads on **Train
only**. **CP8 has not started.**

---

## 2026-08-25 — Phase 4.3.6 CP8a — Program sessions migrated onto canonical Routines

**Schema and data only. No RLS change, no runtime cutover** — Programs still execute from
`program_workouts`. CP8b owns the entitlement-scoped read policy and the execution switch; splitting them
keeps the riskiest change (widening Routine SELECT) in its own reviewed step.

**The identity gate passed cleanly.** All **40** distinct Program exercise names matched a canonical
`exercises` row by **exact equality** — 0 alias, 0 fuzzy, 0 unmatched, 0 ambiguous. **No migration map was
needed and nothing was guessed.** A dry run over all 325 entries before any write confirmed they already
satisfied the CP3 contract, so the only change to any prescription is **adding `exercise_id`**.

**Relationship model — `program_routines`.** Placement lives on the relationship, never on the Routine, so
a Routine can be reused across Programs: `program_id` → `programs`, `routine_id` → `workout_templates`
**ON DELETE RESTRICT** (a live Program must not lose its structure silently), `session_key`, `sort_order`,
and `legacy_program_workout_id` **UNIQUE** — provenance and idempotency in one field. `unique(program_id,
session_key)` mirrors the legacy `unique(program_slug, session_key)`.

**`session_key` is the linkage, not `sort_order`.** Session keys are unique per Program (16/15/16) and are
what `startProgramSession()` and the `schedules.js` training-days mapping key on; `sort_order` is a
non-unique display hint (only 10/4/10 distinct values) carried across verbatim. No periodization concept
was invented — no phases, blocks, cycles or day-of-week.

**Migration result — 47 sessions, 325 entries, ZERO semantic drift** on name, sets, reps_low, reps_high,
notes, rest_sec, session name, sort order and array length. All 325 carry a canonical `exercise_id`; all 47
Routines are `is_platform=true, visibility='published'`, owned by the platform account and with `goal`
inherited from the parent Program. Per Program: fat_loss 16/16, muscle_gain 16/16, glute_builder 15/15.
**Idempotent** — 0 sessions remain unmigrated, so a re-run is a no-op.

**Nothing else moved:** 38 user private Routines unchanged · 121 workouts and 1899 sets unchanged · 1
progression row and 5 purchases unchanged · all 47 legacy `program_workouts` rows **retained intact** for
rollback. The CP6 validation draft is still `platform / private` and has **0 relationships** — a draft can
never be a Program session.

**Rollback (CP8a):** drop `program_routines` and delete the 47 migrated platform Routines. Nothing reads
them, no user data is involved, and `program_workouts` is untouched and still the runtime source.

**Known follow-up:** the migrated Routines have no `description`, so they would not pass the CP6 publish
eligibility rule if an author later unpublished and republished one through Routine Studio. That rule was a
CP6 design choice for standalone platform Routines and is arguably too strict for a Program session, whose
description lives on the Program. Recorded rather than silently relaxed.

**Phase 4.3.5 remains OPEN — VALIDATION DEBT.** CP8b and CP8c have not started.

---

## 2026-08-25 — Phase 4.3.6 CP8b — entitlement-scoped Routine reads + execution cutover

**Program execution now runs on canonical Routines. `program_workouts` has ZERO normal runtime
prescription reads** and is frozen rollback data.

**A real problem caught before applying RLS.** A policy's subqueries are themselves filtered by the
referenced table's RLS. The first draft joined `programs` for the standalone branch — but the `programs`
policy exposes only `status='published'`, so a standalone owner of a **retired** Program would have been
denied their own purchased content, breaking the rule that standalone ownership survives catalog changes.
The fix is a second permissive policy, `programs_read_purchased`: a Program is readable when published **or
purchased**. Nothing new leaks, and it is independently correct. **No `SECURITY DEFINER` was needed.**

**Final Routine SELECT:** own rows, **or** a Routine that is `is_platform` **and** `published` **and**
linked through `program_routines` to a Program the caller is entitled to. `program_routines` has its own
entitlement-scoped read policy referencing only `programs` + `purchases` (no recursion), and **no write
policy at all** — relationship writes stay service-role only. The entitlement predicate is restated in both
policies so loosening one cannot silently widen the other.

**17/17 verified against real RLS**, in rolled-back transactions. Standalone `active`/`past_due` allow,
`canceled`/`refunded` deny. **Standalone ownership survived every catalog change** — un-sellable, excluded
from membership, and retired all still allowed. Membership allowed only for published + included Programs
(excluding one Program correctly dropped visibility 47 → 31). No purchase, a known Routine id, and a known
relationship id all returned **0 rows** — and a platform **draft linked by mistake was still denied**.

**Cutover:** `applyTemplateRanges` and `startProgramSession` in `workout.html`, plus both
`workout-complete.html` reads, now resolve through `program_routines → workout_templates` in **one
protected query** (embedded `programs!inner` + `workout_templates!inner`) normalized by the shared CP3
contract. **There is deliberately no runtime fallback to legacy data** — a silent fallback would restore
dual authority and mask defects. Rollback is a deployment action, not a runtime branch. No dual writes.

**`routine_in_use` unpublish guard:** a published Routine assigned to a Program is refused with HTTP 409
before any visibility write. Nothing cascades, nothing is deleted; the author must detach or replace first.
Assignment is validated server-side against the **stored** row — only a published platform Routine can
become live Program content, so a user's private Routine and a platform draft are both refused.

**Description is now optional** (owner decision F). `missing_description` no longer blocks publishing
anywhere; it was briefly required and would have made the 47 migrated Program sessions unpublishable, since
a session's description belongs to its parent Program. Identity and prescription requirements are
unchanged — legacy identity, empty prescriptions and missing goal still block.

**Unchanged:** progression (`user_programs`), history snapshot semantics, purchases, Stripe, CP5 Programs
UI, CP6 authoring, CP7 conversion and `source_workout_id`, all 38 user private Routines, and all 47 legacy
`program_workouts` rows.

**Rollback:** restore the two runtime reads to `program_workouts`, revert the three policies (drop
`programs_read_purchased` and `program_routines_read_entitled`, restore `workout_templates_select` to
`auth.uid() = user_id`). Leave the 47 Routines, 47 relationships and legacy rows in place — no user,
history, progression or purchase data is involved.

**4.3.5F surface note:** Program session loading changed from one legacy query to one embedded canonical
query — same request count, no Train bootstrap change, and Today/Programs do not eagerly fetch
prescriptions. **Phase 4.3.5 remains OPEN — VALIDATION DEBT.** CP8c production validation has not started.

---

## 2026-08-26 — Phase 4.3.6 CP8c — production validation of Program → canonical Routine convergence

**Verdict: CP8c — PRODUCTION VALIDATED. No defects. No code changed.** Validated against production
`e9277e2` on `musclemotivation.fit`, confirmed by fetching the live `workout.html`,
`workout-complete.html` and `routine-lifecycle.js` and diffing them byte-for-byte against local `e9277e2`.

**Canonical execution proven at the network layer**, not inferred from a working page. Starting a Program
session issued exactly one prescription request —
`GET /rest/v1/program_routines?select=session_key,sort_order,programs!inner(slug),workout_templates!inner(id,name,exercises)&session_key=eq.glute_b&programs.slug=eq.glute_builder` → 200.
Across every observed request in the whole pass: **0 runtime reads of `program_workouts`.** All 47 legacy
rows remain present, intact and unused.

**Prescription parity was measured across all 47 sessions, not a sample.** Every canonical Routine is
byte-identical to its legacy row on name, order, sets, reps_low/high, rest_sec and notes — **47/47
identical, 0 drift, 0 session-name drift** — with the single intended CP8a enrichment that **325/325
exercises now carry a canonical `exercise_id`** where legacy carried none.

**Live run:** Train bootstrap issued 8 requests and **eagerly loaded no protected Program prescriptions**;
the Programs pane added **zero** requests (catalog from the CP1b sessionStorage cache, purchases fetched
once). Started an **optional** Glute B session — correct identity (`glute_builder`/`glute_b`/`optional`),
7 exercises, 22 sets matching 4+3+3+3+3+3+3. Reloading the start URL in a **fresh second tab** resumed the
same workout id and created **no duplicate**; plain `workout.html` resumed it with the timer continuing.
The snapshot wrote all 7 exercises with canonical `exercise_id` and `user_exercise_id` NULL, so the session
does not depend on future live Routine reads. **Progression was not mutated** — one `user_programs` row,
`updated_at` unchanged, no new row, no advancement. Every request returned 200; no console errors.

**Security, verified live rather than only in tests.** Unauthenticated PostgREST returned **0 rows** for
`workout_templates`, `program_routines`, `programs` and `program_workouts`, including **by exact Routine
id** and through the embedded join — knowing an id grants nothing. Authenticated, the owner saw **exactly
their own 7** of 38 private Routines. The privileged endpoint refused an unauthenticated call and a garbage
bearer with **401**. **`routine_in_use` confirmed in production:** unpublishing the assigned `Glute B`
returned **409** naming the blocking assignment, and the Routine stayed published with its relationship
intact. Assigning the CP6 draft was refused **422 `platform_draft`**; assigning a user's private Routine
was refused **422 `user_private`**. Every refused write left **zero residue**.

**Isolation held.** The CP6 draft remains private, unassigned, absent from Train and from Program session
lists, and visible only in the Studio (which showed exactly 47 PUBLISHED + 1 DRAFT). No user Routine has an
assignment; all 47 assignments map 1:1 to distinct published platform Routines. CP7's review flow still
opens with its "Your workout history is not changed" promise, deterministic derivation and custom-exercise
identity gating.

**Data integrity: zero drift.** Every pre-validation count was restored exactly — 3 published Programs, 47
relationships, 47 published platform Routines, 1 draft, 38 private Routines, 47 legacy rows, 5 purchases,
1 `user_programs`, 121 workouts, 0 incomplete, 645 `workout_exercises`, 265 PRs. The validation workout was
removed through the normal Discard flow; **no direct-SQL deletion of user data.**

**Observation, not a regression — dormant legacy sessions.** 10 of the 47 migrated sessions are unreachable
through `schedules.js` (`push`/`pull`/`legs` in both fat-loss and muscle-gain; `session_a`/`session_b`/
`session_c`/`upper` in glute-builder). The identical 10 were equally unreachable in `program_workouts`
**before** CP8 — the migration faithfully preserved them rather than silently dropping content. Reachable
counts render exactly (glute_builder shows 11 of 15).

**Observation, not a regression — previous-performance chattiness.** Loading 7 exercises issues ~48
`workout_exercises`/`workouts`/`workout_sets` requests via the Phase 4.2.1J ID-first history matching.
This is pre-existing and unrelated to CP8, which added exactly **one** request. Recorded, not fixed.

**Not validated, and not claimed.** Narrow-viewport probes at 320/390/430 could not be performed — window
resizes reported success but the page viewport stayed at 1440. CP8b's diff contains **zero** CSS, style or
class changes, so no layout surface exists for a mobile regression, but no mobile rendering was observed.
No authenticated-but-unentitled identity exists on this account, so that path remains covered by the CP8b
17/17 RLS matrix, not by live observation. **Phase 4.3.5 remains OPEN — VALIDATION DEBT.**

**Phase 4.3.6 is NOT closed.** The CP0–CP8c training-content track is complete and production-validated,
satisfying **4.3.6A, B, C, D, E, F, G and L**. Three lettered scope items remain unbuilt: **4.3.6H**
(exercise detail surface — no UI reads `instructions`/`coaching_cues`/`common_mistakes`), **4.3.6I**
(deterministic substitution engine — `exercise-core.js` carries `equipment_substitution` relationship
edges as a foundation, but there is no Swap engine API or surface; the roadmap requires this **before**
Coach can swap exercises at 4.7.5), and **4.3.6J** (exercise favorites & recents — absent entirely).
**4.3.6K** remains protected planned content. The phase exit criterion is therefore not yet met.

---

## 2026-08-26 — Phase 4.3.6H — reusable exercise detail surface

**Scope: read-only display architecture. No schema change, no migration, no content edit, no user-data
mutation.** One shared surface now exposes the curated catalog metadata that had been carried on
`public.exercises` since Phase 4.2.1E and read by no UI.

**Correction to the CP8c record.** That entry described 4.3.6H as surfacing
`instructions`/`coaching_cues`/`common_mistakes`. The production table has **`instructions` and `tips`**;
there is **no `coaching_cues` column and no `common_mistakes` column**, and none was added here. The
roadmap's "common mistakes **where represented**" is satisfied vacuously — it is not represented. Adding
that content is content work, not display work, and stays out of scope.

**Production data audit (141 canonical rows, all `is_active`).** `instructions` 141/141 (100%), `tips`
141/141 (100%), `equipment` 141/141, `primary_muscle` 141/141, `movement_pattern` 141/141, `category`
141/141, `difficulty` 141/141, `force_type` 141/141; `secondary_muscles` 90/141 (**63.8%** — the only
partial field, and the one section that legitimately disappears). Every row has usable detail content, and
the prose is real curated copy, not placeholder. **No content-hardening debt for canonical exercises.**

**The degraded paths are the common case, not an edge case.** All **142** `user_exercises` rows (141
active) carry **zero** metadata — `category` is populated on **0** of them — so a custom has nothing but a
name. Of 645 `workout_exercises`, **230 (35.7%)** are legacy name-only. Both are handled explicitly rather
than as an afterthought.

**`exercise-detail.js` — pure, DOM-free, fetch-free, DB-free.** Reuses `ExerciseLog.identityType`, so
display identity can never drift from logged identity. Its binding rule: canonical guidance is shown
**only** when the reference carries an `exerciseId` **and** the supplied catalog row's `id` equals it.
There is **no name matching, no normalization fallback and no fuzzy resolution anywhere in the module** —
a same-named custom, a legacy row, an invalid dual-id reference, and a mismatched/stale fetch each yield an
honest note instead of another exercise's instructions. Absent fields are **omitted**, never rendered as
"N/A" and never replaced with generated advice; `instructions` and `tips` stay **distinct sections**
because the data model separates them. `force_type`, `tracking_type`, `default_unit`, the boolean flags and
the raw `exercises.id` are deliberately not surfaced, and `category` is omitted as a near-duplicate of
`movement_pattern` that is already the picker subtitle.

**Surface.** A read-only bottom sheet on `workout.html` opened through `mm-sheet.js`, inheriting scroll
locking, focus capture/restore, Escape, backdrop dismissal and stacking rather than reimplementing them.
It stacks above the picker, so opening details from a result row preserves the search text and filters.
**Three entry points, one implementation:** the active-workout exercise card, the picker result row, and
the Routine/template editor row.

**Workout safety is structural, not promised.** The sheet holds no editable control and its only action is
Close; no detail code path calls `insert`/`update`/`delete`/`upsert`, the rest timer, or any set mutation.
Both properties are pinned by tests. Detail and select are **separate sibling buttons** in a picker row —
the details button does not carry the select handler, so reading about an exercise cannot add it.

**Performance.** The Train bootstrap is **unchanged** — prose was deliberately kept out of
`loadExerciseLibrary()` (~27KB across 141 rows for data only the tapped exercise needs). The sheet renders
instantly from the classification metadata already in memory, then lazily fetches one exercise's prose by
id and caches it; a reopened exercise issues **no request**, and a custom or legacy reference issues **none
ever**. Transient failures are not cached, so a reopen retries.

**Security.** Reads `public.exercises` only, under the user's own token, scoped `.eq('id', …)`. That table
is authenticated-readable by design (canonical content is not user data); `user_exercises` stays
owner-scoped and is never read by this path. No new access path, no service-role use, no RLS change.

**Tests.** `exercise-detail.test.js` (22) covers the data matrix — full/partial/absent metadata, malformed
and null input, and the anti-fabrication cases (custom named exactly like a canonical, legacy handed a
canonical row, mismatched row, dual-id reference). `exercise-detail-ui.test.js` (23) pins the structural
contracts: read-only sheet, distinct select/detail actions, id-only identity, 44px targets, wrapping, ARIA
labelling, lazy+cached fetch, and bootstrap purity. Two pre-existing tests were updated rather than
weakened: the picker identity assertion now also pins that a custom id rides only in the custom slot, and
the mm-sheet consumer contract was rewritten from a magic count to the invariant it always meant —
**browsing surfaces may be swipe-dismissible; destructive confirmations may not** — plus a new assertion
that a swipeable sheet holds no input.

**`npm run verify` green:** 2089 pass / 0 fail (2103 total), nutrition evaluation 100% (286/286),
false-confidence 0%, both strict benchmarks pass.

**Phase 4.3.5 remains OPEN — VALIDATION DEBT.**

**Phase 4.3.6 remains OPEN.** 4.3.6H is complete; **4.3.6I** (deterministic substitution engine) and
**4.3.6J** (favorites & recents) are still unbuilt, and **4.3.6K** remains protected planned content. No
substitution, swap, favorite, recent or AI-generated coaching behavior ships here. Exercise media remains
at **5.1.6** — the table has no media column and none was added.

---

## 2026-08-27 — Phase 4.3.6I — deterministic exercise substitution engine

**Scope: runtime/editor behaviour. No schema change, no migration, no content edit, no AI, no
favorites/recents.** Swap lets a user replace one exercise with an appropriate alternative while the
surrounding prescription and workout state survive intact.

**The dormant foundation is now consumed.** `exercise-core.js` has carried `equipment_substitution`
relationship edges since 4.2.1E with **zero consumers**. Rather than build on that graph alone — it is
family-keyed, and deliberately gives isolation/core/rotation no cross-family net, so isolation work
would have had almost no candidates — the engine ranks over structured metadata and reuses
exercise-core's `normalizeEquipment` / `getExerciseFamily` and `exercise-log`'s `identityType`, so
equipment vocabulary and identity never fork.

**Taxonomy audit (141 canonical rows).** `primary_muscle` 19 values, `equipment` 8 (Bodyweight 34,
Dumbbell 26, Barbell 23, Machine 23, Cable 21, Band 8, Smith 5, Kettlebell 1), `force_type` 3,
`tracking_type` 6 (**weight_reps 104, bodyweight_reps 27, time 5, weighted_bodyweight 3, distance 1,
time_distance 1**), `default_unit` 4 (lb 134, sec 5, m 1, mi 1), `movement_pattern` 12.

**Two taxonomy gaps found and handled without editing the library.** (1) `primary_muscle` is
fragmented — Chest/Upper Chest, Back/Lats, Shoulders/Front Delts, Biceps/Brachialis, Abs/Core are the
same training target, and strict string equality would strand every singleton at zero candidates. A
curated `MUSCLE_GROUP` equivalence table resolves this. It is deliberately **narrower** than
exercise-core's `MUSCLE_REGION`, which folds biceps and triceps into one "arms" region — correct for
gating relationship edges, far too coarse here, since it would let a curl stand in for a pushdown.
**Rear Delts is deliberately NOT merged into Shoulders** (a pulling muscle must not enter the pressing
group). (2) `tracking_type` mixes rep, time and distance semantics.

**Two hard gates, then a tier, then a score.** A candidate is ineligible unless it shares the source's
**muscle group** and its **tracking class** (rep-based types are mutually compatible; time, distance
and time_distance are each their own class and **no conversion is invented**). Eligible candidates are
tiered **Best matches** (same `movement_pattern`) vs **Other options**, then ordered by named
`SUB_WEIGHTS` — family 40, force type 12, equipment 10, load style 4, laterality 6, secondary overlap
≤6, difficulty 4/2, exact tracking 5 — with **score desc → name → id** tie-breaking, so the same
inputs always yield the same order regardless of catalog order. Equipment is a ranking signal, never
an eligibility gate: substitution is usually equipment-driven, so options must vary.

**Coverage: 136/141 (96.5%) have ≥1 candidate; 132/141 have ≥1 best match; average 12.7 candidates.**
The five with none — Farmer Carry, Hip Adduction, Incline Treadmill Walk, Treadmill Run, Wall Sit —
are genuinely alone in their (muscle × tracking) cell. **Returning nothing is the correct answer**;
the alternative is suggesting something wrong. Pinned in tests so a metadata regression surfaces.

**Prescription is preserved; identity is what changes.** A Routine swap rewrites `name` +
`exercise_id` and **writes none of** `sets` / `reps_low` / `reps_high` / `rest_sec` / `notes`. An
active-workout swap **UPDATEs `workout_exercises` in place** — never delete+insert — so the row id,
its `workout_sets`, `order_index` and the workout itself survive, and no second workout can appear.
The set COUNT is kept, but loads are **re-seeded from the new exercise's own recommendation** and typed
reps cleared: 185 lb of bench is not a dumbbell-press starting weight. Stale previous-performance and
history are dropped and reloaded ID-first (4.2.1J). No progression or PR logic runs.

**Completed work is never reattributed (§16 locked rule).** Swap is **blocked** once the exercise has
any completed set, with an explanatory dialog — the schema cannot say "the first two sets were a
different movement", so the only safe answer is to refuse. The guard is enforced **twice**: when the
sheet opens and again at the commit boundary, since a set can be completed while the sheet is open.

**The Program source is immutable by construction.** A Program session reads its prescription from the
platform Routine at start time and never writes back. Tests assert that **no swap code path references
`workout_templates`, `program_routines`, `programs` or `program_workouts`**, and that the only tables
`applySwap` touches are `workout_exercises` and `workout_sets` — this session's own snapshot rows.

**Custom and legacy sources fabricate nothing.** Neither carries usable metadata, so both return no
algorithmic suggestions and an honest note, and route to **"Choose another exercise"** — the existing
picker in a new `swap` mode (no second search engine). A manual pick funnels through the **same**
`applySwap` path as a ranked candidate, so semantics can never diverge.

**Entry points:** a Swap icon on the active-workout card, and the 4.3.6H detail sheet's Swap action in
editable contexts. The picker's detail view stays informational — offering a swap beside "add this
exercise" would be ambiguous. Swap is deliberately **not** a fifth icon in the Routine editor row:
five 36px controls would leave ~64px for the name at 320px.

**No AI and no network.** The engine is pure (DOM-free, fetch-free, Supabase-free) and computes
synchronously over the catalog `loadExerciseLibrary()` already holds, so opening Swap costs **zero
requests** and the Train bootstrap is unchanged.

**Tests.** `exercise-substitution.test.js` (29, incl. the full real-catalog safety sweep) and
`exercise-substitution-ui.test.js` (34). Three pre-existing tests were updated to the invariants they
actually mean rather than weakened: the detail sheet's "no mutating control" now allows navigation to a
guarded flow while still forbidding direct writes, and the mm-sheet consumer contract adds the swap
sheet to the swipe-dismissible set plus a no-input assertion for it.

**`npm run verify` green:** 2152 pass / 0 fail (2166 total), nutrition evaluation 100% (286/286),
false-confidence 0%, both strict benchmarks pass.

**Phase 4.3.5 remains OPEN — VALIDATION DEBT.**

**Phase 4.3.6 remains OPEN.** 4.3.6H and 4.3.6I are complete; **4.3.6J** (favorites & recents) is still
unbuilt and **4.3.6K** remains protected planned content. No favorite, recent, pinning or popularity
signal ships here.

---

## 2026-08-27 — Phase 4.3.6J — exercise favorites & recents

**Scope: one narrow additive table plus picker/detail UI.** No history mutation, no Program or Routine
change, no exercise-library change, no AI, no reordering.

**Favorites are explicit; Recents are derived.** A favorite exists only because the user tapped a star.
A recent exists only because the user actually **trained** the exercise — opening a picker, viewing a
detail sheet or seeing a substitution suggestion is deliberately **not** use, and tests assert the
detail path never touches recents.

**`public.user_exercise_favorites` (migration `create_user_exercise_favorites`).** Identity-only:
`exercise_id` **XOR** `user_exercise_id` (CHECK), owner-scoped RLS (`auth.uid() = user_id`, using +
with check), all three FKs **ON DELETE CASCADE**, and an index on `(user_id, created_at desc)`. The row
stores **no name**, so a rename can never break or stale a favorite and there is no string that could
be rendered after the exercise is gone. Unlike `user_food_favorites` — a denormalized snapshot, because
USDA foods have no local id — exercises have stable ids, so nothing else needs storing.

**RLS alone was insufficient, as in 4.2.1K.** The policy constrains `user_id` but not the *referenced*
row, so a user could have stored a favorite pointing at another user's custom exercise. Trigger
`enforce_fav_custom_owner` closes it, mirroring `enforce_pr_custom_owner`. Verified live: a real
cross-user insert attempt was **blocked**, alongside XOR-rejects-both-null, XOR-rejects-both-set and
duplicate-blocked — all five checks PASS with zero residue.

**Defect found in production validation and fixed (`fix_user_exercise_favorites_plain_uniques`).** The
first migration created **partial** unique indexes (`WHERE ... is not null`). Postgres only matches a
partial index to `ON CONFLICT` when the statement repeats the same WHERE predicate, which PostgREST's
`onConflict` does not emit — so **every favorite insert failed with 42P10** and silently rolled back.
This is precisely the trap recorded in CLAUDE.md §9. Replaced with **plain** uniques, which are also
semantically correct here and are the shape 4.2.1K used on `personal_records`: NULLs are distinct, so
the many custom favorites (`exercise_id` NULL) never collide while duplicates of the same exercise
still conflict. Re-verified live: duplicate canonical blocked, second canonical allowed, **multiple
custom favorites coexist**, duplicate custom blocked. The optimistic-rollback path behaved correctly
throughout the failure — no corrupt state, no phantom favorite.

**Recents: derived, bounded, deduped.** The user's **15 most recent completed workouts** → their
exercises → dedupe so the **newest occurrence wins** → cap at **8**. No recents table; recents are a
view of history, and history is never written to maintain them. Two bounded owner-scoped reads, batched
(`.in('workout_id', …)`), never N+1.

**Identity, never names.** Canonical favorites key by `exercises.id`, custom by `user_exercises.id`.
Legacy name-only history has **no** stable identity, so `identityKey()` returns null — it yields no
favorite control and never becomes a canonical recent. That is a property of the model, not a UI rule.
Inactive canonicals and archived/deleted customs are omitted from the shortcuts **while their
preference rows survive** (§34). Verified live: the detail sheet rendered **no control at all** for a
legacy reference, and a favorited custom stamped `user_exercise_id` with `exercise_id` NULL.

**Action isolation.** The favorite control is a **third distinct sibling button** in the picker row. It
stops the event, and no favorites path calls `selectExercise`, `applySwap`, `applyReviewResolution` or
`addTemplateExercise`. Verified live: tapping it added **0** exercises and left the picker open.

**One selection path across all four modes.** Shortcut rows are built by the same `pickerRowHtml`, so
selecting one runs the same mode-specific action. Verified live: from the Favorites section, an **add**
mode pick added the exercise with correct custom identity, and a **swap** mode pick *swapped* — count
stayed 1 and the `workout_exercises` row id was preserved.

**Information architecture.** Shortcuts render only while the query is empty; typing hands the list to
search results. Verified live (13 result rows, no shortcut sections; restored on clearing).

**Performance.** Train bootstrap issues **0** prefs requests and both caches start `null`. Shortcuts
load once on first picker open; a **reopen costs 0 requests**. Optimistic toggle with rollback, a
per-exercise in-flight lock, and a conflict-safe upsert.

**Mobile.** At 320 / 390 / 430 the picker sheet showed **no overflow anywhere** (0 offending elements),
favorite targets 44×54, rows 54px, both shortcut headings present. These are constrained-element
measurements: **`resize_window` still reports success while `innerWidth` stays 1440**, so no true
narrow-viewport or device validation was performed. No iPhone or Android validation.

**Deliberately not built:** frequency ranking, "most used", popularity, trending, cross-user aggregate,
AI ordering, exercise reordering. Favorites do **not** influence substitution or search ranking —
`exercise-substitution.js` and `exercise-filters.js` contain no reference to preference at all.

**Tests.** `exercise-prefs.test.js` (27) and `exercise-prefs-ui.test.js` (35, including a regression
pinning the `onConflict` column pairs the DB constraints must carry).

**Phase 4.3.5 remains OPEN — VALIDATION DEBT.**
