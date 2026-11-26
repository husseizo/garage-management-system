# Phase 1C-0 integration and closure report

- **Date:** 2026-11-26
- **Status:** **The implementation is merged into `develop` and verified. Closure awaits owner
  approval.** The tag `phase-1c-0-verified` is recommended (section 8) but **not created**.
- **Scope of Phase 1C-0:** database write-target identity (G-1, G-3), a guard on every Prisma CLI
  command (G-2 part A), and a re-check of staff status and role on every request (S-1 Step 1). No
  migration and no schema change.
- **Not done (by instruction):**
  - PR #7 (`develop` → `main`) is not merged, and `main` is untouched;
  - no production connection; no migrations outside CI on `ci-testing`;
  - no credential, password, role, grant or GitHub secret change;
  - the temporary Neon branch `br-morning-tree-bg5opwfi` is kept;
  - no repository setting changed; Auto-fix is off; Phase 1C-1 is not started.

## 1. Final merged state

| PR  | Change                                                     | PR head   | Merge commit on `develop`                  | Merged (UTC)        | Merged by                              |
| --- | ---------------------------------------------------------- | --------- | ------------------------------------------ | ------------------- | -------------------------------------- |
| #10 | G-1 + G-3: server-verified database identity before writes | `45e8362` | `d31c6bc197e564bba4dd646a865fa47bfc22cab6` | 2026-11-26 08:23:20 | Claude, on owner approval, head-pinned |
| #11 | G-2 A: guard inside `prisma.config.ts` for every CLI call  | `5473be4` | `0836bdb25855c3e1953362fe0c4e821ef66599a4` | 2026-11-26 08:47:42 | Claude, on owner approval, head-pinned |
| #12 | S-1 Step 1: re-check staff `active` and role per request   | `05669cb` | `d4ad427778d761b2a608f6e3cfe1fd29d31de880` | 2026-11-26 10:06:09 | The owner (confirmed in chat)          |

`develop` = **`d4ad427`**. The history is linear in merges: `be2f9df` → `d31c6bc` → `0836bdb` →
`d4ad427`, and each merge commit has the previous `develop` tip as its first parent.

**Note on PR #12.**

- The PR's last pre-merge CI run, `45797557515`, passed, but GitHub ran it on a **stale merge ref**:
  `cadc23d`, which is "Merge `05669cb` into `d31c6bc`". It did not include #11. The log shows the
  pre-#11 command `tsx scripts/db-guard.ts migrate-deploy && prisma migrate deploy`.
- The owner merged #12 while that run was still in progress.
- The combination of #11 and #12 is therefore verified by the **post-merge** `develop` run in
  section 2, not by a PR run.
- This is exactly the gap a ruleset with "require branches to be up to date" closes (section 7 and
  the governance proposal).

## 2. Final verification: `develop` at `d4ad427`

**Run `45798150572`** (workflow `CI`, event `push`, attempt 1): **success**, all three jobs.

| Check                                                   | Result                                                                                                                                                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quality (`Typecheck · Lint · Unit/Integration · Build`) | **255 passed**, 27 skipped by design (database tests without a database), 0 failed                                                                                                                                                                      |
| Playwright without a database                           | 52 passed, 0 failed                                                                                                                                                                                                                                     |
| **Database identity**                                   | `verify-ci-target: OK — branch "ci-testing" br-dawn-lake-bgrg54n5 (server-reported), endpoint ep-nameless-grass-bg6ppo3o, database neondb, role neondb_owner, checked pooled + direct`                                                                  |
| **Prisma CLI guard active**                             | The migration step ran plain `> prisma migrate deploy`, and the config printed `db-guard: OK — prisma migrate deploy on branch "ci-testing" br-dawn-lake-bgrg54n5 (server-reported) … checked direct + pooled`. Then: `No pending migrations to apply.` |
| Live integration (`ci-testing`)                         | **51/51 passed** (8 files), including `guards.test.ts` (12) and `prisma-config-guard.test.ts` (6)                                                                                                                                                       |
| **Database browser tests**                              | **87 passed**, 27 skipped by design, 0 failed. This includes the 3 serial `session-revocation` tests: 84 before #12, 87 after                                                                                                                           |
| **Staff status and role enforcement**                   | Verified by the revocation browser tests (deactivated account → `/session-ended` → `/login?ended=1`; role change takes effect on the next request) and by `guards.test.ts` (ended sessions get 401; a database error gives 503, never access)           |
| **CI cleanup**                                          | `ci-cleanup: branch "ci-testing" br-dawn-lake-bgrg54n5 (server-reported) …; removed {registrations 3, ownerships 5, vehicles 2, customers 5, rateLimitBuckets 86}; remaining E2E customers=0 vehicles=0`                                                |

