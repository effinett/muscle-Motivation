# Nutrition Evaluation Suite (Phase 4.2.9)

A broad, repeatable, **diagnostic** evaluation of the whole nutrition-intelligence
pipeline. It runs the exact production pure seams (`food-core.js`,
`food-ranking.js`, `food-memory.js`, `food-meal.js`, `food-portion.js`,
`food-display.js`) over canned USDA pools, so it measures **production behavior**
— never a re-implementation. Deterministic, offline, no network, no DB, no keys,
no writes to production data.

This is the report to run **before every nutrition release**.

```bash
npm run eval:nutrition                 # run, apply the release gate, write artifacts
node nutrition-evaluation/runner.js --no-gate          # always exit 0
node nutrition-evaluation/runner.js --json             # machine JSON to stdout
node nutrition-evaluation/runner.js --update-baseline  # RECORD a new baseline (explicit)
node nutrition-evaluation/runner.js --prod-changed     # mark productionLogicChanged in the report
```

Artifacts are written to `reports/nutrition-evaluation/latest.{md,json}` (git-ignored;
regenerated each run). The durable record is the committed `baseline.json`.

## Why 100% is not the goal

This suite is a **measurement instrument**, not a target. A lower but honest
baseline is more valuable than an artificially perfect one. **Do not change
ranking/parsing/retrieval/confidence logic merely to make a new case pass.**
Fixtures encode expected *semantics*; where production diverges, that divergence
is recorded (as a scored failure or an `informational` triaged case) and pointed
at a future hardening phase — it is not papered over by weakening the expectation.

## Categories

| Category | What it checks | Primary seam |
|---|---|---|
| `parsing` | raw text → structured intent (deterministic post-parse only) | `nuDetectFromRawText`, `nmNormQuery` |
| `retrieval` | is an acceptable candidate retrieved (and within top-N) | raw + ranked pool |
| `ranking` | is the best candidate ranked **first** | `rankFoodCandidates` |
| `confidence` | is confidence calibrated (and never confidently wrong) | `nuAssessConfidence` |
| `clarification` | does it ask when — and only when — it should | `nuAssessConfidence` |
| `portion` | vague + exact portion interpretation | `nuInterpretVaguePortion`, resolver |
| `meal` | meal-level reasoning over the parsed items | `nuBuildMealContext` |
| `correction` | correction memory (via the `options.signals` seam) | `nmCorrectionSignal` |
| `display` | presentation output (labels, serving, aria) | `buildFoodDisplay` / `buildLogDisplay` |
| `regression` | a permanent pin of a historical fix (declares `via` + `phase`) | any of the above |

> **AI parsing is not deterministic.** `/api/ai-food-parse` uses the Claude API,
> so meal *split/merge* and free-text → items is **out of scope** for this
> deterministic suite (a future optional live tier can cover it with a key). The
> `parsing`/`meal` categories score the pure seams that shape and reason about
> already-parsed intent.

## Preferred vs acceptable candidates

- `preferredCandidateId` — the single objectively-best record. Feeds **Top-1
  accuracy** (only cases with a preferred candidate count toward Top-1).
- `acceptableCandidateIds` / `acceptableNameRegex` — the set of
  semantically-valid records. The top result matching this set is a pass and
  feeds **acceptable-candidate accuracy**. Use this when several USDA records are
  equally valid — do **not** force one arbitrary id.
- `topNotRegex` — a forbidden top result (e.g. a mayo query must not top a bean).

## Metrics (see `metrics.js`)

Top-1 accuracy · acceptable-candidate accuracy · retrieval recall@1/3/5/10 ·
clarification precision/recall · **false-confidence rate** (confidently resolved
but wrong — a headline safety metric) · portion accuracy · meal case+item
accuracy · parsing case+field accuracy · display accuracy · per-category
breakdown. Every rate reports `n/d`.

**Confidence threshold:** a resolution is "confident" when
`nuAssessConfidence` returns disposition `auto_resolve` **or** level `high` — the
current production auto-pick boundary. A case marks `wrongIfConfident: true` when
that confident answer is semantically wrong; those cases drive the
false-confidence rate.

## Diagnostic staging (earliest failure wins)

