# Phase 1B controlled end-to-end verification (temporary Neon branch)

- **Date:** 2026-11-25
- **Approved by:** owner (controlled verification on a temporary branch; B-1 fix; S-1 design only)
- **Base:** `develop` at `03cbb36`; follows `phase-1b-post-login-verification.md`

## 1. Temporary Neon branch

| Item                       | Value                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project                    | `quiet-violet-31193699`                                                                                                                                                                                                                                                                                                                                                                            |
| Branch                     | `verify-phase-1b-20261125` — **`br-morning-tree-bg5opwfi`**                                                                                                                                                                                                                                                                                                                                        |
| Parent                     | `development` (`br-wild-river-bgrlfo90`), copied 2026-11-25                                                                                                                                                                                                                                                                                                                                        |
| Endpoint                   | **`ep-raspy-mode-bglkdrgi`** (read-write), database `neondb`, role `neondb_owner`                                                                                                                                                                                                                                                                                                                  |
| Expiry                     | none (kept for inspection; deletion only with owner approval)                                                                                                                                                                                                                                                                                                                                      |
| Identity checks            | Neon API (branch → endpoint); server-reported `neon.branch_id = br-morning-tree-bg5opwfi` on both the pooled and the direct connection; not production, development or ci-testing                                                                                                                                                                                                                  |
| Credentials                | Written by the Neon CLI straight into git-ignored, mode-600 `.env.verify.local`; never printed or committed                                                                                                                                                                                                                                                                                        |
| No fallback to development | Every command ran through a guard that exports the temporary values into the process (dotenv and Next.js never override existing variables) and refuses to start unless `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `DIRECT_URL` all point at `ep-raspy-mode-bglkdrgi` and none is a forbidden endpoint (development, production, ci-testing). The Playwright web server gets only the pooled URL. |

## 2. Results for the previously untested flows

New spec `tests/e2e/lifecycle.spec.ts` (11 tests, desktop Chromium, DB mode). The resulting rows were
then checked with read-only SQL on the temporary branch (run `LIFE3`).

| Area         | Flow                                                                 | UI (E2E) | Database state                                                                                                                                                       |
| ------------ | -------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Customers | Edit customer (last name, notes, language)                           | PASS     | PASS — fields updated; one `customer.updated` audit row                                                                                                              |
|              | Archive and restore                                                  | PASS     | PASS — `deleted_at` null after restore; `customer.archived` then `customer.restored`, in order                                                                       |
|              | Remove a contact                                                     | PASS     | PASS — soft-deleted (`deleted_at` set, `is_primary` false); `customer.contact_removed`                                                                               |
|              | Change the primary contact; remove the primary → next phone promoted | PASS     | PASS — exactly one active primary; `customer.contact_primary_set`                                                                                                    |
| B. Vehicles  | Edit vehicle (colour, year)                                          | PASS     | PASS — fields updated; `vehicle.updated`                                                                                                                             |
|              | Archive vehicle                                                      | PASS     | PASS — `deleted_at` set; current plate and open ownership periods closed at the archive instant; `vehicle.archived`                                                  |
| C. Keepers   | Assign a keeper                                                      | PASS     | PASS — KEEPER period for the keeper customer; `vehicle.keeper_assigned`                                                                                              |
|              | End the keeper relationship                                          | PASS     | PASS — keeper `ended_at` set before the archive; owner period untouched until archive; `vehicle.keeper_ended`                                                        |
| D. Integrity | Audit logs                                                           | —        | PASS — every action audited by a STAFF actor, linked to its customer/vehicle; no full phone numbers in audit rows; keeper's timeline does not name the owner (BR-05) |
|              | Ownership history                                                    | PASS     | PASS — one OWNER period, one KEEPER period, valid ranges                                                                                                             |
|              | Constraints (branch-wide)                                            | —        | PASS — 0 double owners, 0 vehicles with two current plates, 0 plates on two vehicles, 0 duplicate active VINs, 0 customers with two primaries, 0 unaudited rows      |
|              | Constraints (attempted violations)                                   | —        | PASS — integration suite 38/38 on the temporary branch (exclusion, CHECK, RESTRICT, two-session concurrency)                                                         |
|              | Role-based authorisation                                             | PASS     | Technician sees no Edit/Archive/Add keeper/Transfer/contact controls, no contact details, and is redirected from both edit pages                                     |

No functional defect was found in the application.

## 3. Defects found and fixed

| #   | Defect                                                                                                                               | Fix                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| B-1 | Rate limiter reset at clock-aligned 15-minute boundaries (2 × limit possible); flaky CI test                                         | New sliding-window slot algorithm (section 4)                       |
| T-1 | Test helper `saveCustomer` assumed a save finishes within 4 s, then waited for a duplicate warning that never came (both E2E specs)  | Waits for whichever happens first: saved page or warning (20 s cap) |
| T-2 | `rate-limit.spec` email `nobody-${Date.now()}` collided when two workers started in the same millisecond (seen with `--repeat-each`) | Random suffix                                                       |
| T-3 | One intermittent run (FIN2, 2 of 108 tests) timed out on UI updates after server actions; not reproduced in 6 later full runs        | DB-mode `expect` timeout 10 s (was 5 s); assertions unchanged       |

T-1 to T-3 are test-harness issues, not application defects.

## 4. B-1 — root cause and fix

**Root cause.** `windowStartFor()` bucketed attempts by `floor(now / 15 min)`, so every counter
reset at :00/:15/:30/:45. The failing CI attempt (run `45516144085`) crossed 00:15:00 UTC: the 11th
attempt landed in a fresh bucket and was accepted. The old unit test even asserted the reset.

**Fix (ADR 0015, revised).** Sliding window with `limit` reusable slots per key in the existing
`rate_limit_buckets` table (no migration). An allowed request claims a free slot (busy until
`now + 15 min`) in one `UPDATE … (SELECT … FOR UPDATE SKIP LOCKED)`; when the key has fewer than
`limit` slots, one new slot is inserted already busy (PK conflict on a race, then retry). At most
`limit` allowed requests exist in any rolling 15-minute window, with no boundary reset. Refused
requests are not stored. Rows per key ≤ allowed requests ≤ `limit`.

**Rejected on evidence.** A sliding log under a `pg_advisory_xact_lock` transaction was correct but,
at 175 ms round trip, a 30-request burst exhausted the 10-connection pool ("Unable to start a
transaction in the given time"). The slot design needs no held lock. Bulk-creating all slots on
first use was replaced because a new IP would have inserted 50 rows.

**Regression evidence.**

| Test                                                                                                                               | Result                 |
| ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Unit: no reset at 10:15:00; release exactly one window later (10:29:58.999 refused, 10:29:59 allowed)                              | PASS                   |
| Unit: randomised 2-hour run, every rolling window ≤ limit; 50-request concurrent burst → exactly 10; limit lowered/raised          | PASS (7 limiter tests) |
| Integration (temporary branch, pooled URL): 30 concurrent requests from 2 independent client pools → exactly 10 (new and warm key) | PASS, 3 of 3 runs      |
| Integration: single request stores a single row; boundary case on real PostgreSQL                                                  | PASS                   |
| E2E `rate-limit.spec` repeated 5× in parallel                                                                                      | 5 of 5 PASS            |

## 5. S-1 — session revocation design

Proposed in **ADR 0016** (not implemented): keep the Auth.js JWT only as a carrier for a session id;
add `auth_sessions` (+ `auth_events`) in one additive migration; check session, `active` and role
in the database on every authorised request; revoke on sign-out, deactivation and role change.
Step 1 (re-reading `active` and role per request) needs no migration and could ship first. All
staff sign in once after Step 2 is deployed. Awaiting owner approval.

## 6. Validation (local, Node 22.23.5, temporary branch)

| Check                                  | Result                                                   |
| -------------------------------------- | -------------------------------------------------------- |
| Typecheck, lint (0 warnings), Prettier | PASS                                                     |
| Unit                                   | 164/164                                                  |
| Integration                            | 38/38 (7 files)                                          |
| Production build                       | PASS                                                     |
| Migration status / drift               | 3/3 applied, up to date / no difference                  |
| Playwright DB mode (full suite)        | 84 passed, 24 skipped by design — final 4 runs all green |
| Playwright no-DB mode                  | 52 passed, 56 skipped (DB-only)                          |

GitHub Actions has not been run for these changes yet (nothing pushed).

## 7. Database changes

- **Temporary branch only:** test records from the E2E runs (85 customers, 81 contacts, 29 vehicles,
  46 registrations, 74 ownerships, 527 audit rows in total, including the 17/5 copied from
  development), and rate-limit rows. Integration-test rate-limit rows were deleted by the tests
  themselves; schema integration tests rolled back.
- **development:** unchanged (17 customers, 12 contacts, 5 vehicles, 86 audit rows; last audit row
  2026-11-24 23:37 UTC). Read-only queries only.
- **production / ci-testing:** never connected to during this work.
- No migrations, resets, schema pushes or destructive SQL anywhere.

## 8. Remaining risks

- The new limiter has not yet run in GitHub Actions on `ci-testing`.
- On deployment, old fixed-window rows are ignored: one fresh window per subject at most.
- Limiter uses the app server clock (instances must be NTP-synchronised).
- S-1 (session revocation) remains open until ADR 0016 is approved and implemented.
- Local DB-mode E2E is latency-sensitive (175 ms to Frankfurt); CI runs closer to the database.
- Temporary branch retains test data and uses project storage until you approve its deletion.
- Carried: Kiswahili review, Auth.js beta, `npm audit` dev-tooling findings, sign-in not yet in
  `audit_logs` (S-3).
