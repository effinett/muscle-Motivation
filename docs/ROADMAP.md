# MUSCLE MOTIVATION — CANONICAL PRODUCT ROADMAP

**Adopted:** 2026-08-14
**Authority:** This document is the **only** authoritative roadmap for Muscle Motivation.

It is the single source of truth for:

- phase numbering
- sequencing and execution order
- phase scope and exit criteria
- protected deferred commitments

It supersedes the roadmap **numbering and sequencing** in `CLAUDE.md` §11, `docs/ai-master-blueprint.md`,
`docs/exercise-intelligence-roadmap.md`, `docs/pwa-foundation.md`, and older Claude memory roadmap notes.
Those documents remain in the repository for **design rationale and implementation detail only**; where they
conflict with this file on numbering, sequencing, or scope, **this file wins**.

Closed phases are recorded in `docs/ROADMAP-HISTORY.md` (append-only).

---

# 0. PRODUCT NORTH STAR

Muscle Motivation is becoming a **paid personalized fitness coaching system**, not a workout tracker with a
nutrition logger attached.

The core product loop:

> **Understand the user → build the plan → show what matters today → help execute → record results →
> interpret progress → adapt → coach forward.**

The commercial critical path:

> **Stability → Training/content architecture → Personalization → Personal AI Coach →
> Monetization build & certification → Product education → Paid activation → AI actions →
> Product expansion**

Every major feature should do at least one of: help the user take a useful action, improve the system's
understanding of the user, improve the accuracy of future guidance, or reduce friction toward sustainable
results.

**North Star test:** *Does this make Muscle Motivation feel more like a real coach and less like an app?*

---

# 1. PRODUCT PRINCIPLES

## 1.1 Default experience

The product should feel premium, fast, mobile-first, minimal, focused, understandable without instruction,
and **interconnected** rather than a collection of separate tools.

Home primarily answers three questions:

1. What should I do today?
2. Where am I relative to my goals?
3. What should I pay attention to next?

## 1.2 Brand

| Token | Hex |
|---|---|
| Primary red | `#B1121B` |
| Primary dark | `#121011` |
| Secondary dark | `#231F20` |
| Light neutral | `#F7F5F2` |
| Muted neutral | `#B8B3B4` |
| White | `#FFFFFF` |

Typography: **Bebas Neue 400**; **Barlow 400 / 500 / 600**, Barlow Italic 400 where appropriate.

Tone: clear · confident · practical · supportive · action-oriented.

The full design system (surfaces, cards, buttons, layout, iconography, the no-emoji rule) remains
authoritative in `CLAUDE.md` §13. This roadmap does not restate it.

## 1.3 Theme architecture

Muscle Motivation red remains the default accent. Do **not** permanently hard-code functional UI to red.

Maintain centralized tokens that separate: brand colors · user accent · success · warning ·
destructive/error · neutral UI. Future user accent personalization (4.9.4) must remain possible.

---

# 2. ENGINEERING INVARIANTS

Standing requirements, not roadmap items. They apply to every phase.

## 2.1 Verification gate

`npm run verify` is the required pre-merge / pre-release gate. Do not bypass it because a change appears
visual, small, or documentation-adjacent.

## 2.2 Branch protection — required, ahead of 4.3.5

The `verify` check **must be required** for merges to `main`. This is repository hardening that precedes
4.3.5 implementation; it is deliberately **not** a paid-launch roadmap item.

**Current status (2026-08-14): CONFIGURED.** Branch protection is active on `main`, requiring a pull
request before merging, passing status checks with **`verify`** as a required check, and branches to be
up to date before merging. Configured manually in the GitHub UI by the repository owner; the branches
API reads back `protected: true` for `main`. Full record, including the limits of that verification, is
in `docs/ROADMAP-HISTORY.md` → "Completed repository actions".

## 2.3 Nutrition evaluation governance

The nutrition evaluation suite (`nutrition-evaluation/`) is a **measurement instrument, not a target**.

Preserve: versioned evaluation cases · baseline governance · direction-aware metric comparison ·
append-only history · no automatic baseline rewriting · **CI never runs `--update-baseline`**.

**Never tune behaviour merely to memorize benchmark cases** — but the operative word is *merely*. When an
evaluation exposes a real generalized defect, **fixing it is correct and expected**, subject to
root-cause analysis, new regression coverage, and a rerun of both the frozen set and an untouched blind
holdout. Reject changes that improve named cases while degrading holdout or aggregate behaviour. Always
report the real score.

Where a phase defines numeric thresholds (**4.5.17**), failing them blocks rather than informs. The
authoritative policy remains `nutrition-evaluation/README.md`.

## 2.4 Nutrition data integrity

Production nutrition values come from verified food databases. **LLMs never invent calories, macros,
serving weights, or micronutrients** — they supply search intent (query, quantity, unit, brand) only.
All entries are confirmed by the user before saving. Estimated values are labeled as estimates.

## 2.5 Privacy

Never cache or expose authenticated or per-user data through service-worker caches or other shared
surfaces. HTML navigations, `/api/*`, and Supabase auth/session state stay network-only. Only approved
immutable public static assets are cache-eligible.

## 2.6 Accessibility

Preserve the shipped accessibility foundations: `focus-visible` behavior, keyboard accessibility, the skip
link, reduced-motion support, and accessible non-gesture alternatives to every gesture. New interaction
primitives must maintain these contracts, not re-break them.

## 2.7 Shared architecture over page-specific hacks

When multiple defects arise from the same missing primitive, **build the primitive** rather than patching
each symptom independently. New shared intelligence goes into the existing shared cores
(`food-*.js`, `exercise-*.js`, `progression.js`, `snapshot.js`, `weight.js`, `app-nav.js`) and is consumed
by every surface. The full principle is `CLAUDE.md` §4 and remains binding.

## 2.8 Benchmark and regression coverage

Whenever shared intelligence changes, expand the benchmark corpora
(`benchmarks/resolve-cases.jsonl`, `benchmarks/exercise-cases.jsonl`) and the evaluation cases before the
work is considered complete.

---

# 3. COMPLETED FOUNDATION

Detailed closure records with SHAs live in `docs/ROADMAP-HISTORY.md`.

## PHASE 4.2 — CORE FEATURE RELIABILITY · **COMPLETE**

**4.2.1 — Exercise system** (4.2.1E–4.2.1L): exercise-intelligence foundation, picker integration,
catalog expansion to 141 canonical rows, custom-exercise lifecycle, discovery filters, logging reliability,
canonical/custom PR and logged identity, mobile filter UX.

**4.2.2–4.2.11 — Nutrition reliability track:** candidate reranking, confidence, correction memory, vague
portion intelligence, meal-level reasoning, food-core hardening, presentation polish, the nutrition
evaluation suite, confidence/ambiguity hardening, and continuous-evaluation CI.

> **Note:** several capabilities planned historically under *later* exercise phases were **not** completed.
> They are explicitly carried forward in this roadmap (4.3.6H/I/J and 5.1.6/5.1.7) and must not be treated
> as delivered.

## PHASE 4.3.1 — PWA INSTALL FOUNDATION · **COMPLETE**

## PHASE 4.3.2 — SERVICE WORKER & UPDATE SAFETY · **COMPLETE**

Preserve: safe update behavior · versioned caches · privacy boundaries · waiting-worker lifecycle ·
user-controlled activation (never automatic).

## PHASE 4.3.3 — INSTALL ONBOARDING & UPDATE UX · **CLOSED**

Includes real-device production validation (desktop and installed iPhone update behavior).

## PHASE 4.3.4 — DASHBOARD 2.0 & APP NAVIGATION · **CLOSED**

Delivered: premium mobile-first Home · Today's Plan · weekly training progress · Calories + Protein
nutrition snapshot · Coach Insight · progress snapshot · Home / Train / Nutrition / Progress bottom
navigation · theme-token foundation · modular dashboard architecture.

**Default Home nutrition remains Calories + Protein.** Carbs and Fat are optional customization in 4.9.3.

The `app-nav.js` route registry reserves a **Coach** destination (`available: false`) that renders nothing
until 4.4 ships. The nav carries `data-mm-sw-bottom-control`, and `--mm-nav-base-height` /
`--mm-bottom-clearance` are the one bottom-clearance strategy. These are **integration contracts** —
later phases must not break them.

---

# 4. COMMERCIAL-LAUNCH CRITICAL PATH

**The macro-order below is locked and must not be changed without Effi's explicit approval:**

> **4.4 → 4.5-I → 4.3.8 → 4.5-A**

**Phase numbers are stable identities; execution order lives in §13.** A number is never reused or
reassigned, so cross-references stay valid when the order changes. Read a number as a name, not a
position.

**Parallel pre-launch tracks, gated and never optional:** **4.3.9-L** Recommendation Catalog Coverage
(§4.3.9) · **validation-debt closure** VD-A through VD-F (§10.13).

**Reordered 2026-09-02 (owner-approved).** 4.3.8 moved from first to last-before-activation because 4.4
and 4.5-I both change what it must teach — 4.4 the navigation and Home surfaces, 4.5-I the entitlement,
trial, routing and analytics model. **No product construction follows 4.3.8**; 4.5-A executes and
observes an already-built system. Full rationale: `docs/ROADMAP-HISTORY.md`, 2026-09-02.

### Binding gates

| Gate | Condition | Must precede |
|---|---|---|
| **G1** | 4.3.9-L catalog metadata and launch content final | 4.4 Coach recommendation/explanation validation |
| **G2** | 4.3.9-L complete, including 4.3.9F "See other options" | 4.3.8 copy and walkthrough lock |
| **G3** | 4.3.9-L complete | 4.5-A activation |
| **G4** | 4.5-I complete, every activation flag proven OFF→ON in a safe non-public environment | 4.3.8 begins |
| **G5** | 4.5.17 Food Intelligence certification passed against its locked thresholds | 4.5-A activation |
| **G6** | Every validation-debt item (§10.13) carries its required explicit disposition | 4.5-A activation |

Because G1 gates Coach validation, **4.3.9-L is an early-4.4 dependency, not an independent track with
slack to the end of the path.** It may start immediately and must not drift.

**Sequencing exceptions in force.**

- *(2026-08-20)* 4.3.5 and 4.3.6 may overlap — 4.3.6 began while 4.3.5 stayed open on its 4.3.5F Android
  measurement. That exception covered 4.3.6 only.
- *(2026-09-02)* **4.3.5 remains OPEN, and its unresolved validation debt may run in parallel with 4.4,
  4.3.9-L, 4.5-I and 4.3.8.** This neither closes nor weakens 4.3.5: every requirement stands, and every
  activation-relevant item receives its §10.13 disposition before 4.5-A. **This is a specific
  validation-debt exception, not general permission to overlap unrelated phases.**
- *(2026-09-02)* 4.3.9-L may overlap 4.4 and 4.5-I, bound by G1–G3.

No other pair of phases may overlap without separate approval, and no exception waives a requirement.

---

## PHASE 4.3.5 — MOBILE UX & APP-SHELL HARDENING · **OPEN — VALIDATION DEBT**

**Goal:** make the existing app stable, fast, predictable, accessible, and premium before building major
new systems on top of it.

**Internal dependency (do not reorder):** A → B → **C (shared primitive)** → D → E. Build the primitive
*before* fixing the picker symptoms; do not patch symptoms first and extract the primitive afterward.

### Status — 2026-08-20 · OPEN, NOT CLOSED

Implementation is merged, deployed, and accepted; real-device UX validation is done on iPhone Safari and
the installed iPhone PWA, with qualitative Android Chrome and Android installed-PWA observation. **The
phase is still open.** One requirement remains outstanding:

> **4.3.5F — instrumented Android navigation-performance measurement.**

This is an **external hardware-access dependency**, not unfinished implementation work: the owner has no
access to a physical Android device at present. When a suitable device is available, 4.3.5 resumes at
**Android USB / `chrome://inspect` instrumented navigation-performance measurement**, and the results are
judged against the exact then-current 4.3.5F targets below.

**Owner-approved sequencing exception (2026-08-20):** **Phase 4.3.6 implementation may begin** while this
external dependency is unresolved. 4.3.5 remains open in parallel. Recorded in
`docs/ROADMAP-HISTORY.md` → "Roadmap decisions".

**This exception does NOT mean any of the following. Do not infer them:**

- ❌ 4.3.5 is complete, or complete because 4.3.6 started. It is **open**.
- ❌ 4.3.5F passed, was waived, or became optional. It is **binding and outstanding**.
- ❌ The performance targets were weakened. They are **unchanged**.
- ❌ Qualitative Android UX observation counts as the instrumented p75 measurement. It does **not**.
- ❌ 4.3.5 can never close because later phases started. It closes normally once 4.3.5F is measured and
  §12.5 is satisfied.

**Measurement-integrity condition (binding).** 4.3.6 must not silently modify or invalidate the deferred
4.3.5F measurement contract. If 4.3.6 (or any later work) materially changes the app-shell or navigation
performance surface before 4.3.5F is measured, the eventual measurement is interpreted against the
**actual production state at measurement time**, and that circumstance must be recorded explicitly in
`docs/ROADMAP-HISTORY.md`. **Never record a claim that the original 4.3.5 build was measured when later
code is what was actually measured.**