Every failure is assigned the **earliest** pipeline stage that explains it
(`diagnostics.js`), so one upstream failure is not cascaded into several
misleading downstream ones. If the correct candidate was never retrieved, it is
`retrieval` — not `ranking`. Author-triaged terminal stages
(`external-data-ambiguity`, `multiple-acceptable`, `production-defect`) can be
declared on a case via `diagnosticStage`.

## Adding a case

1. Pick the category and add the case to `fixtures/<category>.js`.
2. Give it a **stable, unique** slug `id`.
3. Provide `input` and the category's `expected` sub-object (see existing cases).
4. If a candidate query is involved, ensure a canned pool exists — extend
   `pools.js` (never edit `benchmarks/fixtures.js`, the frozen 121-case corpus).
5. Prefer `acceptableNameRegex` over a bare id when several records are valid.
6. Add `tolerances` for numeric expectations that shouldn't require exact equality.
7. Run `npm run eval:nutrition --no-gate` and confirm the case behaves as intended.
8. `npm test` — the schema test validates the whole suite (unique ids, shapes).

A case that documents a **known gap** should be `informational: true` (kept out
of the scored pass-rate and the release gate) with a `diagnosticStage` and
`notes`. A still-open historical gap is additionally `known_fail: true`.

## Baseline

`baseline.json` is a committed, versioned snapshot (SHA, schema/case-set version,
metrics, per-case pass+stage). Runs compare against it and surface added/removed
cases, changed outcomes, regression flips, and metric movement. It is **never
overwritten automatically** — update it deliberately with
`node nutrition-evaluation/runner.js --update-baseline` after reviewing the diff.
A concise human summary lives in `BASELINE.md`.

## Release gate (default)

`npm run eval:nutrition` exits non-zero when:

- fixture validation fails, or any case crashes → exit **2**
- a non-informational `regression` case fails → exit **1**
- a committed metric moves past **1.0 pct** in its **regression direction** vs the
  baseline → exit **1**
- a `regression` case flips pass→fail vs the baseline → exit **1**

Newly-added, non-regression failures are **informational** until reviewed — the
broader new baseline is diagnostic, not a strict all-cases-must-pass gate.

### Metric direction (Phase 4.2.11)

The metric gate is **direction-aware** (`gate.js`). Each committed metric has an
explicit direction — never guessed from its name:

- **higher_is_better** — overall, top-1, acceptable, recall@1/3/5/10,
  clarification precision/recall, portion, meal (case/item), parsing
  (case/field), display. A **drop** past tolerance fails.
- **lower_is_better** — **false-confidence rate** (a rate of "confidently
  resolved but wrong"). A **rise** past tolerance fails. (Before 4.2.11 the gate
  assumed every metric was higher-is-better and silently missed a worsening
  false-confidence rate.)

An **undeclared** metric fails safe: any movement past tolerance is a gate
failure asking the author to declare its direction in `gate.js`. Adding a future
lower-is-better metric is a one-line entry there. Covered by
`nutrition-eval-gate.test.js`.

## Local & CI verification

`npm run verify` is the canonical pre-commit / pre-release gate and runs, in the
same order CI does:

1. `npm test` — unit suite
2. `npm run eval:nutrition` — nutrition evaluation (gated)
3. `npm run bench:food:strict` — strict, **fixture-only** food benchmark (121)
4. `npm run bench:exercise:strict` — strict exercise benchmark (188)

`bench:food:strict` passes `--strict --fixture-only`, so the required food
benchmark **never touches the network** — live-tier cases are skipped even if a
`USDA_API_KEY` secret is later added to the repo/org (env `BENCH_FIXTURE_ONLY=1`
is equivalent). The non-strict `npm run bench` / `bench:food` and the
`npm run bench:food:live` command remain for **exploratory** live-USDA sanity
checks — they are **never** a required gate. CI (`.github/workflows/ci.yml`,
check name **`verify`**) runs this same sequence on every PR to `main` and push
to `main`, and **never** runs `--update-baseline`.

## Baseline governance

> The evaluation suite is a **measurement instrument, not a case-count target.**

`baseline.json` is **never** overwritten automatically. `--update-baseline` is
permitted **only** when **all** of the following hold:

