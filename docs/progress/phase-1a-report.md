# Phase 1A report — Full database architecture and Phase 1A foundation

- **Date:** 2026-11-24
- **Branch:** `feature/phase-1a-database-architecture` (from `develop` at `8814039`) → PR into `develop`
- **Status:** Architecture designed for the whole system; Phase 1A foundation implemented and
  verified on Neon `development`. `production` not modified.

## 1. Baseline (Task 0)

| Check                | Result                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR #2 (Phase 0.2)    | Reviewed (CI green, mergeable, no secrets in history) and merged into `feature/phase-0-foundation` as `d542b37` with owner approval                                                      |
| PR #1 (Phase 0)      | Re-run CI on `d542b37` green; merged into `develop` as `8814039` with owner approval                                                                                                     |
| `develop`            | Tree identical to the Phase 0.2 head; contains all Phase 0 and 0.2 work                                                                                                                  |
| `main`               | Unchanged at `f7abc68`                                                                                                                                                                   |
| `develop` validation | `npm run validate` exit 0 (65 tests, build); Playwright with DB 48/48                                                                                                                    |
| Neon                 | Project `quiet-violet-31193699`; `.neon` and `.env` on `development` (`br-wild-river-bgrlfo90`, endpoint `ep-rapid-lake-bgk09wmz`); `production` (`br-still-bar-bgjl83o4`) has no tables |

## 2. Deliverables

| Document                                                                | Content                                                                                                                                                          |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`domain-model.md`](../architecture/database/domain-model.md)           | Principles, 8 bounded contexts, ~80-table catalogue with phase, identity relationships, assumptions, open questions                                              |
| [`erd.md`](../architecture/database/erd.md)                             | Mermaid context map plus one ERD per domain; referential actions; indexing; lifecycle                                                                            |
| [`data-dictionary.md`](../architecture/database/data-dictionary.md)     | Full column-level dictionary for implemented tables; design-level for planned tables                                                                             |
| [`business-rules.md`](../architecture/database/business-rules.md)       | BR-01–BR-15 with enforcement layer; integrity, deletion, audit, sensitive data, normalisation, duplicates, retention, transactions, idempotency, customer access |
| [`scheduling-model.md`](../architecture/database/scheduling-model.md)   | Calendars, qualifications, durations, lifecycle, concurrency options and the exclusion-constraint design, paint vs inspection                                    |
| [`migration-roadmap.md`](../architecture/database/migration-roadmap.md) | Per-phase tables, modifications, indexes, constraints, dependencies, data migrations, tests, rollback                                                            |
| ADRs 0008–0012                                                          | Identifiers/time, migration and integrity conventions, scheduling concurrency, customer identity and access, append-only audit                                   |

## 3. Phase 1A implementation

Migration `prisma/migrations/20261124000000_phase_1a_platform_foundation/migration.sql`:

- **Created:** enum `AuditActorType`; tables `garage_profile` (singleton) and `audit_logs`
  (append-only); 4 indexes; FK `audit_logs → staff_users` (RESTRICT); 16 CHECK constraints;
  function `audit_logs_reject_mutation()` with an UPDATE/DELETE trigger and a TRUNCATE trigger.
- **Not changed:** `staff_users` (only a Prisma back-relation was added in the schema) and the
  Phase 0 migration.
- **Not created:** any customer, vehicle, booking, scheduling, notification, workshop or finance
  table. No seed or placeholder data.

Pre-apply checks (Task 7):

1. Identity: Neon API shows `development` = `br-wild-river-bgrlfo90` in `quiet-violet-31193699`,
   child of `production`; SQL shows database `neondb`, role `neondb_owner`, PostgreSQL 18.7, endpoint
   `ep-rapid-lake-bgk09wmz`. `db:guard` OK.
2. Target: `NEON_BRANCH=development`, direct (unpooled) URL.
3. SQL reviewed; generated by `prisma migrate diff --from-config-datasource --to-schema`, then
   extended with CHECKs and triggers.
4. Non-destructive: no `DROP`, no `ALTER TABLE "staff_users"`; dry-run inside `BEGIN … ROLLBACK`
   created 2 tables and 2 triggers, left `staff_users` (1 row) unchanged, and the rollback restored
   the original table set.
5. Applied with `npm run db:migrate:deploy`; `migrate status` "up to date"; drift check exit 0.

## 4. Validation (Node 22.23.5, local)