**Zero failed tests** in any job. The `auth.session.lookup_failed` and `password authentication
failed for user admin` lines in the log are expected output of tests that deliberately simulate a
database failure. They are not failures.

**Second green run on the same commit:** `45798161369` (event `pull_request`, PR #7
`develop` → `main`, head `d4ad427`), success on attempt 1. PR #7 is **not** merged.

## 3. Controls: completed, proposed, outstanding

### Completed and verified (in `develop` at `d4ad427`)

| Control                                                                                                                       | Where                                                              | Evidence                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Every write path verifies the **server-reported** Neon branch id (`neon.branch_id`), not labels                               | `src/server/db/identity.ts`, `known-targets.ts`; all write scripts | Run `45798150572`; negative test (section 5)                               |
| Exact endpoint and database match for every connection string; `sslmode` checked                                              | `identity.ts`                                                      | Unit tests `db-identity.test.ts` (38)                                      |
| `NEON_BRANCH` unset → refuse (fail closed); labels can only refuse, never allow                                               | `target.ts`, `identity.ts`                                         | `db-target.test.ts`, `db-identity.test.ts`                                 |
| CI pins the expected `ci-testing` branch and endpoint; a mismatch stops the job before any write                              | `.github/workflows/ci.yml`, `verify-ci-target.ts`                  | Negative test run `45785429993`                                            |
| Cleanup re-checks identity inside its own transaction                                                                         | `ci-cleanup.ts` (`assertClientBranch`)                             | Negative test: refused before any delete                                   |
| Every Prisma CLI command is classified; writes are identity-checked; `migrate reset`, `db push`, `db seed` are always refused | `prisma.config.ts`, `src/server/db/prisma-command.ts`              | `prisma-command.test.ts` (26), `prisma-config-guard.test.ts` (6, real CLI) |
| Staff `active` flag and role re-read from the database on every request; ended sessions are signed out                        | `src/server/auth/guards.ts`, `/session-ended`                      | `guards.test.ts` (12), revocation E2E (3)                                  |
| A database error during the staff check gives 503, never access (fail closed)                                                 | `guards.ts`                                                        | `guards.test.ts`                                                           |

### Proposed, awaiting approval (documents in this PR; nothing implemented)

| Item                                                                                      | Document                                                                                  |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Production migrations only through a reviewed release workflow; remove the local override | `docs/decisions/0018-production-migration-release-process.md`                             |
| G-2 part C: credential rotation and least-privilege roles                                 | `docs/operations/database-credentials-plan.md`                                            |
| Rulesets, CODEOWNERS, secret scanning, Actions hardening                                  | `docs/operations/repository-governance-proposal.md` and `docs/operations/rulesets/*.json` |

### Outstanding (known, not yet designed in detail or scheduled)

- Full server-side session revocation and sign-out (S-1 Step 2, `auth_sessions`): Phase 1C-1/1C-6.
- Sign-in audit trail (S-3, `auth_events`): Phase 1C-6.
- The local production override still exists in `develop` (removed by ADR 0018 once approved).
- See section 9 for priorities.

## 4. CI history of the Phase 1C-0 PRs

| Run           | What                              | Tested commit                                | Result                                                                                                                 |
| ------------- | --------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `45777644415` | PR #10                            | merge onto `be2f9df`                         | success                                                                                                                |
| `45782738712` | `develop` after #10 (push)        | `d31c6bc`                                    | success: quality 216, integration 38/38, database E2E 84                                                               |
| `45783590444` | PR #12, after retarget            | merge onto `d31c6bc`                         | success: quality 223, integration 45/45, database E2E 87                                                               |
| `45783574557` | PR #11, after retarget, attempt 2 | merge onto `d31c6bc`                         | success: quality 248, integration 44/44, database E2E 84. Attempt 1 was cancelled by the concurrency group, not failed |
| `45786188816` | `develop` after #11 (push)        | `0836bdb`                                    | success: quality 248, integration 44/44, database E2E 84                                                               |
| `45797557515` | PR #12, close and reopen          | `cadc23d` = merge onto **`d31c6bc`** (stale) | success, but did not test #11 together with #12                                                                        |
| `45798150572` | **`develop` after #12 (push)**    | **`d4ad427`**                                | **success: quality 255, integration 51/51, database E2E 87**                                                           |
| `45798161369` | PR #7 (`develop` → `main`)        | `d4ad427`                                    | success                                                                                                                |

## 5. Negative database identity test (preserved evidence)

The test was run through draft PR #13, which has since been closed. Its two temporary branches were
deleted after this record was written. GitHub keeps `refs/pull/13/head` (`2506295`), so the commit
stays retrievable.