### 4.3.5A — Dashboard micro-polish
- Slightly enlarge the top-left Muscle Motivation logo; preserve header balance.
- Nutrition **always** renders Calories + Protein progress tracks.
- With nothing logged, show zero-state numbers and **empty bars** — do not replace the module with only
  "Nothing logged yet."
- Preserve the minimal Home hierarchy.

### 4.3.5B — Exercise search / input reliability
Fix caret misalignment, typing-cursor placement, search-field layout, keyboard-induced movement, focus
instability, and viewport/input shifting.

### 4.3.5C — Shared mobile bottom-sheet primitive
One reusable primitive supporting: viewport-safe fixed placement · device safe areas · drag handle with
**real gesture handling** · swipe-down · dismiss · optional intermediate collapse · body/background scroll
lock · inner-content scroll management · keyboard avoidance · accessible non-gesture close · reduced-motion
behavior.

**Audit the existing overlay consumers and migrate the appropriate ones** rather than shipping one unused
new primitive. Today a single generic `.overlay` class backs multiple workout modals (exercise picker,
finish, discard, custom-exercise edit and confirm, live PR) plus modals on other surfaces; no scroll lock
exists anywhere, and the current drag handle is decorative CSS with no gesture handlers.

Preserve the bottom-control contracts the PWA update banner and install sheet rely on
(`data-mm-sw-bottom-control`, `--mm-bottom-clearance`).

Future consumers: Coach sheet (4.4.9), food selectors, filters, contextual controls.

### 4.3.5D — Exercise picker scroll isolation
After the shared sheet exists: the underlying workout does not scroll with the picker · background
interaction is blocked appropriately · the picker list scrolls independently · no linked scrolling · no
viewport drift.

### 4.3.5E — Exercise selection-state hardening
Fix random red exercise highlighting, highlights changing during scroll, selected/focused/pressed state
confusion, and recycled-row state leakage.

### 4.3.5F — Core navigation performance

#### The requirement

Switching between **Home · Train · Nutrition · Progress** from the bottom navigation should feel as
close to instant as reasonably possible, with little or no noticeable loading delay.

Concretely:

- Tapping a destination **responds immediately** — the tap is visibly acknowledged and the active
  state moves before anything loads.
- **No blank screens and no full-page white flashes** during the transition.
- Noticeable loading delay is minimized.
- **Already-loaded or recently visited destinations feel especially fast** where practical.
- Unnecessary duplicate loading and initialization is reduced.
- **Authenticated user data stays correct and fresh.** Never fake speed with stale or wrong user data
  — a fast wrong number is worse than a slow right one.

#### Scope boundary (binding)

**Optimize the current multi-page architecture first.** This phase does **not** authorize, and the
performance target must never be used to justify:

- SPA conversion
- a full navigation-architecture rewrite
- a major route-system replacement
- rebuilding the app shell

A major architecture conversion requires **separate explicit approval** as its own phase. If the
baseline below shows a target is unreachable inside the current architecture, **renegotiate the target
— do not escalate the architecture.**

Permitted techniques: route prefetching · resource preloading and `preconnect` · warmed shared and
authenticated bootstrap · reducing redundant requests · safe caching within the §2.5 privacy rules ·
improved loading and skeleton states · practical view/state preservation.

#### Measured starting point (static audit, 2026-08-14)

Recorded so improvement can be proven rather than asserted. Byte counts are unminified source as
served; no minification or bundling step exists.

| Loaded on every destination | Size |
|---|---|
| Shared same-origin JS — `sw-register`, `pwa-install` ×3, `app-nav`, `supabase` | **133 KB** |
| `app-shell.css` | **35 KB** |
| Cross-origin CDN scripts — `lucide` (unpkg) + `supabase-js` UMD (jsdelivr) | 2 extra origins, **no `preconnect`** |

| Destination | HTML | Destination-only JS | Approx. total per cold tap |
|---|---|---|---|
| Home (`app.html`) | 47 KB | 74 KB | ~289 KB |
| Train (`workout.html`) | 153 KB | 142 KB | ~463 KB |
| **Nutrition (`nutrition.html`)** | 73 KB | **393 KB** | **~634 KB** |
| Progress (`weight-history.html`) | 27 KB | 31 KB | ~226 KB |

Two facts that shape the work:

1. **The service worker cannot help today.** Its `STATIC_ALLOWLIST` is frozen to five icon paths;
   no HTML, CSS, or JS is cache-eligible. Any change here is a deliberate policy decision that must
   respect §2.5 — and the two CDN scripts are **cross-origin**, so they can never enter a
   same-origin-only allowlist without a separate approved policy change.
2. **The only resource hints that exist are two font `preconnect`s.** There is no prefetch of
   destination routes and no `preconnect` to the script CDNs or Supabase.

#### Targets

Measure on a **representative mid-tier Android device on a normal mobile connection**, p75 across
repeated Home ↔ Train ↔ Nutrition ↔ Progress switches. Record the before-numbers first; these targets
are **provisional until the baseline confirms them.**

| Metric | Target |
|---|---|
| **Tap acknowledged** (visible active-state / press feedback) | **≤ 100 ms** — hard requirement; purely a UI concern and achievable regardless of load |
| **Warm repeat navigation** → destination's primary content painted (same session, warm HTTP cache) | **≤ 600 ms** |
| **First navigation** to a destination in a session | **≤ 1200 ms** |
| **Full-page white flashes** | **zero** |
| **Duplicate shared-bootstrap fetch/init within a session** | **zero** |

The two latency numbers are engineering targets chosen against the payload audit above, **not
contractual thresholds**. If the recorded baseline shows either is unreachable without an architecture
change, revise the number and record why in `docs/ROADMAP-HISTORY.md` — the scope boundary holds
regardless. Nutrition is the worst case and is the destination the target should be judged on.

**Evidence requirement:** capture before-and-after measurements for all four destinations. The phase
does not close on "it feels faster."

#### Status — OUTSTANDING (2026-08-20)

The instrumented Android measurement **has not been performed** — the owner has no physical Android
device at present. The requirement, the measurement method (Android USB / `chrome://inspect`), and every
target value above are **unchanged and still binding**; only the *timing* is deferred, by the
owner-approved sequencing exception recorded in the 4.3.5 status block and in
`docs/ROADMAP-HISTORY.md`. Qualitative Android UX observation is **not** a substitute for the p75
measurement. Also tracked in §10.8.

### 4.3.5G — Dirty-state / unsaved-work protection
Carries forward the deferred 4.3.2 requirement. Establish a shared understanding of whether the user has
meaningful unsaved work — workout in progress, uncommitted edits, form state, sheet/modal state where loss
would be harmful. Navigation and update behavior must not unexpectedly destroy it.

### 4.3.5H — Authenticated routing hardening
When authenticated: Home resolves to the authenticated dashboard · internal navigation never lands on the
public landing page unintentionally · internal navigation never signs the user out · direct protected
routes enforce correct auth state.

Audit: Home · My Dashboard · membership · store · program pages · free-calculator links · profile · logout ·
return flows.

Also **confirm the canonical production hostname** (apex vs `www`) and align the service-worker
registration guard with it. The guard currently allows the apex only and fails closed, so an unconfirmed
`www` canonical host would silently prevent registration in production.

### 4.3.5I — Mobile header / hamburger reliability
Menu usable at any scroll position · no jump on open · drawer stays viewport-relative · no requirement to
return to the top of the page · correct layering · correct focus management · stable sticky header.

### 4.3.5J — Client / API error monitoring
Practical error visibility for client runtime errors, API failures, auth failures, and critical PWA
failures — without violating §2.5 privacy or the cache constraints.

### 4.3.5K — Real-device & accessibility regression pass
Validate: installed iPhone PWA · iPhone Safari · Android Chrome · Android installed PWA (closes the
validation deferred since 4.3.1) · keyboard · sheets/modals · scroll locking · routing · navigation · safe
areas · reduced motion · keyboard navigation and focus · the shipped shell contracts.

> **EXIT CRITERION:** the product shell is trustworthy enough to build the commercial product on top of it.

---

## PHASE 4.3.6 — PROGRAMS, ROUTINES & TRAIN ARCHITECTURE · **CLOSED**

**Goal:** make Programs first-class, create one coherent reusable training-content architecture, and
complete the Train surface capabilities that earlier exercise phases left unbuilt.

**Closed 2026-08-27.** Delivered: canonical Routine entity (`workout_templates`) · Program → Routine
convergence with **0 runtime reads of `program_workouts`** · entitlement-scoped RLS as defence in depth ·
Train Today / Workouts / Programs · history → private draft Routines · Routine authoring and publishing ·
exercise detail surface · deterministic substitution engine · exercise favorites and recents. All
production-validated (records: `docs/ROADMAP-HISTORY.md`).

**4.3.6A–L all pass.** **4.3.6K remains protected planned content by design** — Home Strength Program and
Full Gym Strength Program are retained concepts, not build items for this phase, so they never blocked
the exit criterion and stay protected under §11.

**Added to 4.3.6K on 2026-08-28, after closure:** **4.3.6K.1 Recommendation catalog coverage**
(bodyweight / no-equipment · women's full body + glutes · optional women's bodyweight · Glute Builder
repositioned as the specialization) and **4.3.6K.2 ranked shortlist recommendation UI**. Both were found
during real use of the 4.3.7 anonymous onboarding flow. Recording protected content against a closed
phase's protected scope does **not** reopen 4.3.6 — no exit criterion changed, and neither item is
scheduled here.

**Closing 4.3.6 changes nothing about 4.3.5**, which remains **OPEN — VALIDATION DEBT** on the 4.3.5F
instrumented Android navigation measurement. The two are independent.

### Owner decisions — locked 2026-08-21

Approved by Effi following the pre-implementation reconciliation audit. These constrain 4.3.6A–L; they do
not reorder or renumber any phase.

- **O1 — Membership grants Programs.** An active membership grants access to Programs designated
  membership-included. **Existing standalone purchases remain valid and are never devalued** — a user who
  bought a Program keeps it whether or not a membership exists, lapses, or is cancelled. A Program declares
  its own access model; access is not hard-coded globally.
- **O2 — Browse at any ownership level.** Programs are browsable owning zero, one, or many. Browse exposes
  **catalog metadata only** — never protected session prescriptions. `program_workouts` RLS therefore
  cannot remain the only source of Program metadata; a canonical Program catalog entity is approved.
- **O3 — Narrowest author mechanism.** Only enough representation to distinguish a private user Routine
  from a platform-authored/published Routine. **No broad roles/grants system** — that stays in the later
  Trainer/Admin phase. Widening `workout_templates` RLS beyond `auth.uid() = user_id` is
  security-sensitive and **stops for review**.
- **O4 — Snapshot-only history conversion.** No guessing or mass-backfilling of legacy name-only
  identities; no auto-replacing user customs. History is never mutated. Legacy/custom-dependent workouts
  may become **private drafts only**, never automatically publishable. Dedup considers exercise/set
  composition, not title.
- **O5 — Programs stays inside Train.** Bottom navigation remains **Home · Train · Nutrition · Progress**;
  no fifth tab in 4.3.6. Train exposes Today · Workouts · Programs. **This preserves the 4.3.5F
  four-destination measurement basis.**

**R2 — access model for the three live Programs (locked 2026-08-21).** `fat_loss_blueprint`,
`muscle_gain`, and `glute_builder` are each **`included_with_membership = true` AND
`standalone_purchasable = true`**. An active membership grants all three. Standalone purchases are
**independent entitlements**: a purchaser keeps that Program with no membership, or after a membership
expires or is cancelled. **This applies to these three Programs only** — future Programs may independently
be membership-included, standalone-purchasable, both, or neither/draft.

**Canonical direction approved:** evolve `workout_templates` into the canonical Routine (no third
workout-definition system); converge `program_workouts` toward Routine content + a Program→Routine
relationship **non-destructively**; keep `purchases` the authoritative commerce store with the Stripe
webhook as its only writer, and build **one** shared entitlement resolver over it. **No `subscriptions`
table. No grants table.**

**Database enforcement (CP2-RLS, 2026-08-23).** The `program_workouts` read policy now mirrors
`entitlement-core.js`: standalone ownership (`product = slug`) **OR** membership (`ai_membership` + the
catalog row being `included_with_membership` **and** `published`), with `active` and `past_due`
qualifying in both. Standalone ownership stays independent of publication and sellability. This is
**defence in depth beneath** the client resolver, not a replacement for it — and it is the boundary that
must stay in step with the resolver: **changing one without the other reintroduces the CP2b block.**
Rollback SQL and the full test matrix are in `docs/ROADMAP-HISTORY.md`.

**Unresolved — blocking the CP1a catalog backfill.** Three Program metadata conflicts exist in production
today and must be decided by Effi before any catalog row is written. They must **not** be silently
resolved by an implementer:

1. **Fat Loss duration** — named "90 Day Fat Loss Blueprint" but described as a "12-week system" in both
   `PROGRAM_META` and `store.html`.
2. **Glute Builder goal** — `store.html` badges it "Muscle Building", `PROGRAM_META` describes it as a
   "Women's lower-body program", and `GOAL_PROGRAM_MAP` has no entry for it at all.
3. **Muscle Gain canonical display name** — `PROGRAM_META.name` is "Muscle Gain"; the `store.html` card
   title may differ and must be confirmed rather than assumed.

### 4.3.6A — Permanent Programs destination
Programs remain discoverable regardless of ownership. Train conceptually exposes **Today · Workouts ·
Programs** (final visual treatment may differ).