1. The intended behavior is actually implemented (not a fixture tweak to go green).
2. Every new behavior is represented by **reviewed** cases.
3. The full `npm run verify` gate is green.
4. Metric movement is understood and explained.
5. No regression is hidden (nothing was quietly flipped to `informational` /
   `known_fail` to dodge the gate).
6. The baseline diff was reviewed.
7. `baseline.json`, `BASELINE.md`, and (for milestones) `HISTORY.md` are committed
   **in the same change** as the behavior.
8. Baseline updates are done **locally and deliberately** — **never** in CI.

Treatment of specific situations:

- **New scored cases** — allowed; must be reviewed; appear as `added` in the diff.
- **Removed cases** — require justification (why the behavior no longer matters).
- **Informational cases** — promote to scored once behavior is confirmed; do not
  park a real regression as informational.
- **Known failures (`known_fail`)** — when one starts passing the runner shouts
  "NOW PASSING / promote"; promote it to a scored `regression` pin.
- **Stale / incorrect expectations** — fix the fixture (as 4.2.10b did with the
  stale `conf-coffee` case), documented in the diff — never weaken an expectation
  merely to pass.
- **Metric improvements** — fine; record the reason.
- **Intentional metric decreases** — allowed only with an explicit, reviewed
  rationale in the commit and a `HISTORY.md` row.
- **Baseline diffs** are always reviewed before `--update-baseline`.

This section is the **authoritative** baseline-governance policy. Other docs
(`CLAUDE.md`, `HISTORY.md`) point here rather than restating it.

## Production-failure → regression workflow

The smallest repeatable way to convert a real production defect into a permanent
regression case. Not every defect needs its own candidate pool — reuse existing
`pools.js` / `benchmarks/fixtures.js` pools whenever they already express it.

1. **Capture** the exact input and the observed vs expected behavior.
2. **Sanitize** — strip personal/sensitive data (user ids, emails, free-text notes).
3. **Reproduce** through a pure test or evaluation seam (`--no-gate` run or a
   benchmark case) — never against production.
4. **Categorize** — pick the correct category (parsing/retrieval/ranking/
   confidence/clarification/portion/meal/correction/display), or `regression`
   with `via` + `phase`.
5. **Pool** — add the smallest realistic candidate pool **only if** existing
   fixtures can't express it.
6. **Add a failing `reg-*` case** before or with the fix.
7. **Fix the shared subsystem** (`food-*` / `exercise-*`), never one feature surface.
8. **Run `npm run verify`** — the whole gate must go green.
9. **Update the baseline** only under the governance policy above.
10. **Add a `HISTORY.md` milestone** only when the fix is meaningful.

### Regression-case template

```jsonc
{
  "id": "reg-<slug>",            // stable, unique
  "phase": "4.2.11",             // phase that added/fixed it
  "category": "regression",
  "via": "<ranking|confidence|display|retrieval|…>",
  "source": "production-YYYY-MM-DD",   // where it came from
  "input": { "query": "…", "brand": null, "quantity": 1, "unit": null },
  "pool": "<pools.js pool ref, or inline minimal candidates>",
  "expected": { "…": "…" },      // resolved fields / choices for the category
  "expectedDisposition": "<auto_resolve|choose_candidate|clarify|unresolved>",
  "ambiguityReason": "<why it's ambiguous, if a clarification case>",
  "why": "one line: the real defect this pins",
  "sanitized": true              // privacy/sanitization confirmation
}
```

## Files

```
schema.js       case shape + fixture validation
pools.js        canned pools (reuses benchmarks/fixtures.js + extensions)
engine.js       wires the production pure seams (the measured boundary)
scoring.js      per-category scorers
diagnostics.js  earliest-failure-stage classification
metrics.js      metric aggregation
report.js       human (md) + machine (json) report
baseline.js     baseline snapshot + comparison
gate.js         metric-direction contract for the release gate (Phase 4.2.11)
runner.js       load → validate → score → report → gate
fixtures/       one file per category (+ regressions manifest)
baseline.json   committed baseline (durable record)
BASELINE.md     concise checked-in baseline summary
HISTORY.md      append-only approved-milestone timeline (Phase 4.2.11)
```
Tests: `nutrition-eval-schema.test.js`, `nutrition-eval-scoring.test.js`,
`nutrition-eval-report.test.js`, `nutrition-eval-gate.test.js` (repo root, run by
`npm test`).
