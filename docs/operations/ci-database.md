# CI database: Neon `ci-testing` branch

- **Owner decision J-05:** CI runs live-database tests on a **dedicated** Neon branch,
  `ci-testing`. CI never uses `development` (local work) or `production`.
- **Status:** CI configuration is ready (`.github/workflows/ci.yml`, job `database`). **The branch and
  the GitHub secrets have NOT been created.** Until they exist, the job reports "skipped" (a notice,
  not a failure), and live-database suites are reported as skipped, never passed.

## Why a separate branch

| Concern                    | How `ci-testing` addresses it                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Isolation from development | Separate compute endpoint and data; CI writes (E2E customers, vehicles, audit rows) never appear in `development`               |
| Production safety          | `npm run db:verify-ci` refuses any branch name other than `ci-testing` and the known dev/prod endpoint ids                      |
| Concurrency                | Workflow `concurrency: neon-ci-testing` runs one database job at a time; never cancelled mid-migration                          |
| Test design                | Tests use unique run ids and handle pre-existing data; schema tests run in rolled-back transactions. No test depends on cleanup |
| Audit log (append-only)    | E2E creates audit rows that cannot be deleted; acceptable on a disposable CI branch, not on `development`                       |

## One-time setup (owner)

1. **Create the branch** (from `production`, which has no data):

   ```bash
   neon branches create --project-id quiet-violet-31193699 --name ci-testing --parent production
   ```

   Do not use `neon checkout ci-testing --create`: the `neon.ts` policy would give it a 7-day
   expiry.

2. **Get its connection strings** (pooled and direct). Do not paste them into chat, issues or
   commits:

   ```bash
   neon connection-string ci-testing --project-id quiet-violet-31193699 --pooled
   neon connection-string ci-testing --project-id quiet-violet-31193699
   ```

3. **Add GitHub Actions repository secrets** (Settings → Secrets and variables → Actions):

   | Secret                          | Value                                                    |
   | ------------------------------- | -------------------------------------------------------- |
   | `NEON_CI_DATABASE_URL`          | `ci-testing` **pooled** string (host contains `-pooler`) |
   | `NEON_CI_DATABASE_URL_UNPOOLED` | `ci-testing` **direct** string                           |

   Recommended: a dedicated Neon role for CI (`neon roles create --branch ci-testing --name ci_runner`)
   so the credential can be rotated without affecting `development`.

4. Re-run CI on any PR. The `database` job then runs:
   `db:verify-ci` → `db:migrate:deploy` → integration tests → creates **ephemeral** staff accounts
   (random passwords generated in the job and masked; nothing stored in the repo) → sets the MAPESA
   GARAGE profile → build → Playwright with `E2E_DATABASE=1`.

## Maintenance

- **Reset** when the branch accumulates too much test data:
  `neon branches reset ci-testing --parent --project-id quiet-violet-31193699`. That restores it to
  `production`'s current state (no data). The next CI run re-applies migrations.
- **Rotate** the CI role password if a secret may have leaked, then update the two secrets.
- If the dev or prod endpoint ids ever change, update `CI_FORBIDDEN_ENDPOINTS` in the workflow.

## What runs where

| Suite                                  | Local (dev branch)    | CI `quality` job | CI `database` job (`ci-testing`) |
| -------------------------------------- | --------------------- | ---------------- | -------------------------------- |
| Unit                                   | ✅                    | ✅               | —                                |
| Integration, mocked                    | ✅                    | ✅               | ✅                               |
| Integration, live schema (rolled back) | ✅                    | skipped          | ✅                               |
| Playwright, no database                | ✅                    | ✅ (`e2e` job)   | —                                |
| Playwright, database mode              | ✅ (`E2E_DATABASE=1`) | —                | ✅                               |
