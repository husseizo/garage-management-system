# Phase 1B report — Customer and vehicle management

- **Date:** 2026-11-24
- **Business:** MAPESA GARAGE (Tanzania, +255, `Africa/Dar_es_Salaam`, `TZS`)
- **Branch:** `feature/phase-1b-customer-vehicle-management` (from `develop` at `d9a2f84`) → PR into
  `develop`, **not merged**
- **Scope delivered:** the approved Phase 1B plan with owner conditions J-01, J-02, J-03, J-05 and
  J-07. No guest booking, scheduling, reminders, notifications or customer portal.

## 1. Baseline and merge (owner-authorised)

PR #3 (Phase 1A) was merged into `develop` (`d9a2f84`) after all five conditions held: CI green on
`6f689ed`, no unresolved review issues, migration diff additive only, no secrets in the branch
history, and Neon `production` unchanged (no tables).

Observation: `main` is at `e37ab0e` "Merge pull request #4 from husseizo/develop". It was created
and merged by the owner's account at 09:37 UTC and contains Phase 0 only (not 1A). This was not
done by the agent. No action was taken on `main`.

## 2. Database changes

Migration `20261124120000_phase_1b_customers_vehicles` (additive; dry-run in `BEGIN … ROLLBACK` via
the new `npm run db:dry-run`; applied with the guarded `db:migrate:deploy`; drift check clean):

| Object          | Detail                                                                                                                                                                                                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extensions      | `pg_trgm` (search), `btree_gist` (range exclusion)                                                                                                                                                                                                                                                                          |
| Enums           | `CustomerKind`, `ContactKind`, `FuelType`, `OwnershipRole`                                                                                                                                                                                                                                                                  |
| Tables          | `customers`, `customer_contacts`, `vehicles`, `vehicle_registrations`, `vehicle_ownerships`, `rate_limit_buckets`                                                                                                                                                                                                           |
| Modified        | `audit_logs` + nullable `subject_customer_id`, `subject_vehicle_id` (+ 2 indexes); metadata-only                                                                                                                                                                                                                            |
| Key constraints | Name-by-kind and TIN CHECKs; E.164/email format; **exclusion**: one primary contact per kind, no duplicate contact within a customer (shared across customers allowed), VIN unique among active vehicles, plate current on one vehicle at a time, one current plate per vehicle, one OWNER at a time, no overlapping keeper |
| Not created     | `customer_merges` (J-01: warnings only), any booking/scheduling/notification table                                                                                                                                                                                                                                          |

Full column detail: `docs/architecture/database/data-dictionary.md` Part 1.

## 3. Implementation

| Area            | Where                                                                                                               | Notes                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permissions     | `src/modules/staff/permissions.ts`, `assertPermission` / `requirePermission`                                        | 13 permissions × 4 roles; checked in pages, actions **and** services                                                                                        |
| Rate limiting   | `src/server/rate-limit*.ts`, ADR 0015                                                                               | Sign-in per email (10/15 min) and per IP (50/15 min), staff search and writes. HMAC keys                                                                    |
| Audit           | `src/server/audit.ts`                                                                                               | Same-transaction writes; allow-list redaction (masked phones/emails, names "changed" only)                                                                  |
| Customers       | `src/modules/customers/*`, `/dashboard/customers[/new, /[id], /[id]/edit]`                                          | Individual/company, optional TIN, contacts (E.164 with TZ default), shared-number warnings, duplicate detection with explicit confirmation, archive/restore |
| Vehicles        | `src/modules/vehicles/*`, `/dashboard/vehicles[/new, /[id], /[id]/edit]`                                            | Optional VIN (ISO 3779 check digit as a warning), chassis number, plate history, owner/keeper history, archive                                              |
| Concurrency     | Vehicle row `FOR UPDATE` + expected-owner check + exclusion constraints                                             | Stale or concurrent transfers are rejected ("recorded at the same time")                                                                                    |
| Privacy (BR-05) | Customer page shows only that customer's own ownership periods; audit rows for transfers never name the other party | Staff-only vehicle page shows owner history for dispute handling (J-09)                                                                                     |
| Search          | Global header search → `/dashboard/search`; list filters                                                            | Name (prefix + trigram), phone (any TZ format; contact readers only), email, TIN, plate (partial), VIN prefix, chassis                                      |
| Activity        | `src/server/activity.ts`, timeline on customer and vehicle pages                                                    | Who/what/when, translated field names, values not shown                                                                                                     |
| Localisation    | `src/i18n/*`, ADR 0014                                                                                              | English default + Kiswahili, cookie switcher, typed keys, no hard-coded UI strings in dashboard/login                                                       |
| Tooling         | `db:dry-run`, `db:verify-ci`, `garage:profile`                                                                      | All refuse production branches                                                                                                                              |

## 4. Validation (local, Node 22.23.5)

