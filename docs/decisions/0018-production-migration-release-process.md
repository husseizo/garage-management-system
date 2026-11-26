# 0018 — Production migrations only through a reviewed release workflow

- **Status:** **Proposed — awaiting owner approval. Nothing here is implemented.** No credential,
  secret or repository setting has been changed.
- **Date:** 2026-11-26
- **Relates to:** ADR 0009 (migration conventions), ADR 0017 (database target identity),
  `docs/operations/database-credentials-plan.md` (G-2 part C),
  `docs/operations/repository-governance-proposal.md`

## State at Phase 1C-0 closure (`develop` = `d4ad427`, CI run `45798150572`)

| Control                                                                                                                                   | State                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Every write path verifies the server-reported branch id and exact endpoint (ADR 0017, PR #10)                                             | **Completed**                                                                         |
| Every Prisma CLI command is identity-checked inside `prisma.config.ts`; `migrate reset`, `db push`, `db seed` are always refused (PR #11) | **Completed**                                                                         |
| Production is in the registry with **no** allowed actions except the override below                                                       | **Completed**                                                                         |
| Production `migrate-deploy` is refused from any `pull_request` event                                                                      | **Completed**                                                                         |
| Local override `ALLOW_PRODUCTION_DB_WRITES=true` + `CONFIRM_PRODUCTION_BRANCH_ID`                                                         | **Still present** in `src/server/db/identity.ts` and `target.ts`. This ADR removes it |
| Release workflow, `production` environment, approval gate, pre-migration backup                                                           | **Proposed** (this ADR); nothing exists yet                                           |
| Production migrator and application credentials in the `production` environment only                                                      | **Proposed** (G-2 part C, stage P)                                                    |
| Destructive-SQL lint                                                                                                                      | **Proposed**                                                                          |

Production is still empty, and no production migration has ever been run.

## Context

ADR 0017 still lets local tooling run `migrate-deploy` against production when **both**
`ALLOW_PRODUCTION_DB_WRITES=true` and `CONFIRM_PRODUCTION_BRANCH_ID=<production id>` are set. That
override:

- requires the production owner credential to be on a developer machine;
- leaves no record of who approved what;
- has no backup step and no review gate.

Production is currently empty: no tables, no `_prisma_migrations`. So the process can be decided
before the first production migration ever runs.

## Decision (proposed)

### 1. Remove the local override

- In `src/server/db/identity.ts`, production is **always** refused for every action, unless the
  process runs inside the release workflow defined below. The release context is checked from
  GitHub's own variables:
  - `GITHUB_ACTIONS=true`;
  - `GITHUB_EVENT_NAME=workflow_dispatch`;
  - `GITHUB_WORKFLOW_REF` = `<repo>/.github/workflows/release-migrate.yml@refs/tags/v…`;
  - `GITHUB_REF_TYPE=tag`.

  These variables can be faked on a laptop. That is why **the production migration credential
  never exists outside the GitHub `production` environment** (point 4). Without the credential, the
  check cannot be used locally at all.

- `ALLOW_PRODUCTION_DB_WRITES` and `CONFIRM_PRODUCTION_BRANCH_ID` are deleted from the code,
  `.env.example` and the docs. `assertWritableTarget` refuses production names with no override.

### 2. Dedicated release workflow: `.github/workflows/release-migrate.yml`

| Aspect      | Rule                                                                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger     | `workflow_dispatch` only, from a **release tag** `v*` that points at a commit on `main`. There is no `push` or `pull_request` trigger                                                                    |
| Inputs      | `confirm_branch_id`: the owner types `br-still-bar-bgjl83o4`. `expected_migrations`: the exact list of pending migration folder names, copied from the reviewed release notes                            |
| Environment | `environment: production`. A required reviewer (the owner) must approve before the job starts, and deployment refs are limited to `v*` tags                                                              |
| Concurrency | `group: neon-production`, `cancel-in-progress: false`                                                                                                                                                    |
| Permissions | `contents: read` only                                                                                                                                                                                    |
| Secrets     | `NEON_PROD_MIGRATOR_URL_UNPOOLED`, `NEON_PROD_APP_URL` (pooled, smoke test only), `NEON_API_KEY_PROD_BACKUP` (a project-scoped Neon key). All are **environment** secrets, so no other job can read them |

**Steps, each failing closed:**

1. Check out the tag. Verify the tag commit is reachable from `origin/main`, and that
   `confirm_branch_id` equals the registry's production branch id.
2. **Identity:** run `verifyWriteTarget("migrate-deploy")`. It checks the exact endpoint
   `ep-winter-cake-bg5s9xnm` and the server-reported branch `br-still-bar-bgjl83o4` on the migrator
   connection.
3. **Pending list:** `prisma migrate status`. The pending migrations must equal
   `expected_migrations`, in order, with nothing extra and nothing missing. Then the destructive-SQL
   lint runs (section 4).
4. **Backup:**
   - Create a Neon branch `pre-release-<tag>-<run_id>` from production, through the Neon API with
     the project-scoped key. Record its id and the timestamp and LSN.
   - The point-in-time restore window of the Neon plan is the second line of recovery.
5. **Migrate:** `prisma migrate deploy`, with the migrator credential, over the direct connection.
6. **Verify:**
   - `migrate status` reports up to date;
   - `migrate diff --exit-code` shows no drift;
   - an identity probe and `SELECT 1` succeed as the **application** role;
   - the application role cannot run DDL (one negative check).
7. **Record:**
   - upload a JSON artifact: run id, actor, approver, tag, commit, migrations applied, identity
     lines, backup branch id, timings;
   - the GitHub deployment record of the `production` environment keeps the approval;
   - a follow-up PR appends the summary to `docs/operations/release-log.md`.

### 3. Credentials (from the G-2 part C plan)

- **Migration credential (`gms_migrator`, or the rotated `neondb_owner` until it exists):**
  - stored **only** as a secret of the `production` environment;
  - never in `.env`, chat, issues or logs.
- **Application credential (`gms_app`):**
  - DML only, with no DDL, no `TRUNCATE`, and only `INSERT`/`SELECT` on `audit_logs`;
  - stored in the hosting platform's secret store when a deployment exists;
  - the release workflow uses it only for the post-migration smoke test.

### 4. Migration review (before a release tag is cut)

- Every migration arrives through a PR to `develop`, with a CODEOWNERS review of `prisma/`.
- CI applies it to `ci-testing`, checks drift, and runs the full suite.
- `db:dry-run` runs on a temporary branch copied from production. Once production has data, the
  copy has production-like data.
- **Destructive-SQL lint** is a new CI check. It flags these unless the migration carries a
  `-- reviewed-destructive: <reason>` comment approved in review:
  - `DROP`;
  - `TRUNCATE`;
  - `ALTER … DROP`;
  - `ALTER … TYPE`;
  - `DELETE` or `UPDATE` without `WHERE`.

  Expand/contract stays the rule (ADR 0009).

- The release notes list the exact pending migrations. They become the `expected_migrations` input.

### 5. Backup and recovery

| Situation                        | Recovery                                                                                                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration fails part-way         | Prisma marks it failed. Fix it **forward** with a new migration. If data is wrong, restore the affected tables from the `pre-release-…` branch, through a separate approved procedure  |
| Migration succeeded but is wrong | Forward fix (preferred)                                                                                                                                                                |
| Severe corruption                | The owner restores production from the `pre-release-…` branch, or by point-in-time restore. This is a manual, separately approved Neon operation. The app is paused during the restore |
| Backup branches                  | Kept for 14 days, then deleted with owner approval. They are listed in the release log                                                                                                 |

Recovery time and data loss depend on the Neon plan's restore window and on the app downtime the
owner accepts. They are to be confirmed when hosting is chosen.

### 6. Audit trail

The execution record has four parts:

- the GitHub Actions run log, which contains identity lines only, never connection strings;
- the environment deployment approval (who approved, when);
- the JSON artifact;
- the release-log entry.

Neon's own operation log records the backup branch and the compute activity.

## Consequences

- Production can only change through a tag on `main`, an owner approval, an exact identity match
  and a pre-migration backup. No laptop can do it.
- The first production release also needs a hosting decision, the production `gms_app` credential,
  and the first staff account. Those are separate steps.

**Limitation with a single maintainer.** The owner both starts and approves the run, and GitHub's
"prevent self-review" cannot be turned on with one reviewer. The gate protects against mistakes and
automation, not against the owner's own account being compromised. Mitigations:

- hardware-key 2FA on the GitHub account;
- no long-lived tokens with admin scope on developer machines;
- a second reviewer when one joins.

## Implementation (after approval)

1. Code PR:
   - remove the override in `identity.ts` and `target.ts`, add the release-context check;
   - unit tests, for example that the override variables are now ignored;
   - add the destructive-SQL lint;
   - add `release-migrate.yml`, which can only run once the environment exists.
2. Owner, separately approved: create the `production` environment and its reviewer rule.
3. Owner, separately approved: add the environment secrets, after G-2 part C stage P.
4. Dry run of the whole workflow against a **temporary branch** that stands in for production,
   using a test environment, before the first real release.