| Check                                         | Result                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------- |
| `prisma validate`                             | ✅ valid                                                                          |
| `npm run typecheck`                           | ✅                                                                                |
| `npm run lint` (`--max-warnings=0`)           | ✅                                                                                |
| Prettier                                      | ✅                                                                                |
| Vitest unit                                   | ✅ 51/51                                                                          |
| Vitest integration (live `development`)       | ✅ 26/26, 0 skipped (12 new Phase 1A schema tests)                                |
| `npm run validate` (all of the above + build) | ✅ exit 0, 77 tests                                                               |
| `npm run build`                               | ✅ exit 0                                                                         |
| Playwright with DB (`E2E_DATABASE=1`)         | ✅ 48/48, including staff sign-in, protected sections, invalid password, sign-out |
| Playwright without DB                         | ✅ 42 passed, 6 skipped (signed-in tests need the DB)                             |
| Migration compatibility                       | ✅ `migrate status` up to date; `migrate diff --exit-code` = 0 (no drift)         |
| Database identity guard                       | ✅ refuses `NEON_BRANCH=production`; allows `development`                         |
| Production untouched                          | ✅ still no tables                                                                |
| GitHub CI                                     | ⏳ runs on the Phase 1A PR (no live-DB tests in CI: no repo DB secret)            |

Phase 1A schema tests cover: UUIDv7 generation, singleton uniqueness, every `garage_profile` CHECK
(country, currency, time zone, name, E.164, email), the staff-actor FK and consistency CHECK,
action/entity/JSON CHECKs, append-only UPDATE/DELETE/TRUNCATE rejection, and RESTRICT on deleting a
staff user with audit history (`23001`). All run in rolled-back transactions; a residue check
afterwards found 0 audit rows and 0 garage profiles.

Issue found and fixed during validation: the RESTRICT test first expected `23503`; PostgreSQL
correctly raises `23001 restrict_violation` for `ON DELETE RESTRICT`. The test was corrected, not the
schema.

## 5. Risks and open questions

| #    | Risk / question                                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-01 | `uuidv7()` ties the schema to PostgreSQL ≥ 18 (ADR 0008). Neon is 18.7.                                                                               |
| R-02 | CI does not run the live-DB tests (no `NEON_DEV_DATABASE_URL` secret). Schema constraints are verified locally only.                                  |
| R-03 | Table owners can drop the audit trigger; production access must stay restricted.                                                                      |
| R-04 | `staff_users` timestamps lack a time zone (Phase 0 debt); planned conversion migration.                                                               |
| R-05 | `npm audit`: 3 high, 4 moderate in dev tooling (unchanged).                                                                                           |
| R-06 | Sign-in rate limiting still missing (required before the public booking form in 1C).                                                                  |
| R-07 | Resolved on `development`: the garage profile is set (MAPESA GARAGE, TZ). It must be set per environment before 1B goes live.                         |
| Q    | Q-01–Q-04 decided by the owner (D-01–D-07). Still open: Q-05–Q-12 in `domain-model.md` §6.2 (Q-11 chassis numbers and Q-12 company TIN matter for 1B) |

## 6. Recommendation

**CONDITIONAL GO for Phase 1B**, once:

1. The Phase 1A PR passes CI and is reviewed and approved by the owner.
2. ~~Q-02, Q-03, Q-04 answered~~: done (D-02, D-05, D-04).
3. ~~Garage profile values~~: done (D-01, D-02).
4. The owner approves the Phase 1B plan (`phase-1b-plan.md`).

## 7. Owner confirmation and completion (2026-11-24, follow-up)

| Requirement                                 | Result                                                                                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR #3 CI                                    | ✅ Both jobs green on `c641ab7` (typecheck/lint/unit/integration/build, Playwright). Re-runs on the follow-up commit                                                                                       |
| Final code review                           | ✅ Migration additive only; tests roll back; no secrets in the diff. No defects found                                                                                                                      |
| Phase 1A changes only on Neon `development` | ✅ `_prisma_migrations` on `development` lists both migrations; `production` still has no tables                                                                                                           |
| Staff authentication                        | ✅ Playwright with the database (sign-in, protected sections, invalid password, sign-out)                                                                                                                  |
| Audit retention and privacy review          | ✅ `business-rules.md` §4.1: no personal data in immutable rows, allow-list redaction, 7-year proposal, owner-approved purge procedure                                                                     |
| Approved business decisions documented      | ✅ D-01–D-07 in `domain-model.md` §6.1; ERD, data dictionary, business rules and roadmap updated; **ADR 0013** (portal accounts and explicit per-customer grants) amends ADR 0011 for shared phone numbers |
| Official name recorded                      | ✅ **MAPESA GARAGE** / **MAPESA GARAGE Management System** in `src/config/site.ts` (header, footer, page titles, sign-in card) and the docs                                                                |
| Development garage profile                  | ✅ `npm run garage:profile` (guarded, audited): MAPESA GARAGE, `TZ`, `Africa/Dar_es_Salaam`, `TZS`. No contact details, address or logo were invented                                                      |

Notes:

- A second, idempotent run of the profile script wrote an `audit_logs` row with empty `changes`
  before the script was changed to skip no-op updates. The row is harmless and cannot be removed
  (append-only by design).
- The Phase 1A schema tests now remove the real profile **inside** their rolled-back transaction so
  the singleton checks start from zero rows. The real row is untouched.

Phase 1B plan for owner review: [`phase-1b-plan.md`](phase-1b-plan.md).
