# Repository governance: rulesets, CODEOWNERS and Actions hardening

- **Status:** **Proposed — awaiting owner approval. No repository setting has been changed.**
- **Date:** 2026-11-26 (updated at Phase 1C-0 closure, `develop` = `d4ad427`)
- **Repository:** `husseizo/garage-management-system`. It is **public** and owned by a personal
  account. `husseizo` is the only collaborator (admin) and the only active maintainer.
- **Exact payloads:** `docs/operations/rulesets/*.json`, ready for the Rulesets API (section 3.4).

## 1. Current state (read-only, 2026-11-26)

| Setting                                | Now                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| Branch protection on `main`, `develop` | **None** (`GET …/branches/<b>/protection` → 404 "Branch not protected")                    |
| Rulesets                               | **None** (`GET …/rulesets` → `[]`)                                                         |
| `.github/CODEOWNERS`                   | `* @husseizo` (one line)                                                                   |
| Secret scanning / push protection      | **Disabled** (free for public repositories)                                                |
| Dependabot security updates            | Disabled                                                                                   |
| Default workflow token                 | `read`; workflows cannot approve PRs (good)                                                |
| Allowed actions                        | All; SHA pinning not required; actions referenced by tag (`@v4`)                           |
| Merge methods allowed                  | Merge commit, squash and rebase all enabled; auto-merge off; branches not deleted on merge |
| Environments                           | None                                                                                       |
| Tags                                   | `phase-1b-verified` (annotated), not protected                                             |

A read-only scan of the full git history (2026-11-26) found **no** Neon passwords or credentialed
connection strings. `.env.example` is the only tracked env file.

