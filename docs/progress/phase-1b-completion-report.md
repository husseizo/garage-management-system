# Phase 1B completion report — customer and vehicle management

- **Date:** 2026-11-26
- **Status:** Phase 1B is **complete and verified on `develop`**. It is not yet on `main` and not deployed.
- **Verified commit:** `develop` = `be2f9df237b3b5a2f11d52294af0a1b0db8e5cf0` (merge of PR #8)
- **Follows:** `phase-1b-report.md`, `phase-1b-post-login-verification.md`,
  `phase-1b-e2e-verification.md`
- **Verification method:** read-only (GitHub API, CI logs, git). No database connection was made
  for this report. Production was last checked read-only on 2026-11-25; the owner accepted that
  baseline.

## 1. Final CI results

Workflow `CI` (`.github/workflows/ci.yml`). All runs are at attempt 1: no reruns, no automatic fixes.

| Run           | Trigger                       | Commit    | Quality job             | Playwright (no DB)   | Database tests (`ci-testing`)                          | Result      |
| ------------- | ----------------------------- | --------- | ----------------------- | -------------------- | ------------------------------------------------------ | ----------- |
| `45597181554` | PR #8 (fix branch → develop)  | `99647c7` | pass                    | pass                 | pass                                                   | **success** |
| `45599005205` | push to `develop` after merge | `be2f9df` | 175 passed / 27 skipped | 52 passed / 56 skip. | integration 38/38; E2E 84 passed / 24 skipped; 0 flaky | **success** |
| `45599019439` | PR #7 (develop → main)        | `be2f9df` | 175 passed / 27 skipped | 52 passed / 56 skip. | integration 38/38; E2E 84 passed / 24 skipped; 0 flaky | **success** |

In both runs on `be2f9df`:

- The identity guard reported `ep-nameless-grass-bg6ppo3o` (`ci-testing`).
- The migrations were up to date, with no drift.
- Cleanup removed `{registrations 3, ownerships 5, vehicles 2, customers 5, rateLimitBuckets 76}`.
- 0 E2E customers or vehicles remained.

Earlier red runs, for the record:

- `45512950132` failed before the CI secrets existed: "Database tests did NOT run".
- `45516144085` was green but had **1 flaky** test, the B-1 rate-limit test, which passed only on retry.

## 2. Branches and commits

| Ref                     | SHA                                        | Notes                                            |
| ----------------------- | ------------------------------------------ | ------------------------------------------------ |
| `main`                  | `f7a1add653e2255667077f787a54553242999176` | PR #6 merge, 2026-11-24; unchanged since         |
| `develop`               | `be2f9df237b3b5a2f11d52294af0a1b0db8e5cf0` | PR #8 merged by the owner 2026-11-25 10:51 UTC   |
| `main..develop`         | 4 commits, 18 files (+1135 / −100)         | Exactly what PR #7 would bring to `main`         |
| PR #7 (develop → main)  | head `be2f9df`                             | OPEN, MERGEABLE, CLEAN, CI green; **not merged** |
| PR #8                   | merge commit `be2f9df`                     | MERGED                                           |
| Tag `phase-1b-verified` | object `2c094d7` → commit `be2f9df`        | Annotated, created 2026-11-26 (see section 7)    |

## 3. B-1 sliding-window rate limiter: stability

| Evidence                                                                                  | Result                     |
| ----------------------------------------------------------------------------------------- | -------------------------- |
| Unit: no reset at 10:15:00; refused at 10:29:58.999, allowed at 10:29:59                  | pass (local and 3 CI runs) |
| Unit: randomised 2-hour run, every rolling window ≤ limit; 50-request burst → exactly 10  | pass                       |
| Integration on `ci-testing`, pooled URL: 30 concurrent requests from 2 pools → exactly 10 | pass in 3 CI runs          |
| E2E `rate-limit.spec` on `ci-testing`                                                     | pass, **0 flaky**, 3 runs  |
| Locally on the temporary branch: 3/3 integration runs, 5/5 repeated E2E                   | pass                       |

The limit was not weakened: it is still 10 per email and 50 per IP in any rolling 15 minutes. The
B-1 fix also closes **S-2**: an attacker can no longer get 2 × the limit across a window boundary.

## 4. Previously untested lifecycle flows

All flows marked NOT TESTED in the post-login verification have now passed. The UI was tested in
E2E and the database state was checked with read-only SQL on the temporary branch (run `LIFE3`):

- **Customers:** edit; archive and restore; remove a contact; change the primary contact; removing
  the primary promotes the next phone.
- **Vehicles:** edit; archive, which closes the plate and the ownership periods.
- **Keepers:** assign a keeper; end the keeper relationship.
- **Integrity:** audit rows, ownership history, branch-wide constraint checks, and role restrictions
  for technicians.

Details are in `phase-1b-e2e-verification.md`.

In CI, the reporter prints totals rather than test names, so the lifecycle run is shown by the
change against the last run before PR #8 (`45516144085`):

| Measure on `ci-testing`  | Before PR #8      | After PR #8       | Difference                                                  |
| ------------------------ | ----------------- | ----------------- | ----------------------------------------------------------- |
| DB-mode E2E              | 75 run / 15 skip. | 84 run / 24 skip. | +9 run (chromium), +9 skipped (mobile, by design) = 9 tests |
| Customers cleaned up     | 3                 | 5                 | +2: lifecycle owner and keeper                              |
| Vehicles / registrations | 1 / 2             | 2 / 3             | +1 / +1: lifecycle vehicle                                  |
| Ownerships               | 3                 | 5                 | +2: lifecycle OWNER and KEEPER periods                      |

**Erratum:** earlier wording said the lifecycle spec had 11 tests. It has **9**; the other 2 were
the auth-setup steps. `phase-1b-e2e-verification.md` is corrected.

## 5. Outstanding security findings

| #   | Severity | Finding                                                                                                                                                                                                                                                    | Status / proposed handling                                                         |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| S-1 | Medium   | Staff sessions cannot be revoked. Deactivation or a role change takes effect only after the JWT expires (up to 8 h), and sign-out is cookie-only.                                                                                                          | **Open.** ADR 0016 Proposed. Step 1 (no migration) can ship before Phase 1C        |
| G-1 | Medium   | The local write guard (`assertWritableTarget`, `db-guard`) trusts the self-declared `NEON_BRANCH` label. A production URL labelled `NEON_BRANCH=development` would pass.                                                                                   | **Open.** Proposed fix below                                                       |
| G-2 | Medium   | The guard runs only through `npm run db:*` scripts. `npx prisma migrate deploy`, `prisma db push` or `migrate reset` call `prisma.config.ts`, which resolves the URL but does not run `assertWritableTarget`.                                              | **Open.** Proposed fix below                                                       |
| G-3 | Low      | CI identity checks (`verify-ci-target`, `ci-cleanup`) use a deny-list of known endpoints (`CI_FORBIDDEN_ENDPOINTS`) and the `NEON_BRANCH` label, not an allow-list or the branch id reported by the server. A new or renamed endpoint would not be caught. | **Open.** Proposed fix below                                                       |
| S-3 | Low      | Sign-in success, sign-in failure and sign-out go only to application logs, not to an append-only table.                                                                                                                                                    | **Open.** `auth_events` in Phase 1C (ADR 0016 Step 2)                              |
| R-6 | Low      | The per-IP limit trusts the first `X-Forwarded-For` hop. That is only safe behind a proxy that overwrites the header.                                                                                                                                      | Open. Confirm when the hosting platform is chosen                                  |
| S-5 | Low      | The rate limiter fails open if the database is unreachable. Sign-in itself needs the database, so the exposure is small.                                                                                                                                   | Accepted (ADR 0015). Revisit with S-1                                              |
| S-4 | Info     | `npm audit`: 3 high, 4 moderate. The 3 high are in `effect` ≤ 3.22, pulled in by the Prisma CLI's config loader (`prisma` → `@prisma/config`); the 4 moderate are in shadcn's `minimatch`. All are tooling, not imported by application code.              | Unchanged. Wait for an upstream Prisma release; do not run `npm audit fix --force` |
| R-8 | Info     | Auth.js v5 is still a beta.                                                                                                                                                                                                                                | Carried                                                                            |
| S-2 | —        | Fixed-window boundary let an attacker make 2 × the limit                                                                                                                                                                                                   | **Fixed** by B-1 (PR #8)                                                           |

**Proposed guard hardening (G-1 to G-3).** This is not implemented and needs approval. It reuses the
checks that protected the temporary-branch work:

1. **Endpoint allow-list.** Each tool that writes (`db-guard`, `staff:create`, `garage:profile`,
   `db:dry-run`, `ci-cleanup`, `verify-ci-target`) gets the expected endpoint from a variable, for
   example `NEON_EXPECTED_ENDPOINT`. The tool refuses to run unless both the pooled and the direct
   URL match it, and it always refuses `ep-winter-cake-bg5s9xnm` (production) unless
   `ALLOW_PRODUCTION_DB_WRITES=true`.
2. **Server-reported identity.** Before writing, the tool runs `SELECT
current_setting('neon.branch_id', true)`. It compares the result with `NEON_BRANCH_ID` and refuses
   on a mismatch. A wrong label can then no longer fool the guard.
3. **Guard in `prisma.config.ts`.** For migrate commands, `prisma.config.ts` calls the same
   endpoint and branch check, so running `npx prisma …` directly cannot bypass it. `generate` stays
   database-free.
4. **CI.** The workflow pins `ci-testing`'s branch id and endpoint as non-secret variables and
   checks both, alongside the deny-list.
5. **Tests.** Unit tests for mismatched labels and endpoints. One read-only integration test of the
   identity query.

All five steps change only code and tests, with no migration. Estimate: a small PR.

## 6. Database state

| Branch                                                            | State                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| production `br-still-bar-bgjl83o4`                                | Empty: no tables, no migrations table, `plpgsql` only. Read-only check 2026-11-25; baseline accepted by owner |
| development `br-wild-river-bgrlfo90`                              | Unchanged by verification: 17 customers, 5 vehicles, 86 audit rows                                            |
| ci-testing `br-dawn-lake-bgrg54n5`                                | Migrated by CI (3/3); cleaned after every run                                                                 |
| temporary `br-morning-tree-bg5opwfi` (`verify-phase-1b-20261125`) | Preserved for inspection; deletion only with owner approval                                                   |

No migrations, resets, schema pushes or destructive SQL ran against production or development.

## 7. Git checkpoint

The owner approved the checkpoint, and the annotated tag **`phase-1b-verified`** was created and
pushed on 2026-11-26.

| Item                  | Value                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tag object            | `2c094d756db5183c218b2c19849f5ff40eb3853c`                                                                                                                              |
| Commit                | `be2f9df237b3b5a2f11d52294af0a1b0db8e5cf0` (`develop`, merge of PR #8)                                                                                                  |
| Checks before tagging | Full SHA resolved; tag absent locally and on `origin`; CI runs `45599005205` and `45599019439` ran at this SHA; `45597181554` ran at `99647c7`, whose tree is identical |
| Check after pushing   | `git ls-remote` shows `refs/tags/phase-1b-verified^{}` → `be2f9df`                                                                                                      |

Three green CI runs tested exactly this code, including all database tests on `ci-testing`. The tag
records the checkpoint without touching `main`, without deployment and without a production
migration.

- This report and the erratum are documentation only. They can follow in a small docs PR to
  `develop` and do not change the verified code.
- Merging PR #7 into `main` is a **separate decision**. Before production can serve the app, it
  needs:
  - its own migration run (3 migrations), approved separately;
  - a staff account;
  - the garage profile.

  If wanted, tag `main` later, for example `v0.2.0-phase-1b`, after that merge.

## 8. Phase 1B closure checklist

| Criterion                                        | Result                            |
| ------------------------------------------------ | --------------------------------- |
| Customer and vehicle management works end to end | PASS                              |
| All previously untested flows verified           | PASS                              |
| B-1 fixed without weakening the limit            | PASS, stable in 3 CI runs         |
| CI green on `develop` and on PR #7, no flaky     | PASS                              |
| Production untouched                             | PASS                              |
| Development unchanged by verification            | PASS                              |
| No secrets in repository, logs or commits        | PASS                              |
| S-1 resolved                                     | **Open**, design ready (ADR 0016) |
| Kiswahili native-speaker review                  | **Open**, owner action            |

**Phase 1B: GO to close.** S-1, G-1 to G-3 and the Kiswahili review are carried into the Phase 1C
plan and do not block closure.

---

## 9. Proposed Phase 1C plan: guest booking and customer portal access

**Status: Proposed. Nothing is implemented. Each step needs owner approval.**

Scope comes from the migration roadmap (Phase 1C), ADR 0011 and ADR 0013. Not in scope: Smart
Scheduling, Service Reminders and capacity booking (Phase 1E/1F).

### 9.1 Decisions needed before Phase 1C starts

| #      | Question                                                                             | Options                                                                                                                                                                                                               | Recommendation                                                                                                                                                                                                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-07   | Which SMS / OTP provider and channels: SMS, WhatsApp, email?                         | A Tanzanian SMS aggregator (for example Beem Africa or NextSMS); a pan-African one (for example Africa's Talking); a global one (for example Twilio). WhatsApp needs Meta business verification. Email as a fallback. | **SMS first.** Choose on: TCRA-registered sender ID ("MAPESA") support, delivery on Vodacom, Airtel, Tigo/Yas and Halotel, a sandbox, and per-SMS cost. The owner compares quotes. Code goes behind a `MessageSender` interface with a development adapter that logs nothing sensitive, so build can start before the contract is signed. |
| Q-08   | Do customers self-book confirmed slots, or are all bookings staff-reviewed requests? | (a) Every booking is a **request** that staff review. It reserves no capacity (BR-07). (b) Self-booking into confirmed slots needs resources and capacity, which arrive in Phase 1E.                                  | **(a) for Phase 1C.** It matches the current data design and needs no scheduling engine. Self-booking can be revisited after 1E.                                                                                                                                                                                                          |
| D-1C-1 | Service catalogue content                                                            | Real garage services, names in English and Kiswahili, optional price ranges                                                                                                                                           | The owner provides the list. It is loaded through a reviewed migration or an admin screen, never placeholders (roadmap rule).                                                                                                                                                                                                             |
| D-1C-2 | Photo attachments on bookings                                                        | Object storage provider (needs a bucket), or defer attachments                                                                                                                                                        | Defer attachments to a later 1C step unless photos are needed at launch.                                                                                                                                                                                                                                                                  |
| D-1C-3 | ADR 0016 (S-1)                                                                       | Approve Step 1 now; Step 2 with the 1C migration                                                                                                                                                                      | Approve both. Step 2 shares the `auth_sessions` table with the portal.                                                                                                                                                                                                                                                                    |
| D-1C-4 | Guard hardening (G-1 to G-3)                                                         | Before 1C, or alongside it                                                                                                                                                                                            | **Before.** Phase 1C adds the first public write paths.                                                                                                                                                                                                                                                                                   |

### 9.2 Proposed steps (one PR each, CI on `ci-testing`, temporary Neon branch for E2E)

| Step | Content                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Needs        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 1C-0 | **Hardening, no migration:** G-1 to G-3 guard fix; S-1 Step 1 (re-read `active` and role on every request); cosmetic test-title fix                                                                                                                                                                                                                                                                                                                                                                     | Approval     |
| 1C-1 | **One additive migration:** `service_categories`, `service_definitions`, `booking_requests`, `booking_request_services`, `booking_status_history`, `customer_verification_challenges`, `customer_portal_accounts`, `customer_portal_access`, `auth_sessions`, `auth_events`; plus `file_attachments` and `booking_attachments` if D-1C-2 says so. UK on reference and idempotency key; attempts ≤ 5 CHECK; exclusive arc on sessions. Tested on a temporary branch, then `development` and `ci-testing` | Q-08, D-1C-2 |
| 1C-2 | **Service catalogue:** staff screen to manage categories and services (OWNER/MANAGER), plus the owner's real list                                                                                                                                                                                                                                                                                                                                                                                       | D-1C-1       |
| 1C-3 | **Guest booking `/book`:** snapshot of what the guest typed (`customer_id = NULL`); reference; idempotent replay; per-IP and per-phone rate limits; **identical response whether or not a customer matches**; English and Kiswahili                                                                                                                                                                                                                                                                     | 1C-1, 1C-2   |
| 1C-4 | **Staff booking inbox:** list and filter, status transitions with history, explicit audited "match to customer / create customer"; no capacity consumed                                                                                                                                                                                                                                                                                                                                                 | 1C-3, Q-08   |
| 1C-5 | **`/track`:** reference plus a one-time code to the contact on that request; hashed challenge, short expiry, lockout after 5 attempts; generic errors                                                                                                                                                                                                                                                                                                                                                   | Q-07         |
| 1C-6 | **Staff sessions (ADR 0016 Step 2) and `auth_events`:** `sid` in the JWT; revoke on sign-out, deactivation and role change; sign-in audit (closes S-1, S-3)                                                                                                                                                                                                                                                                                                                                             | 1C-1         |
| 1C-7 | **Portal:** OTP sign-in to a portal account; staff "portal access" screen to grant or revoke per customer after an identity check; `/portal` shows only granted customers and the vehicles they currently own (`assertCustomerAccess` on every query). A customer session can never satisfy a staff guard                                                                                                                                                                                               | Q-07, 1C-6   |
| 1C-8 | **Phase verification:** roadmap tests (no match leakage, idempotency, OTP lockout, session scope, revoked grant, no capacity used); temporary-branch E2E; CI; completion report                                                                                                                                                                                                                                                                                                                         | All          |

Steps 1C-3 to 1C-4 can ship before Q-07 is settled. 1C-5 and 1C-7 wait for a provider. All steps
keep the current rules: no production writes, no destructive migrations, `development` used only
read-only for verification, and every database write is verified against the target branch's
identity.

### 9.3 Owner actions requested

1. ~~Approve the checkpoint tag in section 7.~~ Done: `phase-1b-verified` created 2026-11-26.
2. Decide Q-07 (provider shortlist and quotes) and Q-08 (recommendation: staff-reviewed requests).
3. Approve 1C-0 (guard hardening and S-1 Step 1) as the first Phase 1C pull request.
4. Provide the real service list (D-1C-1) and decide on attachments (D-1C-2).
5. Arrange the Kiswahili review.
6. Decide when to delete the temporary branch `br-morning-tree-bg5opwfi`.
7. Decide separately when to merge PR #7 and run the production migration.
