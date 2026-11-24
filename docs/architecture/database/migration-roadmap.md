# Incremental migration roadmap

- **Status:** Phase 1A implemented; later phases planned (2026-11-24).
- **Principles (BR-15, ADR 0009):** one reviewed migration (or a small set) per phase. Additive by
  default. Each migration is dry-run inside a rolled-back transaction on `development`, then applied
  with the guarded `npm run db:migrate:deploy`, then checked for drift with
  `prisma migrate diff --from-config-datasource --to-schema … --exit-code`. Production receives
  migrations only through an owner-approved release.
- **Destructive changes** (drop, rename, type narrowing, NOT NULL on populated columns) use
  **expand → migrate → contract** across at least two releases, with a backup branch (Neon
  point-in-time branch) taken immediately before the contract step.
- **Rollback:** PostgreSQL DDL is transactional, so a failed migration leaves nothing behind.
  After a successful apply, rollback is a new forward migration. Neon instant restore (branch from
  a timestamp before the migration) is the disaster-recovery path. `prisma migrate reset` is
  never used.

## Overview

| Phase  | Theme                                    | New tables | Depends on |
| ------ | ---------------------------------------- | ---------- | ---------- |
| P0     | Staff authentication                     | 1          | —          |
| **1A** | Shared platform foundation               | **2**      | P0         |
| 1B     | Customers and vehicles                   | 6          | 1A         |
| 1C     | Guest booking and customer portal access | 12         | 1B         |
| 1D     | Dashboard, booking management, RBAC      | 5          | 1C         |
| 1E     | Scheduling resources and appointments    | 15         | 1D         |
| 1F     | Consent, notifications, reminders        | 13         | 1E         |
| Future | Workshop, quotations, inventory, finance | ~23        | 1F         |

---

## Phase 1A — shared platform foundation ✅ (this PR)

| Item                | Detail                                                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration           | `20261124000000_phase_1a_platform_foundation`                                                                                                                                 |
| Tables introduced   | `garage_profile`, `audit_logs`                                                                                                                                                |
| Types introduced    | enum `AuditActorType`; function `audit_logs_reject_mutation()`                                                                                                                |
| Tables modified     | None in SQL. `staff_users` gains only a Prisma back-relation (`auditLogs`); its table is untouched                                                                            |
| Indexes             | `garage_profile_singleton_key` (UK); `audit_logs_entity_idx`, `audit_logs_actor_staff_idx`, `audit_logs_action_idx`                                                           |
| Constraints         | FK `audit_logs_actor_staff_user_id_fkey` (RESTRICT); 8 CHECKs on `garage_profile`; 8 CHECKs on `audit_logs`; triggers `audit_logs_no_update_delete`, `audit_logs_no_truncate` |
| Dependencies        | PostgreSQL ≥ 18 (`uuidv7()`); `staff_users`                                                                                                                                   |
| Data migration      | None in the migration. The owner-approved MAPESA GARAGE profile (TZ, Africa/Dar_es_Salaam, TZS) is set per environment with `npm run garage:profile` (done on `development`)  |
| Verification tests  | `tests/integration/phase-1a-schema.test.ts`: UUIDv7 keys, singleton, every CHECK, FK, RESTRICT, append-only (UPDATE/DELETE/TRUNCATE). Existing staff auth E2E. Drift check    |
| Rollback / recovery | Additive. If needed before any data exists: a forward migration dropping the two tables, the enum and the function (owner approval). With data: keep the tables               |

Why only these two: both are needed by 1B and every later phase. `garage_profile.country_code` is
the default region for phone normalisation, and every customer/vehicle mutation must write an
audit row in the same transaction. Nothing else is created early.

## Phase 1B — customer and vehicle management ✅ (implemented, PR pending)

Implemented as migration `20261124120000_phase_1b_customers_vehicles` (see the data dictionary,
Part 1). Differences from the plan: `customer_merges` deferred (J-01), `rate_limit_buckets` added
(ADR 0015), and uniqueness "among active rows" implemented as btree exclusion constraints, which
Prisma does not try to manage.

