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

> **Stability → Training/content architecture → Personalization → Product education →
> Personal AI Coach → Paid launch → AI actions → Product expansion**

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

Never change ranking, parsing, retrieval, or confidence logic merely to make a case pass. A lower honest
baseline beats an artificially perfect one. The authoritative policy is `nutrition-evaluation/README.md`.

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

> **4.3.5 → 4.3.6 → 4.3.7 → 4.3.8 → 4.4 → 4.5**

**Sequencing exception in force (owner-approved 2026-08-20):** the order above is unchanged, but 4.3.5 and
4.3.6 may currently **overlap** — 4.3.6 implementation may begin while 4.3.5 stays open on its outstanding
4.3.5F Android measurement. This is a one-off exception for a single external hardware dependency; it is
not a general licence to start phases early, and no other pair of phases may overlap without separate
approval.

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

## PHASE 4.3.6 — PROGRAMS, ROUTINES & TRAIN ARCHITECTURE

**Goal:** make Programs first-class, create one coherent reusable training-content architecture, and
complete the Train surface capabilities that earlier exercise phases left unbuilt.

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

## PHASE 4.3.7 — PERSONALIZED ONBOARDING & VALUE ENGINE

**Goal:** understand the user and deliver meaningful personalized value *before* asking for money.

### 4.3.7A — Tell us about you
Collect only what has a product use: height · weight · optional body-fat % · goal · activity level ·
training days · experience · training preferences · lifestyle constraints · nutrition preferences ·
intended rate of progress · gym access.

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

> **EXIT CRITERION:** a first-time user understands the core product without external help.

---

## PHASE 4.4 — PERSONAL AI COACH v1 — READ-ONLY

**Goal:** build the core premium differentiator.

### Coach v1 read-only contract (binding)

**Coach v1 MAY:** read · understand · analyze · explain · recommend.

**Coach v1 MAY NOT:** directly modify stored user data — no writing, editing, or deleting logs, goals,
plans, routines, or reminders; no scheduling; no silent mutation of any user state.

Write-capable behavior begins in **Phase 4.7**, behind its own safety contract. Do not anticipate 4.7 by
adding "just one" write tool to 4.4.

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

**Goal:** commercialize only after the premium value is real. Infrastructure and offer surfaces may be
built earlier behind flags; the consumer paywall activates here.

### 4.5.1 — Subscription-state extension
Use the entitlement model defined in **4.3.6L**. Explicitly reconcile the existing purchase/subscription
storage rather than creating a duplicate source of truth for money or access.

Support: trialing · active · grace / past due · cancelled but active through period end · expired.

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

### 4.5.13 — Paid-only production launch
Activate mandatory subscription/trial access to the protected consumer application.

> **EXIT CRITERION:** the full journey works — **Discover → Personalize → Understand → Subscribe → Use →
> Receive ongoing Coach value.**

---

# 5. POST-LAUNCH APPROVED ORDER

> **4.6 → 4.7 → 4.8 → 4.9 → 5.0 → 5.1**

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
- **4.6.8 — Habit reminders** (coordinates with 5.2 when habits ship).
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

- **5.3.1 — Weight history expansion.**
- **5.3.2 — Body-fat logging.**
- **5.3.3 — Progress photos.** Secure user storage.
- **5.3.4 — Comparison UX.** Meaningful comparison over time.
- **5.3.5 — Coach context.** Coach may use trends but must **not** make unsupported visual
  body-composition claims.

## PHASE 5.4 — NUTRITION 2.0

- **5.4.1 — Favorites.** · **5.4.2 — Recent foods.**
- **5.4.3 — Saved Meals 2.0** *(full approved scope)*: rename saved meals · edit saved-meal contents · add
  foods · remove foods · change serving sizes · improved organization. Gesture polish arrives via 5.0.
- **5.4.4 — Rich macro view.** Carbs, fat, and more detail where useful.
- **5.4.5 — Micronutrient expansion.** Only where source data is reliable and the UX adds real value.
- **5.4.6 — Meal templates / patterns.**
- **5.4.7 — Voice food logging.** Speech → the existing shared food-resolution core; user confirms. A new
  input surface, not new intelligence.
- **5.4.8 — Photo food logging.** Photo → vision → food-resolution core → meal reasoning → portion
  intelligence → correction memory → confirmation → log. All estimates labeled as estimates.
- **5.4.9 — Coach-nutrition integration.** Coach reasons over nutrition data without inventing intake or
  treating uncertain estimates as exact.
- **5.4.10 — Macro-aware meal recommendations.** Next best meal from remaining macros · calories · meal
  timing · workout timing · preferences · adherence · restaurant/context data where reliable.
- **5.4.11 — Restaurant / composed-dish coverage.** Improve coverage where the current food database is
  structurally weak — USDA has no generic composed "salad" record, a limitation the evaluation suite
  already measures and records honestly.
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
gesture-conflict constraint and 5.0.4's accessible-alternative requirement — reconcile with those owners
before implementing, so only one touch-gesture layer is built.

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

---

# 11. PROTECTED FUTURE COMMITMENTS

These are explicitly retained. They may **move between phases with approval**. They may **not** silently
disappear.

Removal requires an explicit line: **`CANCELLED — YYYY-MM-DD — reason`**. Never silent deletion.

- dashboard customization
- optional Carbs/Fat on Home
- Calories + Protein default
- user accent colors
- shared swipe actions
- swipe-to-delete
- accessible alternatives to every gesture
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
  accessible Move Up / Move Down alternative)
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
- restaurant / composed-dish coverage
- nutrition hardening backlog
- portion-correction persistence
- meal-context confidence gating
- voice food logging
- photo food logging
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
- pre-launch security review
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
- planned Home Strength and Full Gym Strength programs
- public lead-generation surfaces (landing, store, calculator, free guide, About, Pricing, Contact)
- voice Coach
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

## Next

### **4.3.5 — Mobile UX & App-Shell Hardening** · **OPEN, NOT CLOSED**

Implementation is merged and accepted. The phase stays open on one requirement:
**4.3.5F instrumented Android navigation-performance measurement**, deferred by an external
hardware-access dependency. Targets unchanged and still binding — see the 4.3.5 status block and §10.8.

**Owner-approved sequencing exception (2026-08-20):** **4.3.6 implementation may begin now**, in parallel
with 4.3.5 remaining open. This starts no other phase early, closes nothing, and waives nothing.

## Then, in order

| # | Phase |
|---|---|
| 4.3.6 | Programs, Routines & Train Architecture |
| 4.3.7 | Personalized Onboarding & Value Engine |
| 4.3.8 | Interactive First-Run Experience |
| 4.4 | Personal AI Coach v1 — Read-Only |
| 4.5 | Premium Membership & Paid-Only Launch |
| 4.6 | Notifications & Accountability |
| 4.7 | AI Coach Action Tools |
| 4.8 | Training Engine 2.0 — Timed / HIIT / Circuit / Hybrid |
| 4.9 | Personalization |
| 5.0 | Advanced Mobile Interaction Polish |
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
- **P1** — the commercial critical path: `4.3.5 → 4.3.6 → 4.3.7 → 4.3.8 → 4.4 → 4.5`.
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

**Product tour before paid launch.** Understand how to teach the product before asking every user to pay
for it.

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
