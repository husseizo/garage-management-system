# Phase 1B post-login verification

- **Date:** 2026-11-25
- **Code verified:** `develop` at `03cbb36` (working tree clean; same tree CI ran on PR #7, run
  `45516144085`)
- **Database:** Neon project `quiet-violet-31193699`, branch `development` (`br-wild-river-bgrlfo90`),
  endpoint `ep-rapid-lake-bgk09wmz`, database `neondb`. Identity confirmed with the Neon CLI and the
  live connection before every query.
- **Method:** read-only SQL inside `BEGIN READ ONLY … ROLLBACK`; tests that need no database run
  locally; database-backed flows taken from the CI run on the isolated `ci-testing` branch (same
  code). No rows were created, changed or deleted on `development`, `ci-testing` or `production`.

## 1. Results matrix

PASS = verified by a test or read-only inspection. FAIL = defect found. NOT TESTED = no test or
recorded use exercises it yet (the code exists).

### Authentication

| Feature                            | Result     | Evidence                                                                                                                                    |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| OWNER sign-in                      | PASS       | Real OWNER account (`a***@mapesagarage.co.tz`) active, `last_login_at` recorded today; owner's own login; CI E2E sign-in                    |
| Session persistence                | PASS       | 8-hour encrypted JWT cookie; E2E reuses saved sessions across 75 tests (CI `ci-testing`)                                                    |
| Protected dashboard routes         | PASS       | Every `dashboard/**/page.tsx` and the layout call `requireStaff`/`requirePermission`; `protected-routes.spec` passed locally (no-DB) and CI |
| Logout                             | PASS       | `staff-session.spec`: sign out, then `/dashboard` redirects to `/login?callbackUrl=…` (CI)                                                  |
| Session invalidation (server side) | LIMITATION | JWT cannot be revoked: a copied cookie stays valid until expiry; deactivation/role change takes effect only at next sign-in (S-1)           |
| Server-side role enforcement       | PASS       | All 16 server actions call `assertPermission`; unit tests cover every role × permission cell (159/159 local)                                |
| Unauthorised access rejection      | PASS       | Technician cannot create, transfer, change plates, see or search phones (CI E2E); unauthenticated routes redirect (local + CI)              |
| Sign-in rate limiting              | PASS\*     | Works, but the test is flaky at window boundaries and fixed windows allow a 2× burst (B-1 / S-2)                                            |

### Customer management

| Feature                                | Result     | Evidence                                                                                                     |
| -------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| Create individual customer             | PASS       | CI E2E; 12 individual records on `development`, each with a `customer.created` audit row                     |
| Create company customer (optional TIN) | PASS       | CI E2E; 5 company records                                                                                    |
| Individual/company validation          | PASS       | Unit schema tests; DB CHECK constraints; 0 rows violating the name-by-kind rule                              |
| Edit customer                          | NOT TESTED | No E2E step; 0 `customer.updated` audit rows anywhere                                                        |
| Add contact (E.164, TZ default)        | PASS       | CI E2E (local `0754…` → `+255 754…`); 12 contacts                                                            |
| Remove contact / set primary contact   | NOT TESTED | No E2E step (DB rules "one primary", "no duplicate contact" are integration-tested)                          |
| Duplicate / shared-number warnings     | PASS       | CI E2E warning + explicit confirmation                                                                       |
| Search (name, phone, plate)            | PASS       | CI E2E; technician phone search blocked                                                                      |
| Archive                                | PASS       | CI E2E; 5 archived customers, each with a `customer.archived` audit row                                      |
| Restore                                | NOT TESTED | No test; 0 `customer.restored` audit rows                                                                    |
| Transactional audit logging            | PASS       | 0 customers/vehicles without their audit row; append-only trigger present; 0 unmasked phones/emails in audit |

### Vehicle management

| Feature                           | Result     | Evidence                                                                                              |
| --------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| Create vehicle                    | PASS       | CI E2E; 5 vehicles, each audited                                                                      |
| Edit vehicle                      | NOT TESTED | No E2E step; 0 `vehicle.updated` audit rows                                                           |
| VIN validation                    | PASS       | Unit (ISO 3779 check digit warning); CI E2E invalid VIN rejected                                      |
| Registration history              | PASS       | CI E2E; 10 registrations for 5 vehicles, exactly one current plate each                               |
| Owner assignment                  | PASS       | CI E2E; 5 `vehicle.ownership_set`                                                                     |
| Ownership transfer                | PASS       | CI E2E; 30 `vehicle.ownership_transferred`; customer page shows only own periods                      |
| Keeper assign / end               | NOT TESTED | No E2E step; 0 keeper audit rows (overlap constraint is integration-tested)                           |
| Duplicate VIN prevention          | PASS       | CI E2E; exclusion `vehicles_vin_unique_active`; 0 duplicates                                          |
| Duplicate registration prevention | PASS       | Integration on `ci-testing`; exclusion `vehicle_registrations_plate_no_overlap`; 0 violations         |
| Archive vehicle                   | NOT TESTED | No E2E step; 0 `vehicle.archived` audit rows                                                          |
| Concurrent ownership updates      | PASS       | Two-session integration test (CI `ci-testing`, 35/35 today 00:14 UTC); CI E2E stale transfer rejected |

### Data integrity on `development` (read-only)

All 0: vehicles with two open owners, vehicles with two current plates, a plate current on two
vehicles, duplicate active VINs, active vehicles without a plate, reversed date ranges, invalid
customer kinds. All 7 exclusion constraints and 44 CHECK constraints are present; schema drift none;
3/3 migrations applied.

### Test runs