Detailed plan for owner review: [`docs/progress/phase-1b-plan.md`](../../progress/phase-1b-plan.md).
Owner decisions D-01–D-07 (`domain-model.md` §6.1) apply: `INDIVIDUAL`/`COMPANY` customers, shared
phone numbers allowed, Tanzania (+255) phone normalisation.

| Item               | Detail                                                                                                                                                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables introduced  | `customers`, `customer_contacts`, `vehicles`, `vehicle_registrations`, `vehicle_ownerships`, `customer_merges`                                                                                                                     |
| Tables modified    | `audit_logs` + `subject_customer_id uuid NULL`, `subject_vehicle_id uuid NULL` (by value, indexed) for activity timelines. `actor_portal_account_id` arrives in 1C with the portal                                                 |
| Extensions         | `btree_gist` (ownership and plate exclusion), `pg_trgm` (duplicate search)                                                                                                                                                         |
| Indexes            | Partial UK VIN; partial UK primary contact per kind; `(kind, value_normalised)`; trigram on `lower(display_name)`, `plate_normalised`; FK indexes                                                                                  |
| Constraints        | EXCLUDE one active plate per `(country_code, plate_normalised)`; EXCLUDE one `OWNER` per vehicle at a time; E.164 and VIN CHECKs; name-by-kind CHECK                                                                               |
| Dependencies       | 1A (`garage_profile` must be set before phone input is accepted), `libphonenumber-js` dependency                                                                                                                                   |
| Data migration     | None (no legacy data). An optional import tool for existing customer lists is a separate decision                                                                                                                                  |
| Verification tests | Normaliser unit tests (phone by region, VIN, plate); duplicate VIN rejected; plate reuse after validity ends allowed; concurrent ownership overlap rejected; merge re-points FKs; audit rows written in same tx; staff-only access |
| Rollback           | Additive; contract only by forward migration                                                                                                                                                                                       |

## Phase 1C — guest booking schema and workflow

| Item               | Detail                                                                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tables introduced  | `service_categories`, `service_definitions`, `booking_requests`, `booking_request_services`, `booking_status_history`, `file_attachments`, `booking_attachments`, `customer_verification_challenges`, `customer_portal_accounts`, `customer_portal_access`, `auth_sessions`, `auth_events` |
| Tables modified    | —                                                                                                                                                                                                                                                                                          |
| Indexes            | UK `booking_requests.reference`, UK `idempotency_key`; `(status, submitted_at)`; challenge `(target, created_at DESC)`; UK `auth_sessions.token_hash`                                                                                                                                      |
| Constraints        | Status enum; CHECK attempts ≤ 5; exclusive arc on sessions; file MIME/size CHECKs                                                                                                                                                                                                          |
| Dependencies       | 1B (matching targets); object storage bucket; SMS provider for OTP (Q-07); rate limiting (Phase 0 open item)                                                                                                                                                                               |
| Data migration     | Seed the initial service catalogue through a reviewed migration or admin UI, **with real garage services from the owner**, never placeholders                                                                                                                                              |
| Verification tests | Guest submission never reveals matches (identical responses); idempotent replay; `/track` requires reference + OTP; OTP lockout; session scope test; no capacity consumed (BR-07)                                                                                                          |
| Rollback           | Additive                                                                                                                                                                                                                                                                                   |

## Phase 1D — garage dashboard and booking management

| Item               | Detail                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables introduced  | `roles`, `permissions`, `role_permissions`, `staff_role_assignments`, `system_settings`                                                                             |
| Tables modified    | `staff_users.role` kept (expand). Data migration copies each user's enum role into `staff_role_assignments`. The column is removed only in a later contract release |
| Indexes            | Partial UK active assignment; `permission_id`                                                                                                                       |
| Constraints        | System roles undeletable                                                                                                                                            |
| Dependencies       | 1C                                                                                                                                                                  |
| Data migration     | **Yes**: role enum → assignments, in the migration, idempotent (`INSERT … ON CONFLICT DO NOTHING`)                                                                  |
| Verification tests | Every existing staff user keeps identical access before/after; permission checks per route; audit of role changes                                                   |
| Rollback           | Auth reads both sources during the expand window, so falling back to the enum is a config switch                                                                    |

