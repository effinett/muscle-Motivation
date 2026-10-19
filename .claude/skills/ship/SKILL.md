---
name: ship
description: Build a task end to end and ship it as a pull request — branch, implement, run npm run verify, commit, push, open the PR, report. Use when Effi says "ship", "/ship <task>", "build X and open a PR", or asks to address review comments on a PR.
---

# /ship — task to pull request, hands-off

Follow `AGENTS.md` §8.1 (ship workflow) and §8.2 (short report). This skill is only the checklist;
the rules live in `AGENTS.md`.

**Input:** the task in plain words (`$ARGUMENTS`), a roadmap phase ("next phase", "4.4"), or
"review on PR #N".

## Steps

1. **Understand.** If it names a phase or says "next", read `docs/ROADMAP.md` §13 and the phase
   entry. Read the relevant code and the matching section of `docs/architecture.md`.
2. **Decide if a plan approval is needed.** Only for work in §3's "get approval first" list
   (deleting features or files, schema, auth, payments, edits across many files) or a genuine product
   decision. If so, post a short plan and stop. Otherwise go straight on — don't ask.
3. **Branch** from fresh `main`: `git -C <repo> fetch origin`, then
   `git -C <repo> switch --no-track -c <type>/<short-name> origin/main`.
4. **Implement** with surgical edits; add or update tests.
5. **Verify:** `npm run verify` until green. Never update baselines to force it. If it cannot be
   made green honestly, stop and report.
6. **Commit** with a conventional message matching recent `git log` style.
7. **Push and open the PR:** `git -C <repo> push -u origin <branch>`, then `gh pr create --base main`
   (if `gh` isn't logged in, use the GitHub MCP `create_pull_request`). The PR body is the §8.2
   short report.
8. **Report** in chat: the §8.2 short report plus the PR link. **Never merge.**

## Addressing review comments ("review on PR #N")

Read the PR's review comments yourself (`gh pr view N --comments` or the GitHub MCP
`pull_request_read`). Fix what's valid on the same branch, push, and reply on the PR saying what you
fixed and what you disagreed with and why. Don't ask Effi to paste anything.

## Always stop and ask for

Merging, deploys, Supabase migrations or data writes, Stripe writes, env vars or deploy config,
package installs, and deletes. Ship everything else as the PR and ask for that one step.