| Check                                                     | Result                                                                                                                                                      |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma validate`, typecheck, lint (0 warnings), Prettier | ✅                                                                                                                                                          |
| `npm run validate`                                        | ✅ exit 0 — 16 test files, **194 tests**                                                                                                                    |
| Vitest unit                                               | ✅ **159/159** (i18n parity, normalisers, schemas, every permission cell, rate limiter, audit redaction, garage-local dates)                                |
| Vitest integration (live `development`)                   | ✅ **35/35, 0 skipped** (13 new Phase 1B schema tests incl. a two-session concurrency test)                                                                 |
| `npm run build`                                           | ✅ exit 0; 24 routes + proxy; no warnings                                                                                                                   |
| Playwright with DB (`E2E_DATABASE=1`)                     | ✅ **75 passed, 15 skipped** (skips are project-scoped by design: chromium-only data flows, mobile-only smoke, auth setup). Run 3× consecutively, all green |
| Playwright without DB                                     | ✅ **52 passed, 38 skipped** (DB-only tests)                                                                                                                |
| Migration status / drift                                  | ✅ up to date / exit 0                                                                                                                                      |
| Neon `production`                                         | ✅ still no tables                                                                                                                                          |

E2E covers: individual customer with local phone → E.164; duplicate (shared phone) warning and
confirmation; company with TIN; invalid VIN rejected; vehicle with plate-format and check-digit
warnings and owner; duplicate VIN rejected; registration change keeps history; ownership transfer
history; **stale concurrent transfer rejected**; search by plate and by local phone; Kiswahili ↔
English switch; archive; technician sees no phone numbers, cannot create/transfer/change plates,
cannot find customers by phone; mobile layout without horizontal overflow; sign-in rate limit after
10 failures; all new routes redirect unauthenticated users.

Issues found and fixed during validation:

- Zod 4: checkbox schema built from a union with `undefined` made the key required, so every create
  failed. Replaced with `z.preprocess` (caught by unit tests).
- Customer form: React's post-action form reset flipped the "Customer type" radio back to
  Individual after a duplicate warning, which would submit the wrong kind. Fixed: submitted kind
  comes from component state (caught by E2E).
- Customer picker set state inside an effect (lint); refactored to the input handler.
- Test-only fixes: RESTRICT returns `23001`, Prisma `name`-type casts, Vitest timeout for the
  concurrency test, E2E duplicate-aware saves across repeated runs.

## 5. CI strategy (J-05)

`.github/workflows/ci.yml` now has a `database` job for the dedicated Neon **`ci-testing`** branch:
verify target (`db:verify-ci` refuses anything but `ci-testing` and the known dev/prod endpoints) →
migrate → live integration tests → ephemeral staff accounts with masked random passwords → garage
profile → build → Playwright in DB mode. It runs one at a time and is skipped (with a notice) until the
secrets exist. The `quality` job no longer reads `NEON_DEV_DATABASE_URL`, so `development` is never
used by CI.

**Follow-up (owner-approved, 2026-11-24):** the `ci-testing` branch was created
(`br-dawn-lake-bgrg54n5`, endpoint `ep-nameless-grass-bg6ppo3o`, parent `production`, no expiry).
Isolation was verified, all migrations were applied, and live integration tests ran 35/35 with no
rows left behind. The run exposed and fixed a test-design gap: schema tests assumed an existing staff
account, so they now create their own fixtures. **Remaining owner action:** add the two GitHub secrets
(`docs/operations/ci-database.md`, piped commands, values never displayed). Until then the CI
`database` job is skipped.

## 6. Development data created

On Neon `development` only: two staff test accounts (`e2e.owner@example.test` OWNER,
`e2e.technician@example.test` TECHNICIAN; passwords only in git-ignored `.env.e2e.local`), and
E2E-run records named "E2E … <run id>" (customers, vehicles, plates, ownerships, audit rows). They
are test data, never presented as real customers; audit rows are append-only by design.

## 7. Outstanding risks and issues

| #    | Item                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| R-1  | `ci-testing` branch and secrets not yet created, so CI does not run DB tests (owner action)                                    |
| R-2  | Kiswahili strings are a first draft; native-speaker review needed                                                              |
| R-3  | Public site (`/`, `/book`, `/track`, `/portal`) remains English-only                                                           |
| R-4  | Phone search uses substring matching on digits; performance fine at garage scale, revisit with large datasets                  |
| R-5  | `search_name = lower(display_name)` CHECK relies on JS and PostgreSQL lower-casing agreeing (true for Latin scripts used here) |
| R-6  | Rate limiting depends on `X-Forwarded-For` from the hosting platform; per-IP limit kept generous                               |
| R-7  | `npm audit`: 3 high, 4 moderate, all in dev tooling (Prisma CLI `effect`, shadcn `minimatch`); unchanged                       |
| R-8  | Auth.js v5 beta; JWT staff sessions cannot be revoked early (carried)                                                          |
| R-9  | `main` contains Phase 0 via owner PR #4 but not 1A/1B; release process for `main` to be agreed                                 |
| R-10 | Customer merge deliberately absent (J-01); duplicates accumulate until a merge phase                                           |

## 8. Recommendation for Phase 1C

**CONDITIONAL GO**, once:

1. The Phase 1B PR passes CI and is reviewed and approved by the owner.
2. The owner confirms and creates the `ci-testing` branch and secrets, and the `database` CI job
   passes.
3. A native speaker reviews the Kiswahili strings (can run in parallel).
4. Phase 1C prerequisites are decided: SMS/OTP provider (Q-07) and the booking-review model (Q-08).