### 4.3.6B — My Programs
Active program · owned programs · Continue Program · current position · progress · completed programs.
Profile may expose purchases, but must not be the primary Programs destination.

### 4.3.6C — Browse Programs
Available whether the user owns none, one, or many.

### 4.3.6D — Routine model reconciliation
**Do not create another training-content table before reconciling what exists.** Explicitly inspect
`workout_templates`, `program_workouts`, `user_programs`, and the workout-history structures, then decide
whether an existing model evolves into the canonical Routine entity or a new entity is created with a
deliberate migration/convergence plan.

There must be **one conceptual source of truth**, never parallel competing representations.

Routine capabilities may include: title · description · exercises · order · sets · reps · load guidance ·
rest · tempo where relevant · notes · goal · difficulty · duration estimate · tags · visibility · premium
state · author/source · version/status.

### 4.3.6E — Historical workout → draft routine migration
Owner historical workouts become candidate **draft premium routines**. Never auto-publish tests,
incomplete workouts, duplicates, malformed entries, or client-specific sessions.

### 4.3.6F — Routine authoring / publishing
**Draft → Edit → Preview → Publish → Unpublish.**

### 4.3.6G — Program composition
**Exercise → Routine → Program.** Support weeks, scheduling, ordering, progression, difficulty, goals.

### 4.3.6H — Exercise detail surface *(moved forward from the old Smart Training phase)*
Read-only surface exposing catalog metadata **that already exists and is currently unused** on all 141
canonical rows: primary/secondary muscles · movement pattern · equipment · instructions · coaching cues and
tips · common mistakes where represented. Degrades gracefully for user customs, which carry no taxonomy.

**Exercise media is deliberately NOT included here** — photos, video, and muscle diagrams need separate
storage and content work and remain at 5.1.6.

### 4.3.6I — Deterministic exercise substitution engine *(moved forward)*
A deterministic, reusable "Swap" engine built from existing exercise metadata: movement pattern · primary
muscle · equipment · supported constraints. Pure and testable, in the shared exercise layer.

**This must exist before Coach can swap exercises.** Phase 4.7.5 calls this engine; Coach never invents
exercise substitutions.

### 4.3.6J — Exercise favorites & recent exercises
Per-user favorites and recently used exercises, integrated into picker/search with sensible tie-breaking.
Built here rather than reopening the picker in a later phase.

### 4.3.6K — Planned strength programs
Retain the planned content concepts: **Home Strength Program** and **Full Gym Strength Program**. Names and
content may evolve; the concepts are protected.

#### 4.3.6K.1 — Recommendation catalog coverage *(protected planned content — recorded 2026-08-28)*

Found during real use of the Phase 4.3.7 anonymous onboarding flow. The recommendation engine is behaving
correctly; the **catalog cannot express the answer**. These are content commitments, not engine work, and
they are **protected** under §11.

Planned Programs:

- **Bodyweight / No-Equipment Program.** A user who answers `gym_access = bodyweight` has no true
  bodyweight Program to receive.
- **Women's Full Body + Glutes Program.** Balanced full-body training with glute emphasis — the option a
  woman seeking that outcome should receive.
- **Women's Bodyweight / No-Equipment Program** — included **only if** we retain the strategy of three
  distinct women-focused purchasable options. Otherwise it folds into the general bodyweight Program.
- **Glute Builder (existing)** is repositioned as the **specialization** option rather than the default a
  broad request lands on.

**Diagnosis, recorded so this is not misread as an engine defect.** The engine never sees gender:
`personalization-core.js` reads `profiles.gender` only for the 4.3.7F personal-context layer and the
calorie math, and it takes **no part in ranking** (verified 2026-08-28 — a male and a female profile with
otherwise identical answers receive the identical recommendation). Two real catalog gaps produce the
observed behaviour:

1. Every published Program is `equipment_summary = 'Any Setup'`, so equipment discriminates nothing and a
   bodyweight-only user is ranked exactly as a full-gym user is.
2. Glute Builder is the only Program whose `difficulty` is `All Levels`, so it wins the experience
   tie-break for **any** advanced muscle-goal user — regardless of gender.

Both resolve through **content plus catalog metadata**, never through code that branches on gender.

> **BINDING CONSTRAINT.** Ranking must remain driven by actual onboarding inputs and canonical Program
> metadata. **Do not hard-code gender → Program mappings**, and do not add a gender signal to the ranking
> tiers. If a Program suits a population, that must be expressed as catalog metadata the engine already
> reads — not as a branch in the engine.

#### 4.3.6K.2 — Ranked shortlist recommendation UI *(future requirement — recorded 2026-08-28)*

Personalization should eventually present **one primary "Recommended for You" choice** plus a **"See other
options"** action revealing the ranked remainder — rather than presenting every Program as an equal choice.
The engine already returns exactly this shape (`training.recommendedProgram` plus a ranked
`training.alternatives`), so this is a presentation requirement, not new intelligence.

Same binding constraint: the ordering shown must be the engine's own ranking over real inputs and catalog
metadata. A shortlist must never be curated by hand, by gender, or by commercial preference.

**Not scheduled here.** 4.3.6 is closed; this is recorded against its protected content scope so it cannot
be lost. Sequencing belongs to whichever phase takes the Program-content work.

### 4.3.6L — Unified entitlement & access model
Define **one** access model here, capable of representing membership · standalone program ownership where
retained · premium coaching · administrative access.

Reconcile with the **actual** current storage before any schema change: subscription and purchase state
lives on `purchases` today (Stripe subscription id, status, period end); there is no separate
`subscriptions` table despite older target-schema notes. Phase 4.5.1 extends this model with billing
states — it does not invent a second one.

> **EXIT CRITERION:** training content is reusable, discoverable, sellable, and governed by one coherent
> entitlement architecture.

---

## PHASE 4.3.7 — PERSONALIZED ONBOARDING & VALUE ENGINE · **CLOSED**

**Goal:** understand the user and deliver meaningful personalized value *before* asking for money.

**Closed 2026-08-31.** Delivered: onboarding before account creation with a temporary anonymous draft ·
a strictly ordered, fail-stop claim into the canonical profile · auth/redirect hardening with the PWA
`start_url` chain re-proven loop-free · a deterministic personalization engine with no model call ·
the pre-signup value reveal · the 4.3.7F personal-context read model · funnel instrumentation. All
production-validated (records: `docs/ROADMAP-HISTORY.md`).

**4.3.7A–G all pass**, with **4.3.7A carrying an owner-ratified deferral** of three enumerated inputs
that have no consumer (see 4.3.7A below). That deferral is recorded explicitly rather than inferred, and
does not affect the exit criterion, which speaks of *relevant* questions and a *coherent* plan.

> **EXIT CRITERION MET:** a new person can enter Muscle Motivation, answer relevant questions, create an
> account, and receive a coherent personalized starting plan.

**Closing 4.3.7 changes nothing about 4.3.5**, which remains **OPEN — VALIDATION DEBT** on the 4.3.5F
instrumented Android navigation measurement. The two are independent.

**Two validation-debt items are carried forward past closure** (§10.11). Neither is unbuilt scope; both
are environment-dependent checks that could not be performed here, and both are recorded rather than
waived.

