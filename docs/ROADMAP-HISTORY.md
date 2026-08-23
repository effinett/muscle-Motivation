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