**Why this matters now.** PR #12 was merged while its only PR run was testing a **stale merge ref**
(`cadc23d`, built on `develop` before #11). Nothing stopped it, because nothing is required. The
post-merge run on `d4ad427` was green, so no harm was done, but the gap is real.

## 2. Exact required status checks

Taken from the successful runs `45798150572` (push) and `45798161369` (pull request) on `d4ad427`.
All three are jobs of workflow `CI` (`.github/workflows/ci.yml`), reported by the **GitHub
Actions** app, `integration_id` **15368**:

| Check name (exact, including the middle dots) | Job key    |
| --------------------------------------------- | ---------- |
| `Typecheck · Lint · Unit/Integration · Build` | `quality`  |
| `Playwright`                                  | `e2e`      |
| `Database tests (Neon ci-testing)`            | `database` |

- The workflow runs on every `pull_request` to `main`, `develop` and `feature/**`, with **no path
  filters and no job-level `if:`**. So all three checks report on every PR, including docs-only PRs,
  and a required check can never be stuck as "expected".
- Pinning `integration_id: 15368` means only GitHub Actions can satisfy the check. A commit status
  with the same name posted through the API by any other app or token does not count.
- If a job is renamed in `ci.yml`, the ruleset must be updated in the same change, or every PR will
  wait for the old name.

## 3. Branch and tag rulesets (exact)

### 3.1 `develop` and `main`: `develop.json`, `main.json`

Both files are identical apart from the name and the ref.

| Requirement                               | Rule in the payload                                                                           |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| Pull requests required (no direct pushes) | `pull_request`                                                                                |
| All three CI checks must pass             | `required_status_checks` with the three contexts above, each pinned to `integration_id` 15368 |
| Branch must be up to date before merging  | `strict_required_status_checks_policy: true`                                                  |
| Force pushes prohibited                   | `non_fast_forward`                                                                            |
| Branch deletion prohibited                | `deletion`                                                                                    |
| **No bypass of required checks**          | `bypass_actors: []` — the admin included                                                      |
| Merge method                              | `allowed_merge_methods: ["merge"]` (merge commits, as used so far)                            |
| Conversations resolved before merging     | `required_review_thread_resolution: true`                                                     |
| Approvals                                 | `required_approving_review_count: 0`; `require_code_owner_review: false` (section 5)          |

**What "up to date" does here.** A PR can only merge if its head already contains the current tip of
the target branch, and the checks passed on that head. After another PR merges, the next one must be
updated ("Update branch"), which starts a fresh CI run. That run tests the real combination, which
would have caught the PR #12 situation.

### 3.2 Tags `phase-*` and `v*`: `tags-immutable.json`, `tags-create.json`

- **`tags-immutable.json`:** `deletion`, `update`, `non_fast_forward`, no bypass actors. A
  checkpoint such as `phase-1b-verified` can never be moved or deleted while the ruleset is active.
- **`tags-create.json`:** `creation`, with a bypass for the **Repository admin** role
  (`RepositoryRole` 5, `always`). Only the admin can create checkpoint and release tags. Automation
  with write access cannot.
- The two are separate so the admin bypass for creating tags does not also allow moving or deleting
  them.

### 3.3 Deliberately not used

| Rule                      | Why not                                                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `update` on branches      | It blocks **every** ref update for non-bypass actors, including merging a PR. With no bypass actors, nothing could ever merge                         |
| `required_linear_history` | The project uses merge commits                                                                                                                        |
| `required_signatures`     | Commits made by GitHub's "Update branch" and merge buttons are signed by GitHub, but local commits are not signed yet. Revisit once signing is set up |

> **Correction to the first draft of this proposal.** It listed "Restrict updates" for `main`. For
> the reason above that rule would block merges, so it is dropped. The `pull_request` rule already
> blocks direct pushes.

### 3.4 How to apply (owner, after approval; not done)

```bash
gh api -X POST repos/husseizo/garage-management-system/rulesets --input docs/operations/rulesets/develop.json
```

The same command applies `main.json`, `tags-immutable.json` and `tags-create.json`. Recommended
order:

1. tags;
2. `develop`;
3. `main`, once the open PR #7 has its checks green.

Verify each with `gh api repos/husseizo/garage-management-system/rulesets`. Then open a test PR:
it must show the three required checks and must not be mergeable while any is pending.

**Rollback.** Set the ruleset's `enforcement` to `disabled`, or delete it
(`gh api -X DELETE …/rulesets/<id>`). This changes no code and no history.

## 4. CODEOWNERS (proposed `.github/CODEOWNERS`)

```text
# Default: everything needs the owner's review.
*                                   @husseizo

# Authentication and authorization
/src/server/auth/                   @husseizo
/src/proxy.ts                       @husseizo
/src/modules/staff/                 @husseizo
/src/app/(auth)/                    @husseizo
/src/server/rate-limit*.ts          @husseizo

# Database identity guards and Prisma
/src/server/db/                     @husseizo
/prisma.config.ts                   @husseizo
/prisma/                            @husseizo

# Test set-up that writes to a database (identity-checked)
/tests/integration/global-setup.ts  @husseizo
/tests/e2e/global-setup.ts          @husseizo
/tests/e2e/support/                 @husseizo
/vitest.config.ts                   @husseizo
/playwright.config.ts               @husseizo

# CI/CD and repository governance
/.github/                           @husseizo
/docs/operations/                   @husseizo
/docs/decisions/                    @husseizo

# Credential handling and security-sensitive scripts
/scripts/                           @husseizo
/.env.example                       @husseizo

# Supply chain
/package.json                       @husseizo
/package-lock.json                  @husseizo
```

- With one maintainer, every line names the same person. The value is that the sensitive paths are
  **declared**. A second reviewer can later be added to exactly those lines, and then
  `require_code_owner_review` can be switched on.
- The file is a code change, not a setting. It goes in its own small PR after approval.

## 5. Single maintainer: what is enforced and what is not

GitHub **does not let a PR's author approve it**. With one maintainer, any rule that needs an
approval or a code-owner review can only be met by bypassing it. So the proposal is:

| Choice                                                                    | Effect                                                                                                                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **0 required approvals, no code-owner requirement, no bypass** (proposed) | Every merge needs a PR and three green checks on an up-to-date branch. Nobody, the admin included, can merge red or stale code, push directly, force-push or delete the branch |
| 1 approval + admin bypass "for pull requests only"                        | Earlier draft. Every merge becomes a bypass, so the bypass is routine and the log is noise. Not recommended until a second reviewer exists                                     |
| 1 approval, no bypass                                                     | Nothing could ever merge. Not workable                                                                                                                                         |

**Break-glass.** If CI itself is broken (for example Neon is down) and an urgent fix is needed, the
owner can set the `develop` ruleset to `disabled`, merge, and set it back to `active`. That is a
deliberate, visible settings change, unlike an ordinary merge, and it should be noted in the PR.

**What the rulesets protect against:**

- merging with failing, missing, cancelled or stale checks;
- direct pushes that skip CI;
- force pushes and branch deletion;
- moved or deleted checkpoint tags;
- automation, including AI-assisted sessions or a leaked write token, changing protected branches
  without passing CI.

**What they do not protect against:** anyone holding the owner's account or an admin-scoped token.
An admin can edit or disable rulesets. The account is the security boundary. Mitigations:

- hardware-key 2FA on the GitHub account;
- fine-grained tokens **without** the Administration permission for automation and AI-assisted
  sessions. The `gh` token on the maintainer's machine has admin rights today.
- a second reviewer, when one joins; then require one approval and code-owner review on `main`.

## 6. GitHub plan and account limitations

| Feature                                     | Available here?                                                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Rulesets and branch protection              | **Yes**: free for public repositories                                                                                                     |
| Bypass actors                               | Repository roles, deploy keys and apps only. **No teams**, since this is a personal account, not an organization                          |
| Ruleset "Evaluate" (dry-run) mode           | **No**: GitHub Enterprise only. The earlier draft's "Evaluate first" step is replaced by applying `develop` first and testing with one PR |
| Merge queue                                 | **No**: organization-owned repositories only. The strict "up to date" rule is the substitute                                              |
| Push rulesets (block changes to file paths) | Not relied on; they are not available to public personal repositories                                                                     |
| Secret scanning and push protection         | **Yes**: free for public repositories                                                                                                     |
| Environments with required reviewers        | **Yes** for public repositories. "Prevent self-review" cannot be met with a single reviewer, so it stays off                              |
| Required approvals from a second person     | Not possible while there is one collaborator (section 5)                                                                                  |

Plan details were checked against GitHub's documented behaviour, not against the account's billing
page, which this session cannot read.

## 7. GitHub Actions and supply chain

1. **Pin actions to commit SHAs** (`actions/checkout@<sha> # v4`). Dependabot `github-actions`
   updates keep them current. Then turn on "Require actions to be pinned to a full-length commit
   SHA" in the Actions settings.
2. Enable **Dependabot** for npm and github-actions, weekly. Security updates are reviewed like any
   other PR; they are never auto-merged.
3. Enable **secret scanning and push protection**. For a public repository this is the most
   valuable single switch.
4. **Fork PRs:** set "Require approval for all outside collaborators" before workflows run. Fork
   PRs never receive secrets, and their database job fails at "Require CI database secrets", by
   design. With the required checks, a fork PR therefore cannot be merged without the owner
   re-running it from a branch in this repository.
5. Keep `permissions: contents: read`. Never use `pull_request_target`.
6. **CI concurrency** (found 2026-11-26).
   - The database jobs share concurrency group `neon-ci-testing`. GitHub keeps only **one pending**
     job per group, so a third queued job **cancels** the waiting one (PR #11's job, re-run).
   - With required checks, a cancelled job shows as "not passed" and blocks the merge. That is the
     safe failure mode; the fix is a re-run.
   - Later, per-PR Neon child branches of `ci-testing` remove the queue.
7. **Cleanup step:** run `db:ci-cleanup` only if the identity step passed
   (`if: always() && steps.identity.outcome == 'success'`). Today it runs `always()` and relies on
   its own identity check to refuse, which it did in the negative test (run `45785429993`).
8. Repository setting: enable "Automatically delete head branches" after merge.

## 8. Rollout (each step needs separate owner approval)

1. The owner enables **secret scanning and push protection** (Settings → Code security).
2. The owner applies the **tag rulesets**, then **`develop`**, then **`main`** (section 3.4). A test
   PR confirms the required checks.
3. A small PR with the expanded `CODEOWNERS`, Dependabot config and SHA-pinned actions, plus the
   cleanup-condition fix. It is the first PR merged under the new rules.
4. The environment `production`, with ADR 0018:
   - required reviewer `husseizo` (user id 87982395);
   - deployment refs limited to tags `v*`;
   - environment secrets only.