## Phase 1E — scheduling resources, appointments and allocations

| Item               | Detail                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables introduced  | `scheduling_resources`, `technicians`, `service_bays`, `skills`, `technician_skills`, `bay_capabilities`, `service_requirements`, `garage_working_hours`, `garage_closures`, `technician_shifts`, `technician_leave`, `appointments`, `appointment_services`, `capacity_holds`, `resource_reservations` |
| Tables modified    | —                                                                                                                                                                                                                                                                                                       |
| Indexes            | GiST on all `tstzrange` columns; FK indexes; `(status, expires_at)` on holds                                                                                                                                                                                                                            |
| Constraints        | **`resource_reservations_no_overlap` exclusion**; shift/working-hour overlap exclusions; subtype kind triggers; range validity CHECKs                                                                                                                                                                   |
| Dependencies       | 1D; `btree_gist` (from 1B)                                                                                                                                                                                                                                                                              |
| Data migration     | None; the owner configures hours, bays, technicians and skills                                                                                                                                                                                                                                          |
| Verification tests | See `scheduling-model.md` §6.5 (parallel-transaction overbooking tests, back-to-back, holds expiry, multi-resource atomicity)                                                                                                                                                                           |
| Rollback           | Additive                                                                                                                                                                                                                                                                                                |

## Phase 1F — consent, notification outbox and service reminders

| Item               | Detail                                                                                                                                                                                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables introduced  | `customer_communication_preferences`, `consent_records`, `notification_templates`, `notification_outbox`, `notification_delivery_attempts`, `notification_provider_events`, `booking_communications`, `service_records`, `mileage_readings`, `reminder_rules`, `reminder_schedules`, `integration_configs`, `background_job_runs` |
| Tables modified    | —                                                                                                                                                                                                                                                                                                                                 |
| Indexes            | UK idempotency keys; `(status, not_before)`; `(vehicle_id, read_at DESC)`; `(state, next_notify_at)`                                                                                                                                                                                                                              |
| Constraints        | Append-only consent (trigger); interval CHECK; mileage source enum                                                                                                                                                                                                                                                                |
| Dependencies       | 1E; notification provider decision (Q-07); scheduled job runner                                                                                                                                                                                                                                                                   |
| Data migration     | Optional import of historical service records (flagged `source = IMPORTED`)                                                                                                                                                                                                                                                       |
| Verification tests | No send without consent; quiet hours; outbox exactly-once enqueue; webhook dedupe; reminder due by date vs km; estimate flagged                                                                                                                                                                                                   |
| Rollback           | Additive; outbox can be paused by setting                                                                                                                                                                                                                                                                                         |

## Future phases

| Phase (indicative)  | Tables                                                                                                                                                                                                 | Notes                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Workshop operations | `job_cards`, `job_card_tasks`, `job_status_history`, `vehicle_inspections`, `inspection_findings`, `diagnostic_results`, `work_logs`, `qc_inspections`, `vehicle_handovers`, `paint_production_blocks` | `resource_reservations` gains `paint_production_block_id` (additive) and kind `PRODUCTION`                  |
| Parts and inventory | `parts`, `part_requirements`, `part_usages` (then stock locations, movements, suppliers, purchase orders)                                                                                              | Inventory valuation method is an open question                                                              |
| Quotations          | `quotations`, `quotation_lines`, `quotation_approvals`                                                                                                                                                 | Immutability trigger after send                                                                             |
| Finance             | `invoices`, `invoice_lines`, `payments`, `refunds`, `financial_adjustments`, invoice series counters                                                                                                   | Tax and e-invoicing compliance (Q-05) must be settled first                                                 |
| Retention extras    | `service_recommendations`                                                                                                                                                                              | —                                                                                                           |
| Platform hardening  | Audit partitioning by year; Phase 0 debt: `staff_users` `timestamp` → `timestamptz` (R-04)                                                                                                             | `ALTER COLUMN … TYPE timestamptz USING … AT TIME ZONE 'UTC'` rewrites the table; schedule in a quiet window |
