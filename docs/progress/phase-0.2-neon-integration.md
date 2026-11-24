# Phase 0.2 report — Neon setup and end-to-end verification

- **Date:** 2026-11-24
- **Branch:** `feature/phase-0.2-neon-integration` (stacked on `feature/phase-0-foundation`)
- **Status:** Neon integrated and verified end to end against the **`development`** branch. The
  `production` branch was not modified.

## 1. Neon project configuration

| Item          | Value                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Organization  | `org-proud-glitter-40954338` (owner's personal org, Free)                                                                   |
| Project       | `quiet-violet-31193699` — "MAPESA GARAGE"                                                                                   |
| Region        | `aws-eu-central-1`                                                                                                          |
| Postgres      | 18.7, database `neondb`, role `neondb_owner`                                                                                |
| CLI           | `neon` 9.9.4 (`npm i -g neon@latest`), OAuth profile `DEFAULT`                                                              |
| Policy file   | `neon.ts` (committed) — default branch: no overrides; new branches created via `neon checkout --create` expire after 7 days |
| Local context | `.neon` (git-ignored) — pinned to `development`                                                                             |

`neon init -y --org-id … --project-id … --branch production --services postgres` created
`neon.ts`, added `.neon` to `.gitignore`, added `@neon/config` and `@neon/env` (moved to
`devDependencies` and pinned, since only the CLI reads `neon.ts`), installed Neon agent plugins for
local coding assistants (outside the repository), and pulled env variables into `.env`.

`neon config plan` and `neon deploy` both reported: _"No changes — branch production already matches
the policy."_ Only Postgres is a utilised service.

## 2. Database branch strategy

| Branch        | ID                       | Endpoint                  | Use                                                                                |
| ------------- | ------------------------ | ------------------------- | ---------------------------------------------------------------------------------- |
| `production`  | `br-still-bar-bgjl83o4`  | `ep-winter-cake-bg5s9xnm` | Default branch. **No schema, no data.** Not touched by local tooling               |
| `development` | `br-wild-river-bgrlfo90` | `ep-rapid-lake-bgk09wmz`  | Local development, migrations, test accounts. Child of `production`, **no expiry** |

Safety verification before any schema change (read-only queries): `production` contained only the
`public` schema and **no tables**. After the migration, `production` still has no tables;
`development` has `_prisma_migrations` and `staff_users`.

The `development` branch was created with owner approval using `neon branches create` (not
`neon checkout --create`) so the 7-day TTL in `neon.ts` does not apply.

Rules:

- Local `.env` always targets `development` (`neon checkout development && neon env pull`).
- `production` receives schema changes only through a future, owner-approved release procedure
  (`prisma migrate deploy` from CI/CD with `ALLOW_PRODUCTION_DB_WRITES=true`), never from a laptop.
- Future: short-lived per-PR branches (`neon checkout pr-<n> --create`, 7-day TTL) for preview tests.

## 3. Environment variables

Written by `neon env pull` into `.env` (git-ignored, never committed):
`DATABASE_URL` (pooled), `DATABASE_URL_UNPOOLED` (direct), `NEON_BRANCH`, `NEON_BRANCH_ID`,
`NEON_FUNCTION_HOST_SUFFIX` (unused). Existing names were preserved: `DIRECT_URL` remains supported
and takes precedence over `DATABASE_URL_UNPOOLED`. Both strings use `sslmode=require` and
`channel_binding=require`. See `.env.example` and the README table.

The local test staff credentials live in `.env.e2e.local` (git-ignored) and exist only on the
`development` branch.

## 4. Prisma connection architecture

- **Runtime:** a single lazily created `PrismaClient` with `@prisma/adapter-neon` over the pooled
  `DATABASE_URL` (`src/server/db/client.ts`), server-only, cached on `globalThis` in development. No
  additional clients were introduced. The Neon serverless driver fits Next.js serverless/edge-style
  request handling; the pooled endpoint protects connection limits.
- **Migrations:** `prisma.config.ts` → `resolveMigrationUrl()` (`src/server/db/target.ts`) picks
  `DIRECT_URL`, else `DATABASE_URL_UNPOOLED`. It **never falls back to the pooled URL** (Phase 0
  did) and rejects any `-pooler` host, because PgBouncer transaction pooling breaks Prisma Migrate.
- **Guards:** `scripts/db-guard.ts` runs before `db:migrate:dev` and `db:migrate:deploy`;
  `staff:create` calls the same `assertWritableTarget()`. Both refuse `NEON_BRANCH` of
  `production` / `prod` / `main` and `NODE_ENV=production` unless `ALLOW_PRODUCTION_DB_WRITES=true`.
  Messages contain branch names only. `E2E_DATABASE=1` Playwright runs and the live integration
  tests also refuse production branch names.

## 5. Migration procedure

```bash
neon checkout development && neon env pull --branch development
npm run db:guard            # db-guard: OK — branch "development", endpoint ep-rapid-lake-bgk09wmz
npm run db:migrate:status   # lists pending migrations
npm run db:migrate:deploy   # guarded; applies committed migrations only
```

Never use `prisma migrate reset` or hand-written destructive SQL. New migrations are authored with
`npm run db:migrate:dev` on `development`, reviewed in a PR, and kept additive.

**Status:** `20261123000000_init_staff_users` applied to `development` — "Database schema is up to
date!". Not applied to `production`.

## 6. Build results

`npm run build` on Node 22.23.5 — **exit code 0**. 17 routes plus the proxy compiled; no warnings or
failed checks in the build output. `npm run typecheck` and `npm run lint` (`--max-warnings=0`)
passed; Prettier clean.

## 7. Integration and end-to-end results

| Suite                                        | Result                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Vitest unit                                  | **51/51 passed** (13 new: DB target and guard rules)                                                                      |
| Vitest integration (live Neon)               | **14/14 passed, 0 skipped** — SELECT 1, pooled endpoint + identity, Prisma read of `staff_users` and `_prisma_migrations` |
| Playwright, no database                      | **42 passed, 6 skipped** (signed-in tests need `E2E_DATABASE=1`)                                                          |
| Playwright, `E2E_DATABASE=1` (`development`) | **48/48 passed** (Desktop Chrome + Pixel 7)                                                                               |

Task 9 coverage:

| #   | Check                            | Result | Evidence                                                                                                                                                                                                                      |
| --- | -------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Application startup              | ✅     | `next start` web server for both Playwright modes                                                                                                                                                                             |
| 2   | Health endpoint                  | ✅     | `/api/health` 200 `{"status":"ok","checks":{"database":{"status":"ok"}}}`, no infrastructure details                                                                                                                          |
| 3   | Actual DB connectivity           | ✅     | Live integration `SELECT 1`, `current_database()`, not read-only                                                                                                                                                              |
| 4   | Prisma read operations           | ✅     | `staffUser.count()`, `_prisma_migrations` read; sign-in reads `staff_users`                                                                                                                                                   |
| 5   | Staff authentication (dev DB)    | ✅     | Playwright signs in with the `.env.e2e.local` OWNER account                                                                                                                                                                   |
| 6   | Protected dashboard access       | ✅     | Signed in: `/dashboard`, `/dashboard/settings` (OWNER-only), bookings, customers, service-bays return 200                                                                                                                     |
| 7   | Invalid authentication rejection | ✅     | Wrong password → "Incorrect email or password.", stays on `/login`                                                                                                                                                            |
| 8   | Logout                           | ✅     | Account menu → Sign out; `/dashboard` then redirects to `/login?callbackUrl=%2Fdashboard`                                                                                                                                     |
| 9   | DB connection failure handling   | ✅     | Manual run with an unreachable/invalid DB: `/api/health` 503 `{"status":"error"}` with no details; home 200; dashboard still 307 to login; sign-in shows "Sign-in is unavailable right now…"; server log contains no password |

## 8. Outstanding issues

- **CI on the Phase 0 PR failed** its first run on `prettier --check` (`docs/progress/phase-0-report.md`
  was committed unformatted — the Phase 0 report's "Prettier clean" claim was wrong for the
  committed file). Fixed in `3298dc3` on `feature/phase-0-foundation`; the re-run result is pending.
  CI now also runs on PRs into `feature/**` so this stacked PR is checked. CI runs the no-database suites; the live checks
  run in CI only if the owner adds the repo secret `NEON_DEV_DATABASE_URL` (not done — sending a
  credential to GitHub needs owner approval).
- **`npm audit`:** 7 (3 high, 4 moderate), all in development tooling: `effect` ReDoS via the Prisma
  CLI (`@prisma/config`), and `minimatch` via `shadcn` → `ts-morph`. Not reachable from runtime
  input.
- `production` branch is **not protected** in Neon (Free plan). Treat it as protected by procedure.
- The default branch's compute scales to zero after 5 minutes; the first request after idle has a
  cold start of a few hundred ms.
- Carried from Phase 0: Auth.js v5 beta, no sign-in rate limiting, JWT sessions not revocable
  early, no GitHub branch protection on `main` (free plan), local Node 23.7 (use Node 22 LTS).
