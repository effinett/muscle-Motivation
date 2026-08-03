# Nutrition Evaluation — Metric History

Append-only timeline of **approved** nutrition-evaluation baseline milestones.
This complements the two point-in-time records:

- `baseline.json` — the current machine-readable committed baseline.
- `BASELINE.md` — the current human-readable snapshot.

`HISTORY.md` is the timeline across those snapshots.

**Rules (see `README.md` → "Baseline governance"):**

- Append-only under normal operation; earlier rows are not rewritten.
- Manually reviewed; added only alongside an **approved** `--update-baseline`.
- **Never written automatically by CI.**
- Record only meaningful milestones, not every intermediate run.
- Never invent unavailable values — mark unverifiable historical figures `n/a`.

> The evaluation suite is a measurement instrument, not a case-count target.

Values below are drawn only from committed repository records
(`baseline.json`, `BASELINE.md`, `CLAUDE.md` §10) and observed strict benchmark
runs on the recorded corpus. Figures that predate a record are marked `n/a`.

| Date | Phase | Commit SHA | Cases (total / scored) | Overall | False-confidence | Clarification P/R | Display | Food bench | Exercise bench | Reason for the baseline change |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-07-30 | 4.2.9 | `47b9736` | 237 / 229 | 99.6% (228/229) | 5% (1/20) | n/a | n/a | n/a | n/a | Evaluation foundation: first committed baseline for the `nutrition-evaluation/` diagnostic suite. One documented open item (bare "coffee" false-confidence) deferred to a confidence-hardening phase. |
| 2026-08-02 | 4.2.10b | `c837e587` | 288 / 286 | 100% (286/286) | 0% (0/31) | 100% (7/7) / 100% (7/7) | 100% (76/76) | 121/121 | 188/188 | Path C material-ambiguity confidence + explicit-family consistency + polarity/parenthetical ranking fixes. Stale `conf-coffee` fixture corrected (false-confidence 5% → 0%). New `p10b-*` multi-candidate pools. |

Notes:

- The 4.2.9 food/exercise benchmark totals are `n/a` — the benchmark corpora
  were not recorded in the eval baseline at that SHA. The 4.2.10b food/exercise
  totals reflect the current committed corpora
  (`benchmarks/resolve-cases.jsonl`, `benchmarks/exercise-cases.jsonl`) run in
  strict fixture-only mode.
- Phase **4.2.11** (this checkpoint) is **CI & governance only** — it added
  automatic enforcement, a direction-aware metric gate, deterministic
  fixture-only benchmarking, and this history file. It **did not** change the
  committed baseline, so it adds **no new baseline row** (only this note).
