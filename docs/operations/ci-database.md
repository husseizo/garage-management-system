# CI database: Neon `ci-testing` branch

- **Owner decision J-05:** CI runs live-database tests on a **dedicated** Neon branch,
  `ci-testing`. CI never uses `development` (local work) or `production`.
- **Status (2026-11-24):** branch **created** with owner approval:
  `ci-testing` (`br-dawn-lake-bgrg54n5`), endpoint `ep-nameless-grass-bg6ppo3o`, parent `production`
  (`br-still-bar-bgjl83o4`), **no expiry**. Isolation verified: it started with no tables, and its
  endpoint differs from `development` (`ep-rapid-lake-bgk09wmz`) and `production`
  (`ep-winter-cake-bg5s9xnm`). All three migrations applied, drift check clean, live integration
  tests 35/35, and no rows left behind.
- **Still required (owner):** the two GitHub secrets below. Until they exist, the CI `database`
  job **fails** with "Missing CI database secrets" (it never silently passes).

## Why a separate branch

| Concern                    | How `ci-testing` addresses it                                                                                                                                                          |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolation from development | Separate compute endpoint and data; CI writes (E2E customers, vehicles, audit rows) never appear in `development`                                                                      |
| Production safety          | Every database step verifies the pinned endpoint (exact match) and the branch id the server reports, `br-dawn-lake-bgrg54n5` (ADR 0017); the dev/prod deny-list is an extra layer only |
| Concurrency                | Workflow `concurrency: neon-ci-testing` runs one database job at a time; never cancelled mid-migration                                                                                 |
| Test design                | Tests use unique run ids and handle pre-existing data; schema tests run in rolled-back transactions. No test depends on cleanup                                                        |
| Audit log (append-only)    | E2E creates audit rows that cannot be deleted; acceptable on a disposable CI branch, not on `development`                                                                              |

## One-time setup (owner)

1. ~~Create the branch~~ — done (see Status). Recreating it, if ever needed:
   `neon branches create --project-id quiet-violet-31193699 --name ci-testing --parent production`
   (not `neon checkout --create`, because the `neon.ts` policy would add a 7-day expiry).

2. **Add the GitHub Actions secrets.** Pipe the values straight from the Neon CLI into the GitHub
   CLI so they are never displayed or pasted:

   ```bash
   neon connection-string ci-testing --project-id quiet-violet-31193699 --database-name neondb --pooled | gh secret set NEON_CI_DATABASE_URL --repo husseizo/garage-management-system
   ```

   ```bash
   neon connection-string ci-testing --project-id quiet-violet-31193699 --database-name neondb | gh secret set NEON_CI_DATABASE_URL_UNPOOLED --repo husseizo/garage-management-system
   ```

   | Secret                          | Value                                                    |
   | ------------------------------- | -------------------------------------------------------- |
   | `NEON_CI_DATABASE_URL`          | `ci-testing` **pooled** string (host contains `-pooler`) |
   | `NEON_CI_DATABASE_URL_UNPOOLED` | `ci-testing` **direct** string                           |

   Optional hardening: a dedicated Neon role for CI so it can be rotated independently of
   `neondb_owner`.

3. Re-run CI on the open PR. The `database` job then runs:
   `db:verify-ci` → `db:migrate:deploy` → migration status + drift check → integration tests →
   ephemeral staff accounts (random, masked passwords) → MAPESA GARAGE profile → build →
   Playwright with `E2E_DATABASE=1` → **`db:ci-cleanup` (always)**, which removes the E2E customers,
   vehicles, plates, ownerships and rate-limit counters. Staff accounts and audit rows remain
   because the audit log is append-only.

## Maintenance

- **Reset** when the branch accumulates too much test data:
  `neon branches reset ci-testing --parent --project-id quiet-violet-31193699`. That restores it to
  `production`'s current state (no data). The next CI run re-applies migrations.
- **Rotate** the CI role password if a secret may have leaked, then update the two secrets.
- If the `ci-testing` branch or endpoint is ever recreated, its ids change and every CI database
  step **fails closed** until a reviewed PR updates `DB_EXPECTED_BRANCH_ID` /
  `DB_EXPECTED_ENDPOINT_ID` in the workflow **and** the `ci-testing` entry in
  `src/server/db/known-targets.ts` (they must agree). Do the same for the registry if the dev or
  prod ids change, and keep `CI_FORBIDDEN_ENDPOINTS` in step.

## What runs where

| Suite                                  | Local (dev branch)    | CI `quality` job | CI `database` job (`ci-testing`) |
| -------------------------------------- | --------------------- | ---------------- | -------------------------------- |
| Unit                                   | ✅                    | ✅               | —                                |
| Integration, mocked                    | ✅                    | ✅               | ✅                               |
| Integration, live schema (rolled back) | ✅                    | skipped          | ✅                               |
| Playwright, no database                | ✅                    | ✅ (`e2e` job)   | —                                |
| Playwright, database mode              | ✅ (`E2E_DATABASE=1`) | —                | ✅                               |