| Run                    | Where           | Result                                           |
| ---------------------- | --------------- | ------------------------------------------------ |
| Typecheck, lint, build | local, no DB    | pass                                             |
| Vitest unit            | local, no DB    | 159/159                                          |
| Playwright, no-DB mode | local           | 52 passed, 38 skipped (DB-only)                  |
| Vitest integration     | CI `ci-testing` | 35/35                                            |
| Playwright, DB mode    | CI `ci-testing` | 74 passed, 1 flaky (passed on retry), 15 skipped |
| CI cleanup             | CI `ci-testing` | remaining E2E customers 0, vehicles 0            |

Integration and DB-mode browser tests were **not** run against `development`: the concurrency test
commits and then deletes fixtures, and the browser tests create records, which needs your approval.

## 2. E2E records on `development`

| Question                       | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What is there                  | 17 customers (all named `E2E …`, 5 archived), 12 contacts, 5 vehicles (VIN and first plate start with `E2E`), 10 registrations, 15 ownerships, 86 audit rows, 11 rate-limit buckets, 2 test staff (`e2e.owner`, `e2e.technician` @example.test). No non-E2E customer or vehicle exists; your OWNER account has created nothing yet.                                                                                                                      |
| Which test created them        | `tests/e2e/customers-vehicles.spec.ts` (names `E2E Asha/Baraka <run>`, `E2E Kilimo <run> Ltd`, VIN `E2E…`, plate `E2E<run>`), signed in as the `e2e.owner` test account                                                                                                                                                                                                                                                                                  |
| Local or CI                    | **Local.** Six run IDs: five on 24 Nov 10:34–10:44 UTC and one at 23:36 UTC. They match the DB-mode Playwright runs made from this machine during Phase 1B (recorded commands at 10:37, 10:43 and 23:36 UTC). CI never had `development` credentials: the only repository secrets are the two `NEON_CI_*` ones, created at 23:50 UTC, after the last record.                                                                                             |
| Is CI isolated to `ci-testing` | **Yes.** The database job takes only `NEON_CI_*` secrets, sets `NEON_BRANCH=ci-testing`, forbids the dev and prod endpoints, and `db:verify-ci` printed `OK — branch "ci-testing", endpoint ep-nameless-grass-bg6ppo3o`. The quality and Playwright jobs get no database URL.                                                                                                                                                                            |
| Safe to remove later           | **Yes, with care.** They are test data only. Customers, contacts, vehicles, registrations, ownerships and rate-limit buckets can be deleted in dependency order. Audit rows are append-only by design and stay. The two test staff accounts cannot be deleted (audit rows reference them); deactivate them instead if they are no longer needed. `db:ci-cleanup` refuses anything but `ci-testing`, so a separate, approved dev cleanup would be needed. |

Nothing was deleted or modified.

## 3. Verified functionality

Everything marked PASS above.

## 4. Existing limitations

- L-1 JWT sessions cannot be revoked early (sign-out clears the cookie only); 8-hour lifetime.
- L-2 Staff `created_at`/`last_login_at` are `timestamp` without time zone (Phase 0 table); all
  Phase 1A/1B tables use `timestamptz`.
- L-3 Vehicles have archive but no restore in the UI.
- L-4 Kiswahili strings await native-speaker review; public site is English only.
- L-5 No customer merge (J-01); duplicates accumulate.
- L-6 Phone search is substring-on-digits (fine at garage scale).

## 5. Bugs requiring correction

- **B-1 Flaky rate-limit test (test defect).** In CI run `45516144085` the 11th sign-in attempt
  was still accepted. The run straddled 00:15:00 UTC, and the limiter uses clock-aligned 15-minute
  windows (`windowStartFor`), so the counter reset mid-test. It passed on retry. Fix: make the test
  avoid window boundaries, or move the limiter to a sliding window (also fixes S-2).
- **B-2 Stale red CI on `develop`.** Push run `45512950132` (23:47 UTC) failed only because the
  `NEON_CI_*` secrets were added three minutes later. Code unchanged since and green on PR #7; a
  re-run clears it.

No functional defect was found in customer or vehicle management.

## 6. Security findings

| #   | Severity | Finding                                                                                                                                                   |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-1 | Medium   | Deactivating a staff member or changing their role does not end an existing session (up to 8 h). The role comes from the token, not re-checked in the DB. |
| S-2 | Low      | Fixed windows let an attacker make up to 2× the sign-in limit (20 attempts) across a window boundary.                                                     |
| S-3 | Low      | Sign-in success/failure and sign-out are only in application logs, not `audit_logs` (`auth_events` is planned for Phase 1C).                              |
| S-4 | Info     | `npm audit`: 3 high, 4 moderate, all in dev tooling (unchanged).                                                                                          |
| —   | Pass     | No unmasked phone/email in audit rows; append-only audit trigger active; no secrets in repo; every server action permission-checked.                      |

## 7. Planned for later phases

Bookings, Calendar, Technicians, Service Bays, Reminders and Settings (placeholders); guest booking,
customer portal and OTP (Phase 1C, needs Q-07 SMS/OTP provider and Q-08 booking-review model);
`auth_sessions`/`auth_events` (revocable sessions, sign-in audit); customer merge; scheduling.

## 8. Recommendation

**CONDITIONAL GO** for Phase 1C. Phase 1B works as designed and its data on `development` is
consistent, but before starting:

1. Approve and run the NOT TESTED flows (customer edit/restore, contact remove/primary, vehicle
   edit/archive, keeper assign/end) — ideally on a temporary Neon branch copied from `development`
   and deleted afterwards, so `development` itself is not changed.
2. Fix B-1 (and, if you agree, S-2) and re-run CI on `develop` (B-2).
3. Decide Q-07 and Q-08; plan S-1/S-3 into Phase 1C (`auth_sessions`, `auth_events`).
4. Kiswahili review can run in parallel.