Onboarding now runs **before** account creation (`fd40506` → `2730808`, PRs #44–#47). An anonymous
visitor completes the wizard, sees the full deterministic value reveal, and creates an account to save
it; the answers are folded into the profile the signup trigger already created, by a strictly ordered,
fail-stop claim. Existing users are protected by two independent gates and were proven untouched against
a hostile draft on a real production account. No service-worker or manifest change was required, and the
`start_url` chain was re-proven loop-free for all twelve states. Full record: `docs/ROADMAP-HISTORY.md`.

Delivered: `personalization-core.js` — one pure, deterministic, DOM-free and network-free engine that
derives a starting plan from the profile onboarding already collects, with stable reason codes and no
model call anywhere. It computes **no nutrition math**: calorie and protein targets are read from the
values `profiles` already stores, so this phase changed no target for any user. Program recommendation
ranks the canonical 4.3.6 catalog by a strictly lexicographic hierarchy (goal → training-day fit →
experience → equipment → sort_order → slug), never consults entitlement, and never enrols anyone.
Surfaced on the onboarding value reveal, Home's Today card (no-program states only) and the Train Today
pane. `buildPersonalContext` delivers 4.3.7F as a **derived read model over `profiles`**, not a second
store — no personalization table exists, so goal, targets and training days keep one source of truth and
a recommendation can never go stale.

**Owner decision (2026-08-27) — recomp policy.** No Program declares `goal = 'recomp'`, but half the
onboarded users choose it. Recomp resolves deterministically to **muscle first, fat loss second**, and
emits `goal_partial_match` — never `goal_match` — so no surface claims an exactness the mapping lacks.

**Carried past closure — validation debt, tracked in §10.11:**

- **iOS standalone-PWA OAuth — UNVERIFIED.** On iOS a standalone PWA can hand OAuth to a separate
  browser context and return to a different `sessionStorage` area, which would lose the anonymous
  draft. Degrades to **re-answering, never data loss**, and a PWA user already holds an account so does
  not enter the anonymous funnel. One physical-iPhone check closes it.
- **Real responsive media-query validation at 320 / 390 / 430** — UNVERIFIED. Wrapping, overflow and
  tap-target geometry were measured by constraining containers; the **media queries themselves were
  never exercised**, because the viewport tool is pinned at 1440px.

**Analytics precision debt (not a closure blocker):** Google signup attribution in 4.3.7G is
by-elimination and can over-attribute in one rare case. See §10.11.

**Closing nothing about 4.3.5**, which remains **OPEN — VALIDATION DEBT** on 4.3.5F.

### 4.3.7A — Tell us about you
Collect only what has a product use: height · weight · optional body-fat % · goal · activity level ·
training days · experience · training preferences · lifestyle constraints · nutrition preferences ·
intended rate of progress · gym access.

**DEFERRED — 2026-08-30 — owner-ratified.** Three of the enumerated inputs are **not** collected and
**do not block 4.3.7 closure**: *training preferences*, *lifestyle constraints* and *nutrition
preferences*.

- **Built:** height · weight · optional body-fat % · goal · activity level · training days ·
  **experience** · **gym access**.
- **Already satisfied:** *intended rate of progress* is `profiles.timeline`
  (`aggressive|steady|relaxed`), collected since before this phase and consumed by the calorie math.
- **Deferred:** the remaining three have **no current consumer**. Collecting them would violate this
  section's own governing clause — *"Collect only what has a product use"* — and would lengthen the
  funnel at precisely the moment 4.3.7B exists to shorten it. They are **not cancelled**: when a
  consumer exists (**4.4 Coach** is the first), the minimum model is one nullable `jsonb` column
  shaped by that consumer, surfaced through the **4.3.7F** context layer — not three speculative
  typed columns.

This deferral is recorded explicitly rather than inferred from silence, so a later reader cannot
mistake PARTIAL for COMPLETE. The exit criterion below speaks of *relevant* questions and a *coherent*
plan; both are delivered.

### 4.3.7B — Onboarding before account creation
Preferred flow: **Tell us about you → Create account.**

Requirements: temporary onboarding state must survive account creation, and the anonymous/pre-auth →
authenticated **state merge must be designed explicitly**, not improvised.

### 4.3.7C — Authentication / redirect hardening
Preserve and re-prove: explicit **Sign Out / Use Another Account** · incomplete-onboarding users route to
onboarding · completed users never repeat onboarding · logged-out users cannot reach protected routes ·
Google and email-password identities behave consistently · no stale auth/onboarding traps.

**Re-prove the PWA `start_url` redirect chain** terminates for every auth state under the new flow. The
manifest's `start_url = /app.html` chain was proven loop-free under the previous auth-first ordering;
reversing the flow invalidates that proof.

### 4.3.7D — Personal recommendation engine
Generate starting recommendations for calories · protein · macros where relevant · training frequency ·
weekly target · training structure · initial program/routine · basic activity targets.

### 4.3.7E — Personalized value reveal
Before payment, clearly show **"Here is what Muscle Motivation built for you"** — calorie goal, protein
goal, training days, recommended program, weekly structure, primary objective. Personal, not generic
advertising.

### 4.3.7F — Personal context layer
A normalized store of explicit, current user facts and plan state, consumed later by Coach. This is the
foundation for — but not identical to — the Personal Knowledge Graph (5.5.9).

### 4.3.7G — Funnel event instrumentation
Emit funnel events **while building the funnel**: onboarding started · step completion · onboarding
complete · account creation · value reveal viewed. Do not defer instrumentation to 4.5.

**DELIVERED — 2026-08-30** (`342ae70`, `9ae1144`; PRs #49–#50). `analytics-core.js` plus
`public.funnel_events`. Eight events: the five named above, plus `landing_cta_clicked` (a **4.5.8
dependency** — that phase reports over "events already instrumented in 4.3.7G / 4.3.8H" and names
*landing*, which 4.3.8H does not provide), `save_plan_clicked`, and `onboarding_claim_failed` with a
reason code per fail-stop in the claim.

**A table rather than logs, on evidence.** `api/client-error.js` (4.3.5J) needs no storage, but Vercel
runtime logs are a ~24-hour window **scoped per deployment** and every push resets the view — verified
by querying the live production deployment. A funnel is an aggregate over days and across deployments.

**No user id and no profile data, by construction** — the funnel measures counts, not people. Security
follows `public.leads`: INSERT only to `anon`/`authenticated`, **no SELECT/UPDATE/DELETE policy**, so
the table is write-only from any browser. The `detail` allowlist is **per event and enforced twice** —
client for correctness, `WITH CHECK` as the boundary.

**Already-onboarded users are excluded from the funnel entirely**: both onboarding exit paths emit
nothing and clear the funnel id, so a returning customer cannot inflate acquisition metrics.

**Known imprecision, recorded not hidden:** Google signup is attributed by elimination, because
`signInWithOAuth` navigates away before `auth.html` can observe completion. It over-attributes to
`google` when an existing incomplete account signs in with a draft present; it cannot under-count and
never mislabels email. Precision would require changing `redirectTo` and the Supabase allow-list.

**Not exactly-once.** Dedupe is per funnel id in `sessionStorage`; multiple tabs are separate funnels;
there are no retries, so a dropped event undercounts.

Retention intent **180 days**, no purge machinery (owner decision 2026-08-28).

> **EXIT CRITERION:** a new person can enter Muscle Motivation, answer relevant questions, create an
> account, and receive a coherent personalized starting plan.

---

## PHASE 4.3.8 — INTERACTIVE FIRST-RUN EXPERIENCE

**Goal:** teach users the real product before the hard paid launch. Use the actual application wherever
possible, not a slideshow.

- **4.3.8A — Welcome.** Brief premium introduction.
- **4.3.8B — Home walkthrough.** Today's Plan · weekly progress · nutrition · Coach Insight · Progress.
- **4.3.8C — Train walkthrough.** Today's workout · workouts · Programs · Continue Program.
- **4.3.8D — Nutrition walkthrough.** Food logging · calorie/protein targets · Quick Log.
- **4.3.8E — Progress walkthrough.** Weight · trends · history.
- **4.3.8F — Tour controls.** Skip · Next · Back · persistent completion · replay from Help/settings.
  Never force the tour on returning users.
- **4.3.8G — Contextual education framework.** Introduce advanced features when encountered rather than
  overloading first run.
- **4.3.8H — Funnel instrumentation.** Tour started · skipped · completed · major step viewed.

**Input-surface constraint (binding).** First-run teaches **Quick Log** as the food-logging path and may
say the user can type a meal description. It must **not** anchor to, depend on, or promise
device-controlled interface — the OS keyboard microphone above all — whose availability the device
decides, not us. It need not enumerate every input method.

> **EXIT CRITERION:** a first-time user understands the core product without external help.

---

## PHASE 4.3.9 — PROGRAM CATALOG WORK

One phase identity, two ordered stages. Schedules the protected 4.3.6K.1 and 4.3.6K.2 content.

### 4.3.9-L — Recommendation Catalog Coverage

**Classification: launch-blocking, parallel content track.** Gated by G1, G2, and G3 (§4).

**Why launch-blocking.** Onboarding asks for `gym_access` and `training_experience`, and the engine cannot
act on either: every published Program is `equipment_summary = 'Any Setup'`, and Glute Builder is the only
`All Levels` Program, so it wins the experience tie-break for any advanced muscle-goal user. Asking a
question and ignoring the answer is not acceptable in a paid personalization product.

- **4.3.9A — Catalog metadata correction.** Correct inaccurate `equipment_summary` and `difficulty` on the
  existing Programs. **Behaviour-changing, not bookkeeping** — it changes what real users are recommended.
- **4.3.9B — Bodyweight / No-Equipment Program.**
- **4.3.9C — Women's Full Body + Glutes Program.**
- **4.3.9D — Women's Bodyweight / No-Equipment Program.**
- **4.3.9E — Glute Builder repositioning.** Preserve it as the glute-**specialization**, not the broad
  default it currently becomes by metadata accident.
- **4.3.9F — Ranked shortlist / "See other options".** One primary recommendation plus alternatives.
  Presentation over `personalization-core.js`, which already returns `training.recommendedProgram` plus a
  ranked `training.alternatives`. **Do not create a second ranking engine.**

**Binding constraints.**

- **Ranking stays driven by real onboarding inputs and canonical Program metadata.** Never hard-code
  gender → Program mappings; never add a gender-specific ranking branch to force a Program to appear. A
  Program that suits a population expresses that through catalog metadata the engine already reads.
- **Production safety.** Never deploy metadata corrections in isolation if that would leave a
  bodyweight-only user — or any valid onboarding combination — with no appropriate result. Corrections
  ship with either catalog coverage or a proven, truthful "no suitable Program yet" behaviour. **Never
  silently fall back to an incompatible Program.**

> **EXIT CRITERION — both halves required.**
>
> **A · Recommendation honesty.** Every valid combination of goal × gym access × experience that
> onboarding can generate returns either a Program the engine can honestly justify, or an explicit
> truthful no-fit result — proven across the complete deterministic input space, with no calorie or
> protein target drift across real profiles.
>
> **B · Program-content integrity.** Every new 4.3.9-L Program proves: complete Program metadata ·
> complete duration and weekly schedule · every required Routine exists · every Routine contains valid
> canonical exercises · no missing or broken exercise references · valid prescribed sets, reps, rest and
> notes · equipment requirements matching the Program promise · **Bodyweight / No-Equipment contains no
> exercise requiring unavailable equipment without a valid substitution** · day counts matching the
> advertised schedule · working Program open, back and start-session flows · a user can begin and
> complete a representative workout · entitlement behaviour unchanged · **no automatic enrolment** · no
> source Routine or Program silently mutated · `npm run verify` green.
>
> A recommendation the catalog can justify but cannot deliver is not a pass.

### 4.3.9-X — Program Catalog Depth

**Classification: post-launch — conditionally.**

- **4.3.9X.1 — Home Strength Program.**
- **4.3.9X.2 — Full Gym Strength Program.**

These are intended to **deepen an already-served catalog**, in contrast to 4.3.9-L which closes coverage
failures. **That premise is not yet proven.** Current Program equipment metadata is known to be inaccurate
— every published Program claims `Any Setup` — so "a home-equipment or full-gym user is already served"
cannot be treated as fact until 4.3.9A and the complete input-space replay demonstrate it.

**Conditional deferral (binding).** These two stay at 4.3.9-X **only if** 4.3.9A and the input-space
replay prove the existing launch Programs honestly serve those gym-access categories. **If either category
lacks a suitable launch Program, the necessary coverage content is promoted into 4.3.9-L before
activation.** An explicit no-fit result must never become the normal paid-launch outcome for a common
supported gym-access category: **"no suitable Program yet" is a safety fallback, not a substitute for
required launch catalog coverage.**

**4.3.6K.1 and 4.3.6K.2 remain recorded under the closed Phase 4.3.6** (§4.3.6K); only their scheduled
owner is new — K.1 → 4.3.9-L, K.2 → 4.3.9F. Neither historical record is altered.

---

## PHASE 4.4 — PERSONAL AI COACH v1 — READ-ONLY

**Goal:** build the core premium differentiator.

### Coach v1 read-only contract (binding)

**Coach v1 MAY:** read · understand · analyze · explain · recommend.

**Coach v1 MAY NOT:** directly modify stored user data — no writing, editing, or deleting logs, goals,
plans, routines, or reminders; no scheduling; no silent mutation of any user state.

Write-capable behavior begins in **Phase 4.7**, behind its own safety contract. Do not anticipate 4.7 by
adding "just one" write tool to 4.4.

### Scope discipline (binding, 2026-09-02)

Coach stays launch-blocking, but **4.4 does not receive a blank cheque because eleven sub-items are
listed below.** Its preflight (§12.7) must identify the **smallest trustworthy read-only Coach v1** that
achieves the launch outcome — *a safe Coach that understands the user's real data and gives trustworthy
next-step guidance without mutating user state* — and rule on: which sub-items are required for launch,
which reduce, which move post-launch, what cost governance precedes any live AI usage, what evaluation
makes guidance truthful and safe, and whether the 4.3.7A deferred inputs (training preferences ·
lifestyle constraints · nutrition preferences) are actually needed, per the deferral ratified on the
condition that Coach would decide. **If a sub-item moves it gets an exact destination and a reason**
(§12.3); none is silently deleted.

### Real-user pilot commitment

After 4.3.9-L corrects catalog honesty and **before the Coach v1 UX contract is locked**, run a small
invitation-only pilot with several real users. It tests onboarding completion · whether the
recommendation feels appropriate and is understood · starting and completing a workout · Quick Log ·
Progress · returning a later day · and where confusion, abandonment or loss of trust occur.

**Not a public launch.** No paywall, no 4.3.8 dependency, no unsafe production experiments. **A
commitment, not a research programme** — no new numbered phase, no research framework.

### 4.4.1 — Coach conversation foundation
Authenticated conversations · persistent message history · a conversation storage model (a dedicated
`ai_chat_messages` table or equivalent does **not** exist yet and must be created) · reliable context
assembly · reliable system instructions · safety boundaries per `CLAUDE.md` §16 · graceful failure.

### 4.4.2 — Coach cost governance
Extend the existing `ai_usage` architecture rather than duplicating it. Track per-user usage, model usage,
token/cost consumption, limits, abuse, and a hard monthly ceiling. **Do not launch a subscription feature
with unbounded AI unit economics.**

### 4.4.3 — Profile / goal intelligence
Goals · body stats · activity · preferences · targets · the plan produced in 4.3.7.

### 4.4.4 — Training intelligence
Routines · programs · exercise history · workout history · consistency · relevant performance.

### 4.4.5 — Nutrition intelligence
Calorie/protein/macro targets · today's intake · food history · adherence patterns.

### 4.4.6 — Progress intelligence
Weight history · optional body-fat history · training adherence · nutrition adherence · progress trends.

### 4.4.7 — In-workout context
When opened during a workout, Coach knows the current workout, current exercise, completed work, upcoming
work, and relevant historical performance.

### 4.4.8 — Persistent Coach launcher
A persistent lower-right Coach control on authenticated surfaces: white background, black Muscle Motivation
mark, unobtrusive, safe-area aware, and respectful of the bottom navigation. Flip the reserved `coach`
destination in the `app-nav.js` registry to `available` when it genuinely ships.

### 4.4.9 — Coach sheet
Open Coach without forcing the user away from their current task. Reuse the 4.3.5C bottom-sheet primitive.

### 4.4.10 — Coach Insight upgrade
The deterministic dashboard Coach Insight evolves into genuinely personalized intelligence.

### 4.4.11 — Coach evaluation harness
A repeatable, versioned evaluation modeled on `nutrition-evaluation/` — the same governance shape:
reviewed cases, a committed baseline, direction-aware metrics, append-only history, never auto-updated,
never a target to game.

Evaluate: context correctness · hallucinated user history · unsafe advice · contradictory advice · stale
context · missing-data behavior · workout recommendations · nutrition recommendations · progress
interpretation · response consistency.

> **EXIT CRITERION:** Coach is reliable and valuable enough to be a legitimate subscription differentiator.

---

## PHASE 4.5 — PREMIUM MEMBERSHIP & PAID-ONLY LAUNCH

**Goal:** commercialize only after the premium value is real.

**One phase number, two ordered stages**, so the entire system can be built and proven without setting a
launch date, and the activation stage stays narrow enough to reverse.

### 4.5-I — Pre-Activation Build & Certification

**All activation flags remain OFF publicly.** Builds and proves the complete monetization and
customer-entry system plus every launch certification — security, legal, and Food Intelligence.

Owns **4.5.1 · 4.5.2 · 4.5.3 (built, disabled) · 4.5.4 · 4.5.5 · 4.5.6 · 4.5.7 (design + production-data
dry run) · 4.5.8 · 4.5.9 · 4.5.10 · 4.5.11 · 4.5.12 · 4.5.14 · 4.5.15 · 4.5.16 · 4.5.17 · 4.5.18.**

> **EXIT CRITERION (4.5-I):** with flags forced ON outside public activation, a test account completes
> trial → convert → fail → recover → cancel → restore → delete with the correct entitlement at every
> stage; unentitled access is refused at the server and data boundaries, **not merely hidden by client
> UI**; the migration dry run produces a reviewed expected result; rollback is rehearsed; legal surfaces
> are published; and 4.5.17 has passed its locked thresholds.

### 4.5-A — Paid-Only Activation

**Execution only — no product construction.** Execute the approved production migration · enable
enforcement · activate the paid-only journey (4.5.13) · live smoke validation · reconcile migrated
accounts · monitor conversion and access · exercise rollback if needed.

Owns **4.5.13** plus execution of the already-built 4.5.3, 4.5.7, 4.5.8, 4.5.9 and 4.5.16. Does not begin
until 4.3.8 and 4.3.9-L have landed, and **cannot close while any §10.13 disposition is missing.**

> **EXIT CRITERION (4.5-A):** the paid-only journey is live, no unentitled request reaches a protected
> surface by any route, every pre-existing purchaser and the owner account retain access, the conversion
> funnel reports end to end, and rollback remains available and rehearsed.

### 4.5.1 — Subscription-state extension
Use the entitlement model defined in **4.3.6L**. Explicitly reconcile the existing purchase/subscription
storage rather than creating a duplicate source of truth for money or access.

Support: trialing · active · grace / past due · cancelled but active through period end · expired.

**Schema change required (recorded 2026-09-02).** The `purchases.status` CHECK currently admits
`active`, `canceled`, `refunded`, and `past_due` only — it **cannot represent `trialing`**, so 4.5.5 is
impossible without altering it. `purchases` remains the single source of truth; **do not create a second
store to hold trial state.** The exact schema is presented for approval at 4.5-I preflight, per 4.5.18.

### 4.5.2 — Stripe lifecycle + billing recovery
Checkout · trial · activation · renewal · cancellation · failed payments · past-due handling ·
**recovery/dunning** · update-card flow · entitlement synchronization · restore/reconciliation.

### 4.5.3 — Hard protected-app enforcement
No valid entitlement → membership/paywall experience. Valid entitlement → the authenticated product.
**Hiding buttons in the frontend is not enforcement.**

### 4.5.4 — Premium offer & product ladder
The subscription can legitimately sell: personalized plan · workouts · Programs · nutrition tracking ·
progress tracking · Personal AI Coach · ongoing intelligence · future premium improvements.

Preserve the broader ladder: free lead-gen → standalone digital programs where strategically retained →
membership → **premium/high-touch coaching** → future merchandise where appropriate.

### 4.5.5 — Full premium trial
Preferred model is **full premium access** during trial, not a permanently crippled free app tier. Duration
is a commercial optimization decision.

### 4.5.6 — Join now
Allow immediate paid membership without requiring trial usage.

### 4.5.7 — Existing customer migration
Explicitly preserve valid access for existing users, existing program purchasers, current coaching clients,
administrative accounts, and prior purchases. **Do not accidentally revoke historical access.**

### 4.5.8 — Conversion analytics
Complete reporting over the events already instrumented in 4.3.7G / 4.3.8H: landing · onboarding start ·
completion · account creation · value reveal · premium page · trial start · checkout · subscription
activation · first workout · first nutrition log · Coach usage · retention.

### 4.5.9 — Public lead-generation boundary
The **authenticated application** becomes paid-only. That does **not** gate the public website.

Explicitly preserve as free public lead generation: landing page · public program/store pages ·
**calculator** · free guide · About · Pricing · Contact.

`calculator.html` additionally remains under its standing no-modification rule (`CLAUDE.md` §3). The
paywall work must not touch it.

### 4.5.10 — Marketing site completion
**About, Pricing, and Contact pages do not currently exist** and are pre-launch deliverables, not merely
pages to leave ungated. **Pricing is required** before a mandatory subscription launch.

### 4.5.11 — Account deletion & data export
Account deletion · data deletion lifecycle · data export where appropriate · deletion-safe relational
behavior across every user-owned table.

### 4.5.12 — Security / privacy launch review
Before activating the paywall, review: auth · route protection · payment/webhook trust boundaries · access
control · admin permissions · AI data flow · PWA privacy contracts · sensitive data handling ·
public/private route separation. Prior hardening invariants (CSP/SRI, webhook-only `stripe_customer_id`,
owner-gated program content) must survive the 4.3.7 auth changes and 4.5.3 enforcement.

**Also owns three previously unscheduled items (2026-09-02):** **§10.10** `TRUNCATE` and default-privilege
review, repo-wide in one reviewed change · **§10.12** the dead `profiles.tier` column — remove it or
record why it stays · **the brittle-test review pass** promoted out of 4.3.7, over older suites whose
assertions match formatting rather than the property under test.

### 4.5.13 — Paid-only production launch
Activate mandatory subscription/trial access to the protected consumer application. **Executed in stage
4.5-A.**

### 4.5.14 — Legal and policy surfaces

Terms of Service · Privacy Policy · a published refund and cancellation policy — treated here as **product
and commercial launch requirements** for a subscription product storing body-composition and
health-related information.

**Do not claim that a specific payment processor, law, regulation, or distribution channel automatically
requires particular wording**; requirements depend on jurisdiction, customer location, business structure,
processor, and distribution method. **This roadmap text is not legal advice, and roadmap-generated wording
must never be published as final policy.** Drafts require qualified legal review before publication.

### 4.5.15 — Commercial limits review

Re-judge every cap designed for a free product against paid-member expectations, starting with
`AI_FOOD_DAILY_LIMIT = 30` parses per user per day. Each cap needs an explicit commercial decision, clear
behaviour when reached, and support handling. A paying user must not meet a free-tier assumption by
accident.

### 4.5.16 — Rollback and kill switch

One **rehearsed** reversible switch that disables paid-only enforcement **without deleting** user data,
purchases, onboarding data, personalization, Programs, Routines, Coach history, or analytics. Rehearsed
before activation, not designed during an incident.

### 4.5.17 — Food Intelligence launch certification

**Launch-blocking and able to fail.** Failing a locked threshold blocks activation (G5). It certifies
**breadth of real-world coverage** — a different question from correctness on the existing corpus, which
already reports full marks on the cases it contains.

**Method.** A versioned **frozen evaluation set** plus an **untouched blind holdout** never used to shape
a fix. Root-cause classification before any change; principled generalized fixes expected; every fix adds
regression coverage; rerun both sets; reject case-specific tuning; report real scores. Governance is §2.3
and binds here.

**Two distinct certification layers. Neither proves the other, and both are activation-blocking.**

**Layer A — deterministic downstream certification.** Fixture the model output, then measure item
resolution, portions, units, confidence, display, and logging behaviour. Runs in ordinary deterministic
CI. This measures the pipeline **below** the model.

**Layer B — controlled end-to-end AI-parse certification.** Runs the **actual production-intended model
and configuration** over a frozen, stratified set of realistic user meal descriptions, and evaluates
whether the returned structured items faithfully represent the input — **omissions · hallucinated foods ·
duplicated foods · quantities · units · multi-item separation**. Non-determinism is handled explicitly by
a **locked model version and settings** plus an approved repeated-run or adjudicated sampling method.
Record model version, settings, cost, and observed variance. **May run outside ordinary deterministic CI**
if required; its locked threshold is still activation-blocking.

Without Layer B the segment *user meal description → model-produced structured items* is unmeasured, which
is the largest untested surface in the nutrition product.

**Required coverage:** common generic foods · branded foods · multi-item meals · ambiguous quantities ·
common restaurant and composed-meal language · unit and serving edits · realistic dictation-style text
(informal phrasing, run-on descriptions, number words, homophone and transcription-like errors, missing
punctuation).

**Metric definitions lock now; corpus size, repetition method, tolerances and numeric thresholds lock at
4.5-I preflight.**

| Metric | Layer | Definition | Direction |
|---|---|---|---|
| Resolution correctness | A | Top-1 acceptable-candidate rate on the frozen set | higher |
| False-confidence rate | A | Share of confident auto-resolves whose top candidate is wrong | lower |
| Clarification precision / recall | A | P: of cases asked about, how many needed it. R: of cases needing it, how many were asked | higher |
| Portion / unit correctness | A | Gram weight within tolerance for the stated quantity and unit, including after a user edit | higher |
| AI meal-description downstream resolution | A | With the model output **fixtured**, share of items resolving acceptably — measures the pipeline **below** the model | higher |
| **AI meal-description parse fidelity** | **B** | **Actual model output faithfully represents the user's stated foods, quantities and units without omission or invention** | higher |
| Dictated-text-to-log resolution | A | Realistic dictation-style text in Quick Log resolves safely through the existing pipeline | higher |
| Catastrophic nutrition errors | A + B | A confidently logged result diverging beyond an agreed factor on calories or protein, or a confident wrong-species/family resolve | lower — **the safety metric** |
| Crash / failure rate | A + B | Unhandled exception or unusable state per N cases | lower |

The AI meal-description path is currently **out of eval scope** entirely because the model is
non-deterministic (`nutrition-evaluation/README.md`). Layer A closes the downstream half by fixturing the
model's *output*, as `benchmarks/fixtures.js` already does for USDA; **Layer B closes the model half, and
one does not substitute for the other.** Dictated text is measured through Layer A — **we own
interpretation of the text; Apple and Android own transcription.**

**Composed dishes.** Comprehensive coverage stays at 5.4.11, but **common launch cases are not excluded
because the broader phase is later**. When a common case cannot resolve safely the correct outcome is
clarification or unresolved — never a confident invented match — so such cases score under
false-confidence and catastrophic error rather than being exempted.

### 4.5.18 — Durable commercial product model

Adding one sellable Program today costs **three coupled edits**: the `purchases.product` CHECK enum, the
per-slug map in `api/create-checkout-session.js`, and a new per-slug environment variable.

**Locked requirements:** `purchases` stays the authoritative purchase source of truth, written only by the
Stripe webhook through the service role · `entitlement-core.js` stays the single resolver · **no
subscriptions table, no grants table** · membership inclusion supported · standalone purchases remain
independent entitlements surviving a membership lapse (O1, R2) · **Program content can exist without
becoming sellable** · adding future commercial Programs must not require repeated hard-coded slug edits
across SQL, code and environment · test/live Stripe environments, price changes, billing intervals and
future non-Program products all handled safely.

**Implementation is deliberately not locked.** Do not adopt a validation trigger, a
`programs.stripe_price_id` column, a new table, or any schema before technical preflight; at 4.5-I
preflight compare the smallest durable alternatives and **present the exact schema for approval before
any migration.** **§10.9 is reassigned here**, reclassified from "a migration per Program" to one
structural change made once.

> **EXIT CRITERION:** the full journey works — **Discover → Personalize → Understand → Subscribe → Use →
> Receive ongoing Coach value.**

---

# 5. POST-LAUNCH APPROVED ORDER

> **4.6 → 4.7 → 4.8 → 4.9 → 4.3.9-X → 5.0 → 5.1**

**Phase 5.0 does not move.** Only the shared gesture requirements currently numbered **5.0.3**
(gesture-conflict prevention) and **5.0.4** (accessible alternatives) are delivered earlier, as the opening
checkpoint of 4.8 — because 4.8.12 and 4.9.2 both consume them. 5.0.1, 5.0.2, and 5.0.5 stay at Phase 5.0.
See §9.5.

---

## PHASE 4.6 — NOTIFICATIONS & ACCOUNTABILITY

**Goal:** build the one reminder and notification infrastructure the whole platform shares.

This phase **owns** reminder storage, scheduling, permissions, and delivery. Every later caller — Coach
Action Tools (4.7.8), Adaptive AI (5.5) — invokes this system. **Never create a parallel scheduler.**

- **4.6.1 — Reminder storage & scheduling core.** The shared model and scheduling semantics.
- **4.6.2 — Notification preferences.** Per-category user control.
- **4.6.3 — Permission handling.** Platform permission requests, denial states, and re-prompting discipline.
- **4.6.4 — Delivery / push architecture.** Appropriate PWA/native capabilities. Note the current service
  worker deliberately ships with no push; this phase introduces it against the §2.5 privacy constraints.
- **4.6.5 — Workout reminders.**
- **4.6.6 — Nutrition / logging reminders.**
- **4.6.7 — Weigh-in / progress reminders.**
- **4.6.8 — Habit reminders.** This phase delivers **reminder capability only**; habit-specific reminders
  ship with Habits at **5.2**, because habits do not exist until then.
- **4.6.9 — Quiet hours.**
- **4.6.10 — Anti-spam / frequency discipline.** The right message, to the right person, at the right time.

> **EXIT CRITERION:** one reminder infrastructure exists, with user-controlled preferences, that any future
> caller can use without building its own scheduler.

---

## PHASE 4.7 — AI COACH ACTION TOOLS

**Goal:** let Coach act — only through explicit, safe, auditable tools. Deliberately separated from
read-only Coach because write-capable AI has a higher safety and trust threshold.

### Safety contract (binding)

> **Permission → Confirmation → Action → Undo**

Undo applies wherever technically appropriate. **Material actions must never silently mutate user state.**

- **4.7.1 — Action permission architecture.** Clear boundaries for every write-capable action.
- **4.7.2 — Confirmation.** Coach explains the proposed action and obtains confirmation before material
  writes.
- **4.7.3 — Undo / recovery.** Reversible wherever technically appropriate.
- **4.7.4 — Nutrition actions.** Log meal · edit meal · delete entry · save meal · update nutrition target
  where permitted.
- **4.7.5 — Workout actions.** Modify workout · **swap exercise (calls the 4.3.6I substitution engine —
  Coach never invents substitutions)** · add/remove exercise · adjust appropriate targets · create a draft
  workout.
- **4.7.6 — AI workout generation.** Structured routines referencing canonical exercise identity. Valid
  `exercise_id` or appropriate custom identity · no fabricated exercise records · user previews · user
  confirms before save.
- **4.7.7 — Goal / plan actions.** Propose, then update supported plan variables after confirmation.
- **4.7.8 — Reminder actions.** Coach may create or update reminders **only by calling the shared 4.6
  notification system** ("Remind me to weigh myself tomorrow"). No Coach-specific scheduler.
- **4.7.9 — Auditability.** Store enough structured information to reconstruct what Coach proposed, what
  the user approved, what changed, and whether it was undone.

> **EXIT CRITERION:** Coach can take useful actions without silent or uncontrolled modification of user
> data.

---

## PHASE 4.8 — TRAINING ENGINE 2.0 — TIMED / HIIT / CIRCUIT / HYBRID

**Goal:** support timed, HIIT, circuit, and hybrid training through **one** workout engine — not a
disconnected second workout system.

This phase precedes advanced progression (5.1) because it changes what a set fundamentally *is*.

### Opening checkpoint — shared gesture foundation (2026-09-02)

**4.8 begins by delivering 5.0.3 (gesture-conflict prevention) and 5.0.4 (accessible alternatives)**
before 4.8.12 reordering, by extending the shipped `mm-sheet.js` gesture classifier rather than building
a second arbitration layer beside it. **Both 4.8.12 and 4.9.2 consume this foundation.** Swipe (5.0.1) and
long-press reorder (4.8.12) stay distinct patterns with distinct owners; only conflict arbitration and the
accessible alternative are shared. Same rule as 4.3.5C — build the primitive before its consumers.

- **4.8.1 — Timed exercise model.** Reps · duration · distance where useful · rest · interval duration.
- **4.8.2 — Work timer.** Countdown/count-up · pause · resume · skip · reset where appropriate.
- **4.8.3 — Rest timer.** Native rest between sets, exercises, circuits, and rounds.
- **4.8.4 — Circuit blocks.**
- **4.8.5 — Rounds.** Represent repetition properly rather than duplicating exercise rows.
- **4.8.6 — HIIT intervals.** e.g. `40 sec work / 20 sec rest`.
- **4.8.7 — Hybrid workouts.** One routine may mix strength sets, timed movements, circuits, rounds, rests.
- **4.8.8 — Timed workout player.** Current movement · timer · current round / total · next movement ·
  pause · skip · finish.
- **4.8.9 — Audio / haptic transitions.** Countdown warnings · interval completion · next exercise · round
  completion.
- **4.8.10 — Background / PWA timer reliability.** Timestamp-based timing. Never assume JavaScript
  intervals stay accurate when the app backgrounds, the screen locks, the PWA suspends, or the browser
  throttles.

### Workout editing *(approved 2026-08-20)*

Approved capabilities recorded here because they change what an in-progress session **is** and how it is
edited — the same engine question 4.8.1–4.8.10 answer for timing. **Internal order is binding:
4.8.11 → 4.8.12.** Reordering is a drag interaction layered on session-editing semantics; building it on
unstable session identity would produce exactly the second workout system this phase exists to prevent.

- **4.8.11 — Active workout editing foundation.** Establish session-editing semantics before any
  reorder work.
  - Rename a workout **while it is already in progress**.
  - The rename persists to the active workout/session and carries into workout history.
  - Closing and reopening the app or the installed PWA must not lose the renamed session name.
  - **Renaming the active session must never silently rename the source workout template, routine, or
    program.** Renaming a source template/routine/program requires separate explicit user intent.
  - The architecture must clearly distinguish the **session / workout-instance name** from the **source
    template / routine / program name**. No hidden coupling between them.
  - Session identity and history integrity remain correct throughout.
- **4.8.12 — Exercise reordering.** Rearrange exercise order by hold / long-press and drag, in **both**
  workout/template building-and-editing **and** an active workout already in progress.
  - **One shared, reusable reorder pattern serving both surfaces** — never two unrelated page-specific
    implementations (§2.7).
  - Interaction: hold / long-press to initiate on touch · drag to a new position · clear lifted/dragging
    visual state · stable drop target and insertion position · auto-scroll when dragging near the top or
    bottom edge.
  - Ordinary vertical scrolling stays easy; long-press/drag must never trigger accidentally during normal
    page scrolling.
  - The new order persists, and reopened sessions/templates preserve it.
  - **Canonical exercise identity is unchanged by reordering** (`exercise_id` / `user_exercise_id`
    semantics per 4.2.1K are untouched).
  - **Accessibility (binding):** a non-drag alternative — Move Up / Move Down or an equivalent accessible
    reorder mechanism — ships with the feature. Drag is never the only way to reorder (§2.6, 5.0.4).
  - **Dependency to check before implementing:** 5.0.1 owns the shared swipe-action framework and 5.0.3
    owns gesture-conflict prevention (§9.5). Reconcile with those owners so the platform ends up with one
    coherent touch-gesture layer rather than two competing drag systems.

---

## PHASE 4.9 — PERSONALIZATION

- **4.9.1 — Dashboard customization.** Users choose supported Home modules; the default stays curated.
- **4.9.2 — Dashboard reordering.** Do not destroy the high-quality default.
- **4.9.3 — Nutrition metric choices.** Default **Calories + Protein**; optional Carbs and Fat.
- **4.9.4 — User accent color.** Muscle Motivation red remains the default.
- **4.9.5 — User preference framework.** Reusable settings architecture for future display/behavior
  preferences. This is **UI personalization** — distinct from the AI preference *learning* in 5.5.10.

---

## PHASE 5.0 — ADVANCED MOBILE INTERACTION POLISH

- **5.0.1 — Shared swipe-action framework.** One reusable horizontal action pattern.
- **5.0.2 — Swipe-to-delete.** Candidates: food logs · Saved Meals · weigh-ins · other suitable entries.
  Swipe **reveals** the destructive action; never delete merely because a swipe occurred.
- **5.0.3 — Gesture conflict prevention.** Horizontal actions must not fight vertical scrolling.
- **5.0.4 — Accessible alternatives.** Every gesture-only capability has a discoverable non-gesture control.
- **5.0.5 — Native-feeling polish.** Selective transitions, haptics, feedback, touch states. No animation
  for animation's sake.

---

## PHASE 5.1 — SMART TRAINING 2.0 / ADVANCED PROGRESSION

**This phase extends already-shipped behavior. Do not rebuild it from zero.**

Previous-performance display is shipped (ID-first logged identity, last performance, exercise history, live
PR baseline). Progression logic is partly shipped in `progression.js` (double progression, deload, and the
exercise-metadata seam). Audit and extend; do not recreate.

- **5.1.1 — Previous-performance system hardening.** Improve the shipped system.
- **5.1.2 — Advanced progressive overload.** Extend the existing progression logic; distinguish real
  progression from single-session noise.
- **5.1.3 — Equipment-aware increments** *(deferred from the progression spec)*. Account for realistic
  available jumps.
- **5.1.4 — Warm-up support** *(deferred from the progression spec)*.
- **5.1.5 — Per-set / pyramid logic** *(deferred from the progression spec)*. Progression models beyond one
  uniform prescription, accounting for the 4.8 timed/hybrid representation.
- **5.1.6 — Exercise media.** Thumbnails · photos · muscle diagrams · demonstration video. Keyed to
  canonical exercise identity, with media in dedicated storage rather than columns on `exercises`.
- **5.1.7 — Training analytics** *(filed here, not under body composition)*. Weekly sets · volume by muscle ·
  exercise volume · frequency · workload · longer-term training trends · MEV/MAV/MRV volume-landmark
  concepts where scientifically and practically appropriate. Keyed on canonical exercise identity.
- **5.1.8 — Coach integration.** Coach explains progression recommendations rather than presenting
  unexplained numbers.

---

# 6. RETAINED PRODUCT EXPANSION

## PHASE 5.2 — HABITS & DAILY HEALTH

- **5.2.1 — Steps.** · **5.2.2 — Water.** · **5.2.3 — Sleep.** · **5.2.4 — Habit tracking.**
- **5.2.5 — Dashboard integration.** Habits remain secondary to Today / Training / Nutrition / Progress.
  Avoid turning Home into a giant health dashboard. Reminders route through 4.6.

## PHASE 5.3 — BODY COMPOSITION & VISUAL PROGRESS

- **5.3.1 — Weight history expansion.** *(Status corrected 2026-09-02: substantially shipped. Extend, do
  not rebuild.)*
- **5.3.2 — Body-fat logging.** *(Status corrected 2026-09-02: shipped — `metrics.js` over
  `body_fat_logs` and `measurement_logs`, rendered on `weight-history.html`.)*
- **5.3.3 — Progress photos.** Secure user storage.
- **5.3.4 — Comparison UX.** Meaningful comparison over time.
- **5.3.5 — Coach context.** Coach may use trends but must **not** make unsupported visual
  body-composition claims.

## PHASE 5.4 — NUTRITION 2.0

- **5.4.1 — Favorites.** · **5.4.2 — Recent foods.** *(Status corrected 2026-09-02: both shipped —
  favorites in `public.user_food_favorites`, recents derived from logging history. Refinement only.)*
- **5.4.3 — Saved Meals 2.0** *(full approved scope)*: rename saved meals · edit saved-meal contents · add
  foods · remove foods · change serving sizes · improved organization. Gesture polish arrives via 5.0.
- **5.4.4 — Rich macro view.** Carbs, fat, and more detail where useful.
- **5.4.5 — Micronutrient expansion.** Only where source data is reliable and the UX adds real value.
- **5.4.6 — Meal templates / patterns.**
- **5.4.7 — Voice food logging.** Speech → the existing shared food-resolution core; user confirms. A new
  input surface, not new intelligence. **Post-launch, and not split into launch and post-launch versions**
  (2026-09-02). Launch-time speech-to-log is already served by **OS keyboard dictation** into the existing
  Quick Log input, editable before logging — so **no Muscle Motivation microphone, audio recorder, browser
  Speech API integration, or server-side transcription may be built pre-launch.** We own interpretation of
  the text; Apple and Android own transcription. Distinct from **7.0 Voice Coach**.
- **5.4.8 — Photo food logging.** Photo → vision → food-resolution core → meal reasoning → portion
  intelligence → correction memory → confirmation → log. All estimates labeled as estimates.
- **5.4.9 — Coach-nutrition integration.** Coach reasons over nutrition data without inventing intake or
  treating uncertain estimates as exact.
- **5.4.10 — Macro-aware meal recommendations.** Next best meal from remaining macros · calories · meal
  timing · workout timing · preferences · adherence · restaurant/context data where reliable.
- **5.4.11 — Restaurant / composed-dish coverage.** Improve coverage where the current food database is
  structurally weak — USDA has no generic composed "salad" record, a limitation the evaluation suite
  already measures and records honestly.

  **Boundary with 4.5.17.** *Common* restaurant and composed-meal language is a required 4.5.17 launch
  coverage stratum and is therefore **pre-launch**; this phase owns the *comprehensive* long tail. Where
  the database cannot serve a common composed dish, the required launch behaviour is honest clarification
  or an unresolved result — never a confident invented match.
- **5.4.12 — Nutrition ranking hardening.** Carry forward the evaluation-discovered low-priority defects:
  word-order ranking sensitivity, yogurt fat-basis presentation ordering, and similar.
- **5.4.13 — Portion-correction persistence.** Persist useful user portion corrections (needs a migration);
  include gram-edit capture where appropriate.
- **5.4.14 — Meal-context confidence gating.** Resolve the currently deferred, default-off meal-context
  confidence behavior before activating it.

## PHASE 5.5 — ADAPTIVE AI COACHING

The evolution beyond conversational Coach and action tools. **Owns check-in content and cadence; delivery
always routes through 4.6.**

- **5.5.1 — Daily AI check-ins.** · **5.5.2 — Weekly review.** · **5.5.3 — Monthly review.**
- **5.5.4 — Plateau detection.** Require sufficient trend history; never declare a plateau from short-term
  noise.
- **5.5.5 — Smart target adjustments.** Calories · macros · training · activity — always with transparent
  reasoning.
- **5.5.6 — Proactive recommendation engine.**
- **5.5.7 — Adherence-aware coaching.** Distinguish plan problem · adherence problem · insufficient data ·
  normal variation.
- **5.5.8 — Approval for material plan changes.** Never silently change meaningful user targets.
- **5.5.9 — Personal Knowledge Graph.** Evolve the 4.3.7F Personal Context Layer into one structured living
  model across goals · nutrition · training · lifestyle · behavior · preferences · adherence · relevant
  history. Every AI feature reads from and updates this coherent source rather than reconstructing the user
  differently in each feature.
- **5.5.10 — Preference learning.** Favorite foods and brands · meal timing · restaurant tendencies ·
  preferred exercises · workout preferences · adherence patterns · recommendation acceptance and rejection ·
  motivational preferences. **AI behavioral personalization — distinct from the 4.9 UI personalization.**

## PHASE 5.6 — HEALTH & WEARABLE INTEGRATIONS

- **5.6.1 — Apple Health.** Steps · body weight · workouts · other useful supported metrics.
- **5.6.2 — Android health integration.** Use the appropriate Android health platform at implementation
  time.
- **5.6.3 — Wearables.** Supported watches and fitness devices, driven by real demand.
- **5.6.4 — Data reconciliation.** Avoid duplicates between manually logged and imported activity.
- **5.6.5 — Privacy / permissions.** Granular, clear permission handling.

## PHASE 5.7 — NATIVE MOBILE EVOLUTION

The PWA remains the application foundation. Native iOS/Android becomes justified only when measurable
platform constraints warrant it: health integrations · reliable background activity · advanced
notifications · camera/voice · timer reliability · App Store strategy · meaningful UX limitations.

**Do not rewrite natively merely because native sounds more premium.**

---

# 7. SOCIAL, BUSINESS & COACH PLATFORM

## PHASE 6.0 — COMMUNITY
User profiles with privacy controls · community feed (only if it creates measurable retention) · groups ·
challenges · leaderboards (designed to avoid unhealthy incentives) · success stories · moderation, which
must exist alongside social features rather than after them.

## PHASE 6.1 — REFERRALS & GROWTH LOOPS
Referral system · member rewards · program sharing/attribution where commercially appropriate · conversion
measurement.

## PHASE 6.2 — TRAINER / ADMIN TOOLS
- **6.2.1 — Trainer notes.** Private coaching notes linked to a client.
- **6.2.2 — Client review.** Adherence · workouts · nutrition · progress · Coach context where appropriate.
- **6.2.3 — Plan assignment.** Routines · Programs · targets.
- **6.2.4 — Human + AI coordination.** AI must not casually override explicit human-trainer instructions.
- **6.2.5 — Admin role / platform control.** Explicit privileged administrative access, not ad-hoc
  exceptions.

## PHASE 6.3 — TRAINER PORTAL
Client list · status/alerts · program assignment · progress review · messaging workflow · trainer analytics.

## PHASE 6.4 — PROGRAM / COACH MARKETPLACE
Trainer-created programs · premium routines · creator attribution · discovery · purchases/subscriptions ·
revenue share · quality controls. **Do not build before the internal Routine/Program architecture has
proven itself.**

## PHASE 6.5 — TEAM COACHING
Staff roles · shared client access · team content libraries · assignments · reporting.

## PHASE 6.6 — CORPORATE WELLNESS
Long-range only. Organization accounts · employee programs · aggregate reporting ·
privacy-preserving analytics · challenges. Employer visibility into private individual health information
requires appropriate architecture and consent, never convenience.

## PHASE 6.7 — BUSINESS ANALYTICS & AUTOMATION
Retention · cohorts · program effectiveness · subscriber conversion · churn indicators · Coach usage ·
trainer productivity · operational automation.

---

# 8. ADVANCED AI / INTERFACE RESEARCH

Retained possibilities, not commitments to immediate implementation.

## PHASE 7.0 — VOICE COACH
Spoken Coach conversation · hands-free workout assistance · workout commands · nutrition logging. Must work
in noisy gym environments to be worth shipping.

## PHASE 7.1 — COMPUTER VISION
Primary retained direction: exercise/form assistance · rep detection · movement analysis.

Progress-photo body-composition visual analysis is **not currently promised as a reliable feature** —
image-based body-composition estimation has a much higher validity and safety bar. It may be researched
later, but Muscle Motivation must never present unsupported visual estimates as precise measurements, and
must not make injury-prevention or biomechanics claims beyond what the system can reliably support.

## PHASE 7.2 — MULTIMODAL COACH
Conversation · training context · nutrition · progress · voice · images · wearables · live workout context.
Add a modality only when it materially improves coaching quality.

---

# 9. CROSS-CUTTING OWNERSHIP RULES

Ownership boundaries that prevent duplicate systems. These bind across phases.

## 9.1 Reminders, notifications, and check-ins

| Concern | Owner | Rule |
|---|---|---|
| Storage · scheduling · permissions · delivery · push · notification preferences | **4.6 Notifications & Accountability** | The one infrastructure. |
| Intelligent check-in **content**, **cadence**, and adherence-aware decisions about whether a check-in is useful | **5.5 Adaptive AI Coaching** | Decides *what* and *when is worth it*; never delivers on its own. |
| Creating/updating reminders on the user's behalf | **4.7 Coach Action Tools** | May only call the shared 4.6 system. |

**One reminder infrastructure. Multiple callers. Never a parallel scheduler.**

## 9.2 Entitlement and access

**4.3.6L** defines the single access model. **4.5** extends it with billing and subscription states.
No competing access-control model may be introduced.

## 9.3 Exercise substitution

**4.3.6I** owns the deterministic engine. **4.7.5** (Coach swap) and any later feature consume it.
Nothing invents its own substitutions.

## 9.4 User model

**4.3.7F** stores explicit, stated user context. **5.5.9** evolves it into the learned Personal Knowledge
Graph. **5.5.10** learns behavioral preferences. **4.9.5** is user-facing UI preferences and is a different
concern entirely.

## 9.5 Interaction primitives

**4.3.5C** owns the bottom sheet; **5.0.1** owns swipe actions. Coach (4.4.9), pickers, filters, and food
selectors consume them.

**4.8.12** owns the shared long-press **reorder** pattern, consumed by both workout/template builders and
the active workout. It is a distinct interaction from 5.0.1 swipe actions, but it shares 5.0.3's
gesture-conflict constraint and 5.0.4's accessible-alternative requirement.

**Resolved 2026-09-02:** those two are delivered as the **opening checkpoint of 4.8** and consumed by both
4.8.12 and 4.9.2. Phase 5.0 does not move; 5.0.1, 5.0.2 and 5.0.5 remain there. See Phase 4.8.

---

# 10. KNOWN TECHNICAL DEBT & PRESERVED DEFERRALS

Must not silently disappear.

## 10.1 Legacy exercise identity
Legacy pre-4.2.1K workout rows may still carry name-keyed custom identity behavior. This was a deliberate,
conservative choice — the backfill never guessed ambiguous rows.

The historical "exercise identity convergence" proposal (unifying `user_exercises` into `exercises` via an
owner column) is considered **SUPERSEDED by the 4.2.1K dual-identity architecture** unless a new audit
proves a residual problem requiring migration. **Do not perform a risky migration merely because an older
roadmap proposed one.**

## 10.2 Progression extensions
Still deferred: equipment-aware increments · warm-up logic · per-set/pyramid progression. These belong in
**5.1** (5.1.3–5.1.5).

## 10.3 Production hostname / service-worker validation
The registration guard allows the apex host only and fails closed. Confirm the canonical production
hostname and align the guard. **Resolve in 4.3.5H.**

## 10.4 Dirty-state / unsaved-work contract
No app-wide unsaved-work signal exists; the current protection is that service-worker refresh happens only
on explicit user acceptance. **Resolve in 4.3.5G.**

## 10.5 Nutrition open loops from shipped phases
Portion-correction persistence and gram-edit capture (5.4.13) · meal-context confidence gating, currently
default-off (5.4.14) · word-order ranking sensitivity and yogurt fat-basis presentation (5.4.12).

## 10.6 Android PWA install validation
Deferred since 4.3.1. **Resolve in 4.3.5K.**

## 10.7 Branch protection — **RESOLVED 2026-08-14**
The `verify` check is now required on `main`, alongside a required pull request and an
up-to-date-branch requirement. See §2.2 and "Completed repository actions" in
`docs/ROADMAP-HISTORY.md`. Retained here as a closed entry rather than deleted, per §12.2.

## 10.8 Instrumented Android navigation-performance validation (4.3.5F)
Outstanding since 2026-08-20 because the owner has no physical Android device. **4.3.5 stays open until
this is measured**; the 4.3.5F targets are unchanged and remain binding. Resume at Android USB /
`chrome://inspect`. 4.3.6 may proceed in parallel by owner-approved exception — that exception defers the
timing only, never the requirement.

## 10.9 Program catalog vs `purchases.product` CHECK
`purchases.product` is a hard-coded CHECK enum of four slugs, so **selling any new Program requires a DDL
migration**. For 4.3.6 the Program catalog's sellable slugs must remain a subset of that enum; a catalog
row is not a licence to sell. Altering the CHECK is a stop-condition action requiring explicit approval.

**Reassigned to 4.5.18 on 2026-09-02** and solved once there, not by a migration per Program. **4.3.9
needs no commercial schema change** — content is authored using the existing `programs.status` and
`programs.standalone_purchasable` columns, becoming sellable only once 4.5.18 lands.

## 10.10 `TRUNCATE` granted to `anon` / `authenticated` — **LOW, latent**
Discovered during Phase 4.3.6 CP1a and verified in CP1b. Every table in the `public` schema grants
`TRUNCATE` to `anon` and `authenticated` (a Supabase project default — confirmed on `exercises`,
`profiles`, `program_workouts`, `purchases`, `workout_templates`), and **`TRUNCATE` is not subject to
RLS**, so row-level policies would not stop it.

**Severity: LOW, not exploitable through the shipped surface.** PostgREST maps HTTP verbs only to
SELECT/INSERT/UPDATE/DELETE — there is no request that issues `TRUNCATE` — so an ordinary `anon` or
`authenticated` JWT holder cannot reach it via the Supabase client. It is latent defence-in-depth debt
that would matter only if a direct Postgres connection or a permissive `SECURITY DEFINER` function were
ever exposed.

**Follow-up:** a dedicated security checkpoint should `REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public
FROM anon, authenticated` and adjust the default privileges, repo-wide and in one reviewed change.
**Not fixed piecemeal inside feature work.** CP1a set the precedent narrowly by revoking
INSERT/UPDATE/DELETE on `programs`; `TRUNCATE` was deliberately left alone there to avoid a silent
repo-wide privilege change.

**Assigned to 4.5.12 on 2026-09-02.** That security/privacy launch review is the dedicated checkpoint this
entry called for, and previously had no scheduled owner.

---

## 10.11 Phase 4.3.7 validation debt carried past closure

Phase 4.3.7 closed 2026-08-31 with three items outstanding. **None is unbuilt scope** — the phase's
exit criterion is met and every checkpoint shipped. Two are environment-dependent checks that could not
be performed in the working environment; the third is a measurement precision limit. All are recorded
here rather than waived, on the same principle as §10.8.

**A · iOS standalone-PWA OAuth — UNVERIFIED (validation debt).**
On iOS a standalone PWA can hand OAuth to a separate browser context and return via the system browser,
which would be a *different* `sessionStorage` area and would lose the anonymous onboarding draft.
`sessionStorage` survival across the OAuth round trip **was** measured on desktop Chrome (marker written,
tab navigated cross-origin to `accounts.google.com` and back, value intact) — the iOS standalone case
specifically was not, because no iOS device was available.

*Impact if it fails:* the user re-answers the wizard. **Never data loss** — a missing draft falls through
to the authenticated wizard by design. A PWA user also already holds an account, so does not enter the
anonymous funnel at all. **One physical-iPhone pass closes this.**

**B · Real responsive media-query validation at 320 / 390 / 430 — UNVERIFIED (validation debt).**
`resize_window` reports success but the viewport stays pinned at 1440px (`window.outerWidth: 0`), so
wrapping, horizontal overflow and tap-target geometry were measured by **constraining containers**
instead. That exercises layout; it does **not** exercise the media queries. Every responsive claim made
during 4.3.7 is bounded by this and was stated as such at the time.

*Closes with:* a real-device pass at all three widths across the new surfaces — the onboarding wizard and
step 5 reveal, the Home recommendation line, and the Train suggestion card.

**C · Google signup attribution — analytics precision debt, NOT a closure blocker.**
4.3.7G attributes `signup_completed:google` **by elimination**: `signInWithOAuth` navigates away before
`auth.html` can observe completion, and threading a marker through `redirectTo` would mean changing a URL
that must stay in Supabase's allow-list. It relies on the dedupe set to suppress the event when the email
path already fired.

*Known error mode:* over-attributes to `google` when an **existing incomplete** account signs in with a
draft present. It **cannot under-count**, and **never mislabels email**. This affects a funnel dimension,
not product behaviour, correctness or user data.

*Closes with:* a `redirectTo` change plus the matching Supabase allow-list update — deliberately not done
inside 4.3.7, because changing an auth redirect for a telemetry nicety is a poor risk trade.

## 10.12 Dead `profiles.tier` column — **LOW, latent**

Recorded 2026-09-02. `profiles.tier` defaults to `'free'` and **no reader performs access control with
it** — access is resolved solely by `entitlement-core.js` over `purchases`, with RLS beneath. Inert today;
the risk is a dormant second access concept inviting a future change to consult the wrong source. **Owned
by 4.5.12**, decided alongside 4.5.3 enforcement rather than in isolation.

## 10.13 Validation debt and activation

Open validation debt **may run parallel to construction and does not block starting 4.4. It does block
activation.** **4.5-A cannot be recorded complete while any item below lacks an explicit recorded
disposition** — measured, waived with a named accepted risk, or launch held. "Non-blocking" never means
"unrecorded".

**4.3.5 stays OPEN throughout.** The 2026-09-02 exception (§4) lets its debt run in parallel with 4.4,
4.3.9-L, 4.5-I and 4.3.8; it closes nothing and weakens no requirement. **VD-C in particular remains open
unless 4.3.5K's canonical acceptance criteria are demonstrably met and recorded — it is never closed by
inference from qualitative observation.**

| ID | Item | Blocks starting 4.4? | Blocks 4.5-A? | Required disposition |
|---|---|---|---|---|
| **VD-A** | iOS standalone-PWA OAuth (§10.11A) | No | **Yes** | Physically passed on a real iPhone, or explicitly waived with the named accepted risk (the user re-answers the wizard; never data loss) |
| **VD-B** | Real responsive / media-query validation at 320 · 390 · 430 (§10.11B) | No | **Yes** | Validate onboarding, the value reveal, Home, Train, and the first-run surfaces on real representative viewports or devices |
| **VD-C** | Android PWA install validation (§10.6) | No | **Yes unless proven** | Remains open unless 4.3.5K's canonical acceptance criteria are demonstrably met and recorded; otherwise blocks until explicitly ruled |
| **VD-D** | 4.3.5F instrumented Android navigation performance (§10.8) | No | **Explicit ruling required** | Measured · waived with named risk · or launch held. **Silence is not an allowed outcome.** |
| **VD-E** | Google signup attribution precision (§10.11C) | No | No | Remains recorded; does not block activation unless later evidence changes the risk |
| **VD-F** | Existing keyboard-dictation input path | No | **Yes** | On a real iPhone, use Apple keyboard dictation inside Quick Log for representative single-food and multi-item meal phrases; confirm the resulting text enters the existing pipeline and remains editable before logging. **This validates an existing path; it is not a new product feature.** |

VD-A, VD-B, and VD-F are all physical-iPhone checks and should be performed in one session.

# 11. PROTECTED FUTURE COMMITMENTS

These are explicitly retained. They may **move between phases with approval**. They may **not** silently
disappear.

Removal requires an explicit line: **`CANCELLED — YYYY-MM-DD — reason`**. Never silent deletion.

**Preservation audit, 2026-09-02.** All 77 commitments below were individually mapped during the roadmap
optimization: **77 of 77 accounted for · 0 cancelled · 0 silently reassigned.** The seven that changed
owner are annotated inline below; the decision record is `docs/ROADMAP-HISTORY.md`, 2026-09-02.

- dashboard customization
- optional Carbs/Fat on Home
- Calories + Protein default
- user accent colors
- shared swipe actions
- swipe-to-delete
- accessible alternatives to every gesture *(5.0.4 — delivered in the 4.8 opening checkpoint, 2026-09-02)*
- exercise detail surfaces
- exercise media, video, muscle diagrams
- favorite and recent exercises
- exercise substitutions
- previous workout performance
- progressive overload
- equipment-aware increments
- warm-up support
- per-set / pyramid progression
- training analytics (volume by muscle, weekly sets, MEV/MAV/MRV)
- timed training
- HIIT
- circuits
- hybrid workouts
- active-workout renaming (session name distinct from the source template/routine/program)
- exercise reordering (shared long-press/drag pattern in builders and active workouts, with an
  accessible Move Up / Move Down alternative) *(4.8.12 — now consumes the 4.8 opening checkpoint,
  2026-09-02)*
- habits
- steps
- water
- sleep
- body-fat tracking
- progress photos
- reminders and notifications
- Saved Meals 2.0 (rename, edit contents, add/remove foods, change serving sizes, organization)
- nutrition favorites
- recent foods
- richer nutrition (carbs/fat, micronutrients)
- macro-aware meal recommendations
- restaurant / composed-dish coverage *(split 2026-09-02 — common launch language is a 4.5.17 coverage
  stratum and is pre-launch; comprehensive intelligence remains 5.4.11)*
- nutrition hardening backlog
- portion-correction persistence
- meal-context confidence gating
- voice food logging
- photo food logging
- recommendation catalog coverage — bodyweight / no-equipment Program · women's full body + glutes
  Program · women's bodyweight Program · Glute Builder repositioned as the specialization
  (4.3.6K.1) *(scheduled 2026-09-02 as **4.3.9-L**, launch-blocking; the women's bodyweight Program is a
  required commitment, not optional)*
- ranked shortlist recommendation UI — one primary "Recommended for You" plus "See other options",
  ordered by the engine over real onboarding inputs and catalog metadata, never hand-curated and never
  branched on gender (4.3.6K.2) *(scheduled 2026-09-02 as **4.3.9F**, launch-blocking)*
- AI workout generation
- AI Coach action tools
- Coach cost governance
- Coach evaluation harness
- Personal Knowledge Graph
- preference learning
- adaptive coaching
- daily / weekly / monthly check-ins
- plateau detection
- plan adjustment recommendations
- account deletion and data export
- client/API error monitoring
- billing recovery / dunning
- pre-launch security review *(4.5.12 — also owns §10.10, §10.12, and the brittle-test review pass,
  2026-09-02)*
- accessibility regression requirements
- Apple Health
- Android health integration
- wearables
- community
- referrals
- trainer notes
- trainer portal
- admin role / platform control
- program / coach marketplace
- team coaching
- corporate wellness
- business analytics
- premium / high-touch coaching
- planned Home Strength and Full Gym Strength programs *(scheduled 2026-09-02 as **4.3.9X.1** and
  **4.3.9X.2**, post-launch — they deepen an already-served catalog rather than closing a coverage
  failure)*
- public lead-generation surfaces (landing, store, calculator, free guide, About, Pricing, Contact)
- voice Coach *(7.0 — distinct from 5.4.7 voice food logging; never conflate the two)*
- computer vision
- multimodal Coach
- future native-mobile consideration

---

# 12. ROADMAP GOVERNANCE

## 12.1 Authority
`docs/ROADMAP.md` is the only authoritative roadmap. Every other document is rationale or implementation
detail.

## 12.2 Historical record
`docs/ROADMAP-HISTORY.md` is append-only. Add one record whenever a phase closes:
date · phase · status · merge SHA · major shipped scope · deferred-out scope · exit-criterion result.
Never rewrite history to make it look cleaner. Never written automatically by CI.

## 12.3 Who may change what

**Claude may, without separate approval:**
- identify and record a newly discovered dependency
- place a clearly fitting minor requirement into an existing phase
- correct a factual shipped / not-shipped status
- mark an approved exit criterion completed

**Claude may NOT, without Effi's explicit approval:**
- reorder phases
- renumber phases
- create major new phases
- delete protected commitments
- change monetization timing
- change free/paid boundaries
- materially redefine product strategy

ChatGPT recommendations are proposals until Effi approves them.

## 12.4 Roadmap-change commits
Material roadmap changes belong in a dedicated docs commit, not hidden inside feature implementation.
Style: `docs(roadmap): <what changed>`.

## 12.5 Phase closure
A phase is not closed until: its defined blocking scope is complete · required tests pass ·
`npm run verify` is green · required real-device/production checks are done · the explicit exit criterion
is satisfied · `docs/ROADMAP-HISTORY.md` is updated.

## 12.6 Superseded documents
Do not delete useful architecture or design docs. Banner them:

> **SUPERSEDED FOR ROADMAP NUMBERING.**
> The canonical roadmap is `docs/ROADMAP.md`. This document remains available for historical rationale and
> implementation detail, but its phase numbering must not be used for planning.

## 12.7 Phase preflight — "should we build this now?"

Before planning **how** to build any future phase, its preflight must first prove:

1. The phase should be built now.
2. Its prerequisites exist.
3. Its affected product surfaces are stable enough.
4. A later phase is unlikely to force a substantial rebuild.
5. A smaller scope cannot achieve the required user or launch outcome.
6. Its expected value justifies its implementation and maintenance cost.
7. Relevant real-user evidence has been considered.
8. Deferring it would create more risk than building it now.

Only once these pass may the work move from **"Should we build this now?"** to **"How should we build
it?"** Added 2026-09-02, after a full implementation plan for 4.3.8 was produced before anyone asked
whether 4.3.8 belonged next.

---

# 13. EXECUTION ORDER

## Complete

| Phase | Name | Status |
|---|---|---|
| 4.2 | Core Feature Reliability (nutrition + exercise) | COMPLETE |
| 4.3.1 | PWA Install Foundation | COMPLETE |
| 4.3.2 | Service Worker & Update Safety | COMPLETE |
| 4.3.3 | Install Onboarding & Update UX | CLOSED |
| 4.3.4 | Dashboard 2.0 & App Navigation | CLOSED |
| 4.3.6 | Programs, Routines & Train Architecture | CLOSED |
| 4.3.7 | Personalized Onboarding & Value Engine | CLOSED |

## Still open

### **4.3.5 — Mobile UX & App-Shell Hardening** · **OPEN, NOT CLOSED**

Implementation is merged and accepted. The phase stays open on **4.3.5F instrumented Android
navigation-performance measurement**, deferred by an external hardware-access dependency, **plus any
unresolved 4.3.5-owned acceptance criterion tracked in §10.13 — including VD-C unless demonstrably
satisfied.** Targets unchanged and still binding — see the 4.3.5 status block and §10.8.

**Owner-approved sequencing exceptions.** *(2026-08-20)* 4.3.6 could begin in parallel. *(2026-09-02)*
4.3.5's validation debt may also run in parallel with **4.4, 4.3.9-L, 4.5-I and 4.3.8**, with every
activation-relevant item receiving its §10.13 disposition before 4.5-A. Neither exception closes 4.3.5,
weakens a requirement, or permits unrelated phases to overlap.

## Next — pre-launch critical path

Reordered 2026-09-02. Rationale and binding gates G1–G6 are in §4.

| # | Phase | Classification |
|---|---|---|
| 1 | **4.4** — Personal AI Coach v1, Read-Only | LAUNCH-BLOCKING |
| 2 | **4.5-I** — Pre-Activation Build & Certification (all activation flags OFF) | LAUNCH-BLOCKING |
| 3 | **4.3.8** — Interactive First-Run Experience | LAUNCH-BLOCKING |
| 4 | **4.5-A** — Paid-Only Activation | LAUNCH-BLOCKING |

**Parallel, gated:** **4.3.9-L** Recommendation Catalog Coverage (§4.3.9; G1 makes it an early-4.4
dependency, not an independent track with slack) · **validation-debt closure** VD-A through VD-F (§10.13).

## Then, in order — post-launch

| # | Phase |
|---|---|
| 4.6 | Notifications & Accountability |
| 4.7 | AI Coach Action Tools |
| 4.8 | Training Engine 2.0 — Timed / HIIT / Circuit / Hybrid — *opens by delivering 5.0.3 and 5.0.4* |
| 4.9 | Personalization — *4.9.2 consumes the same shared gesture foundation* |
| 4.3.9-X | Program Catalog Depth — Home Strength · Full Gym Strength |
| 5.0 | Advanced Mobile Interaction Polish — *5.0.1, 5.0.2, 5.0.5* |
| 5.1 | Smart Training 2.0 / Advanced Progression |
| 5.2 | Habits & Daily Health |
| 5.3 | Body Composition & Visual Progress |
| 5.4 | Nutrition 2.0 |
| 5.5 | Adaptive AI Coaching |
| 5.6 | Health & Wearable Integrations |
| 5.7 | Native Mobile Evolution |
| 6.0 | Community |
| 6.1 | Referrals & Growth Loops |
| 6.2 | Trainer / Admin Tools |
| 6.3 | Trainer Portal |
| 6.4 | Program / Coach Marketplace |
| 6.5 | Team Coaching |
| 6.6 | Corporate Wellness |
| 6.7 | Business Analytics & Automation |
| 7.0 | Voice Coach |
| 7.1 | Computer Vision |
| 7.2 | Multimodal Coach |

## Priority rule

- **P0** — blocking bugs, data integrity, auth, payments, security. Fix immediately.
- **P1** — the commercial critical path: `4.4 → 4.5-I → 4.3.8 → 4.5-A`, plus the parallel gated
  4.3.9-L and validation-debt tracks.
- **P2** — improvements directly supporting activation or retention; pull forward only when they
  materially support the current phase.
- **P3** — post-launch expansion, 4.6 onward.
- **P4** — long-range bets: community, marketplace, computer vision, corporate wellness.

Do not let P3/P4 work derail P0/P1.

---

# 14. CRITICAL SEQUENCING DECISIONS

**UX first.** Known navigation, picker, scrolling, routing, and shell problems are fixed before premium
complexity is stacked on top of them.

**Programs before personalization.** The recommendation engine needs a coherent content system to
recommend from.

**Personalized onboarding before Coach.** Coach requires structured user context; the onboarding/value
engine becomes part of the Coach's context foundation.

**Product tour before paid launch, but after the product it teaches.** Revised 2026-09-02: 4.3.8 runs
after 4.4 and 4.5-I, which change the navigation, Home, entitlement and routing surfaces it describes.

**Coach before the hard paywall.** The paid offer launches when its strongest differentiator is real
rather than "coming soon." Entitlement and payment infrastructure may be built earlier behind flags; the
consumer gate activates only at 4.5.13.

**Read-only Coach before action-capable Coach.** First *understand → explain → recommend*; then
*modify → save → schedule → act*. Write-capable AI carries a higher safety and trust threshold.

**Notifications before Coach reminder actions.** Coach cannot schedule into a system that does not exist.
4.6 builds the one reminder infrastructure; 4.7 calls it.

**Substitution engine before Coach swaps.** 4.3.6I is deterministic and reusable; 4.7.5 calls it rather
than inventing replacements.

**Training Engine before advanced progression.** Timed, duration, and distance structures change the
underlying workout/set model; advanced progression must build on the final training representation, not be
invalidated by it.

**Smart Training extends, never rebuilds.** Previous-performance display and partial progression logic are
already shipped and working.

**Timed training does not block launch.** The existing strength product plus a personalized Coach is
sufficient for the initial premium launch; HIIT and circuit work expands the addressable product
afterward.

---

# 15. NORTH-STAR EXPERIENCE

A person tells Muscle Motivation who they are and what they want.

Muscle Motivation builds the plan.

Home tells them what matters today.

Train knows their program and what they did last time.

Nutrition knows their targets and makes logging simple.

Progress shows what is actually changing.

Coach already understands the context when they ask a question.

Over time the product learns their patterns, notices stalls, suggests appropriate changes, and — when
explicitly permitted — takes useful actions.

The user should never feel like they are manually operating several unrelated fitness tools. They should
feel like they have **one intelligent coaching system moving the process forward.**

---

*End of `docs/ROADMAP.md`. This document is authoritative for roadmap numbering, sequencing, scope, and*
*protected commitments. Changes follow §12 governance.*