| Item                  | Value                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow run          | `45785429993`, workflow `CI`, event `pull_request`, attempt 1, conclusion **failure** (expected)                                        |
| PR                    | #13, draft, title "[DO NOT MERGE] Negative test: wrong ci-testing branch pin must fail closed"                                          |
| Head commit (tested)  | `250629560bd3907ce8d5538fd343f78d31740f7d` on `ci-negative/identity-pin`                                                                |
| Base                  | `feature/ci-negative-identity-base` = `d31c6bc197e564bba4dd646a865fa47bfc22cab6` (a copy of `develop` after #10; no commits of its own) |
| Checked-out merge ref | `05234be` "Merge `2506295…` into `d31c6bc…`" (all three jobs)                                                                           |
| Credentials used      | CI secrets for `ci-testing` only                                                                                                        |
| **Expected identity** | `br-negative-test-000000` (deliberately wrong), endpoint `ep-nameless-grass-bg6ppo3o` (correct)                                         |
| **Actual identity**   | `br-dawn-lake-bgrg54n5`, reported by the server through `current_setting('neon.branch_id', true)`                                       |

**The only change** (two lines, so the guard reached the real `ci-testing` and had to refuse on the
server-reported id):

```diff
--- a/.github/workflows/ci.yml
-      DB_EXPECTED_BRANCH_ID: br-dawn-lake-bgrg54n5
+      DB_EXPECTED_BRANCH_ID: br-negative-test-000000
--- a/src/server/db/known-targets.ts
-    branchId: "br-dawn-lake-bgrg54n5",
+    branchId: "br-negative-test-000000",
```

**Exact guard rejections:**

```text
Verify target is the ci-testing branch (identity guard), 2026-11-26T08:44:08Z
> tsx scripts/verify-ci-target.ts
verify-ci-target: The pooled connection reports branch br-dawn-lake-bgrg54n5, expected br-negative-test-000000.
##[error]Process completed with exit code 1.

Remove E2E business records from ci-testing (if: always()), 2026-11-26T08:44:08Z
> tsx scripts/ci-cleanup.ts
ci-cleanup: The pooled connection reports branch br-dawn-lake-bgrg54n5, expected br-negative-test-000000.
##[error]Process completed with exit code 1.
```

**Database job steps:**

| #   | Step                                                              | Outcome                                |
| --- | ----------------------------------------------------------------- | -------------------------------------- |
| 1–5 | Set up job, require CI database secrets, checkout, Node, `npm ci` | success                                |
| 6   | **Verify target is the ci-testing branch (identity guard)**       | **failure** (the guard refused)        |
| 7   | Apply migrations to ci-testing                                    | **skipped**                            |
| 8   | Migration status and drift check                                  | **skipped**                            |
| 9   | Integration tests (live database)                                 | **skipped**                            |
| 10  | Create ephemeral test staff accounts                              | **skipped**                            |
| 11  | Set the ci-testing garage profile                                 | **skipped**                            |
| 12  | Build                                                             | skipped                                |
| 13  | Install Playwright browser                                        | skipped                                |
| 14  | Playwright (database mode)                                        | **skipped**                            |
| 15  | Remove E2E business records (`if: always()`)                      | ran, and **refused before any delete** |
| 16  | Upload artifacts                                                  | success (nothing database-related)     |

**Database state.** A read-only snapshot of `ci-testing` (`BEGIN READ ONLY`, server-confirmed
`br-dawn-lake-bgrg54n5`, no other CI job running) was taken before and after. The two are
**identical**:

```text
customers 0 · contacts 0 · vehicles 0 · registrations 0 · ownerships 0 · staff 3
(last update unchanged) · audit_rows 418 (last row unchanged) · rate_limit rows 0 ·
_prisma_migrations 3 (last 2026-11-24 10:48:56 UTC)
```

**Conclusion:**

- the guard failed closed on the server-reported identity;
- no migration ran;
- no test data was created (staff accounts, garage profile and E2E records were all skipped);
- the cleanup executed no delete;
- the other two jobs (quality, Playwright without a database) passed, as expected, because they
  never touch the database.

## 6. Proposals (not implemented)

- **Production migrations:** `docs/decisions/0018-production-migration-release-process.md`.
- **G-2 part C:** `docs/operations/database-credentials-plan.md`.
- **Governance:** `docs/operations/repository-governance-proposal.md`, with exact ruleset payloads
  in `docs/operations/rulesets/`.

## 7. Documentation PR #9 (Phase 1B completion report)

| Item         | State                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Diff         | 1 commit `0c4ffd7`, 2 files: `docs/progress/phase-1b-completion-report.md` (+222), `docs/progress/phase-1b-e2e-verification.md` (+2 −1) |
| Mergeability | MERGEABLE/CLEAN; a local trial merge onto `d4ad427` is clean                                                                            |
| CI           | Green (run `45775288643`), but against merge base `be2f9df`, before any Phase 1C-0 merge                                                |
| Overlap      | **None.** It touches neither these four documents nor any file changed by #10, #11 or #12                                               |

Its report marks S-1, G-1, G-2 and G-3 as "Open". That was true at Phase 1B closure, and the report
is a dated record, so it should not be rewritten. This report records how they were closed.

**Recommendation: merge #9 separately, unchanged, before this documentation PR.** First re-run its
CI against `develop` = `d4ad427`. That keeps the Phase 1B record and the Phase 1C-0 record as two
reviewable, dated commits.

## 8. Recommended checkpoint: `phase-1c-0-verified` (not created)

- **Commit:** `d4ad427778d761b2a608f6e3cfe1fd29d31de880` (the #12 merge on `develop`).
- **Why this commit:** it is the exact code verified by runs `45798150572` and `45798161369`. A
  later documentation-only merge does not change the code and does not need to move the checkpoint.
- **Meaning:** Phase 1C-0's **implementation** is verified: identity guard, Prisma CLI guard and
  staff re-validation.
- **Not included:** G-2 part C credential and permission work, the production release process,
  rulesets, full session revocation and sign-in auditing. These are open (section 9).

## 9. Remaining security work, in priority order

Definitions used for "blocks":

- **Phase 1C-1** is the additive migration, applied to `development` and `ci-testing` only.
- **Public booking deployment** is any internet-reachable deployment of `/book`.
- **Production deployment** is real use against the production database.

| #   | Item                                                                                                                                                    | State                                         | Blocks 1C-1                                                        | Blocks public booking                                | Blocks production |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- | ----------------- |
| 1   | **Repository governance**: rulesets on `develop`, `main` and tags; secret scanning and push protection; expanded CODEOWNERS                             | Proposed                                      | **Yes** (recommended gate: cheap, and the merge gap above is real) | Yes                                                  | Yes               |
| 2   | **G-2 part C, stages C, D, T**: rotate inherited `neondb_owner` passwords on `ci-testing`, `development`, the temporary branch; `gms_app` with DML only | Proposed (each step separately approved)      | No                                                                 | **Yes**                                              | Yes               |
| 3   | **Production migration policy** (ADR 0018): remove the local override; release workflow with environment approval and backup                            | Proposed                                      | No                                                                 | Yes, if that deployment uses the production database | **Yes**           |
| 4   | **Full server-side session revocation** (S-1 Step 2, `auth_sessions`): sign-out and deactivation revoke the session itself                              | Not implemented (Phase 1C-1 table, 1C-6 code) | No (1C-1 creates its table)                                        | **Yes**                                              | Yes               |
| 5   | **Authentication audit logging** (S-3, `auth_events`): sign-in success, failure, sign-out, revocation in an append-only table                           | Not implemented (Phase 1C-1 table, 1C-6 code) | No (1C-1 creates its table)                                        | **Yes**                                              | Yes               |
| 6   | **G-2 part C, stage P**: rotate production, `gms_app` on production, project-scoped backup key                                                          | Proposed; after #3                            | No                                                                 | Yes, if on production                                | **Yes**           |
| —   | **S-1 Step 1**: staff status and role re-validated on every request                                                                                     | **Completed** (PR #12)                        | —                                                                  | —                                                    | —                 |

Also carried, lower priority: Kiswahili review, Auth.js beta, `npm audit` findings in dev tooling,
CI concurrency queue (governance 4.6), cleanup-step condition (governance 4.7), the local
`neon-connectivity` timeout flake.

## 10. Outstanding risks

| #   | Risk                                                                                                        | Handling                                                       |
| --- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | One `neondb_owner` password inherited from production may be valid on all branches (not tested)             | G-2 part C, stages C1 → D1 → T1 → P1                           |
| 2   | No branch protection or rulesets. PR #12 was merged while its only PR run tested a stale merge ref          | Governance proposal, rulesets with strict checks               |
| 3   | Secret scanning and push protection are off on a **public** repository (history scan: clean)                | Governance proposal, section 4                                 |
| 4   | The CI concurrency group can cancel a waiting database job                                                  | Required checks; later per-PR Neon branches                    |
| 5   | The app runtime and CI use the owner role, which has DDL rights                                             | G-2 part C (`gms_app`)                                         |
| 6   | The local production override is still in `develop`                                                         | ADR 0018                                                       |
| 7   | Staff sign-out is cookie-only; a stolen session cookie stays valid until expiry if the account stays active | S-1 Step 2                                                     |
| 8   | The `gh` token on the maintainer's machine has admin rights, so AI-assisted sessions can merge              | Governance section 5: rulesets without bypass, narrower tokens |
| 9   | Infrastructure ids (project, branch, endpoint) are public. They are not credentials                         | Accept, or make the repository private                         |
