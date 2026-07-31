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
- a committed metric regresses more than **1.0 pct** vs the baseline → exit **1**
- a `regression` case flips pass→fail vs the baseline → exit **1**

Newly-added, non-regression failures are **informational** until reviewed — the
broader new baseline is diagnostic, not a strict all-cases-must-pass gate.

Release verification runs `npm test`, `npm run bench` (121), `npm run bench:exercise`
(188), and `npm run eval:nutrition` together.

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
runner.js       load → validate → score → report → gate
fixtures/       one file per category (+ regressions manifest)
baseline.json   committed baseline (durable record)
BASELINE.md     concise checked-in baseline summary
```
Tests: `nutrition-eval-schema.test.js`, `nutrition-eval-scoring.test.js`,
`nutrition-eval-report.test.js` (repo root, run by `npm test`).
