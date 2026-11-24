# Business rules, data integrity and security

- **Status:** Phase 1A design baseline (2026-11-24)
- Each rule names where it is enforced: **DB** (constraint, trigger, exclusion), **APP** (module
  service plus Zod), or **ACCESS** (authorization and projection layer). Rules marked _1A_ are
  enforced by tables that exist today; the rest are enforced when their phase lands.

## 1. Business rules

| ID    | Rule                                                                                               | Enforcement                                                                                                                                                                                                                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BR-01 | Customer identity uses internal UUID identifiers.                                                  | **DB**: `customers.id uuid DEFAULT uuidv7()`, the pattern established by 1A tables (ADR 0008). Phone, email and VIN are attributes, never keys. URLs and APIs expose the UUID only to authorised staff or the verified customer.                                                                                  |
| BR-02 | Guest booking must not expose existing customer information.                                       | **APP + ACCESS**: a guest submission is stored as a snapshot on `booking_requests` with `customer_id = NULL`. The public flow never looks up or confirms whether a phone, email or plate already exists. Responses are identical whether or not a match exists. Matching is a staff-only action in the dashboard. |
| BR-03 | VIN is preferred but may be unavailable initially.                                                 | **DB**: `vehicles.vin_normalised` nullable, partial unique `WHERE vin_normalised IS NOT NULL`. **APP**: staff are prompted to capture VIN at first check-in.                                                                                                                                                      |
| BR-04 | Registration numbers are not permanent vehicle identity.                                           | **DB**: plates live in `vehicle_registrations` with a `valid tstzrange`; an exclusion constraint stops one plate being active on two vehicles at once, but the plate can move between vehicles over time. FKs always point to `vehicles.id`.                                                                      |
| BR-05 | Ownership changes preserve service history without exposing previous owners' personal information. | **DB**: history (`service_records`, `mileage_readings`, inspections) is keyed by `vehicle_id`; `vehicle_ownerships` records periods. **ACCESS**: the portal shows a vehicle's service history (date, work, mileage) to the current owner, without names, contacts, invoices or communications of earlier owners.  |
| BR-06 | Booking requests and confirmed appointments are separate concepts.                                 | **DB**: separate tables `booking_requests` and `appointments`, linked 1:0..1 (partial unique on active appointment per request).                                                                                                                                                                                  |
| BR-07 | Pending bookings do not consume confirmed capacity.                                                | **DB**: only `resource_reservations` with status `HELD` (short-lived, staff-initiated) or `CONFIRMED` take part in the exclusion constraint. `booking_requests` never create reservations.                                                                                                                        |
| BR-08 | Scheduling accounts for technicians, skills, bays, working hours and blocked periods.              | **APP** (slot search) over **DB** data: working hours, closures, shifts, leave, skills, bay capabilities and service requirements. See `scheduling-model.md`.                                                                                                                                                     |
| BR-09 | Concurrent confirmations must not overbook resources.                                              | **DB**: GiST exclusion constraint on `resource_reservations (resource_id WITH =, during WITH &&)`. The second concurrent insert fails with `23P01` and the transaction rolls back.                                                                                                                                |
| BR-10 | Bodywork inspection scheduling is separate from long-running paint production scheduling.          | **DB**: inspections are normal appointments with short reservations; paint production uses `paint_production_blocks` (stages spanning days) whose booth time is a `resource_reservations` row of kind `PRODUCTION`. Separate lifecycles, one capacity constraint.                                                 |
| BR-11 | Service reminders support date-based and mileage-based rules.                                      | **DB**: `reminder_rules.interval_months` and/or `interval_km` (CHECK at least one). `reminder_schedules` stores both `due_on` and `due_at_km`; whichever comes first triggers.                                                                                                                                    |
| BR-12 | Mileage estimates are distinguishable from verified mileage.                                       | **DB**: `mileage_readings.source` enum (`VERIFIED_INSPECTION`, `CUSTOMER_REPORTED`, `ESTIMATED`); `reminder_schedules.due_km_is_estimate`. Estimates are computed, never stored as if read.                                                                                                                       |
| BR-13 | Notifications respect consent and communication preferences.                                       | **APP + DB**: the outbox writer checks the latest `consent_records` row and `customer_communication_preferences` at enqueue time and again at send time; it records `consent_checked_at`. Transactional messages (e.g. an OTP the customer asked for) are a separate purpose from marketing or reminders.         |
| BR-14 | Financial and workshop records keep audit history.                                                 | **DB** _1A_: `audit_logs` append-only (trigger). Later: status-history tables are append-only; issued invoices and sent quotations are immutable (trigger); corrections are new rows.                                                                                                                             |
| BR-15 | Migrations are incremental and non-destructive by default.                                         | **Process** _1A_: one migration per phase, reviewed SQL, dry-run in a rolled-back transaction, `db:guard` blocks production, destructive steps need an expand → migrate → contract plan with owner approval (ADR 0003, 0009).                                                                                     |

## 2. Referential integrity

1. Every relationship is a real foreign key. The only by-value reference is
   `audit_logs.entity_type/entity_id` (ADR 0012).
2. ON DELETE defaults to **RESTRICT**. CASCADE only for owned detail rows (lines, attempts, join
   rows). See `erd.md` §Referential actions.
3. Business tables are not hard-deleted in normal operation, so RESTRICT mostly protects against
   mistakes and scripts.
4. Exclusive arcs (one of several nullable FKs) use a CHECK `num_nonnulls(a, b) = 1` instead of a
   polymorphic `(type, id)` pair.
5. Supertype/subtype (`scheduling_resources` → `technicians`/`service_bays`) uses a unique FK on the
   subtype plus a trigger checking the supertype's `kind`.

## 3. Soft deletion versus hard deletion

| Category                                                                                              | Strategy                                                                                                                     |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Master data people search for (customers, contacts, vehicles, service definitions, technicians, bays) | **Soft delete** (`deleted_at` or `active = false`), excluded by partial unique indexes and default queries                   |
| Historical/financial records                                                                          | **Never deleted.** Cancelled or voided by status; corrected by new rows                                                      |
| Ephemeral security data (OTP challenges, expired sessions, idempotency records)                       | **Hard delete** by background job after expiry + 30 days                                                                     |
| Personal data on erasure request                                                                      | **Anonymise** in place: replace PII with tokens, null contact values, set `anonymised_at`; keep IDs and non-personal history |
| Staff users                                                                                           | Deactivate (`active = false`). Hard delete blocked once audit history exists (RESTRICT, _1A_)                                |

## 4. Audit trail requirements

- **What is audited** (`audit_logs`): staff sign-in/out and failures (via `auth_events` and a summary
  audit row), permission and role changes, garage profile and settings changes, customer/vehicle
  create/merge/anonymise, ownership transfers, booking confirmations and cancellations, quotation
  sends and approvals, invoice issue/void, payments/refunds/adjustments, data exports, and any
  production maintenance procedure.
- **How**: written in the **same transaction** as the change it describes, so the audit row and the
  change commit or roll back together.
- **Content**: actor, action, entity, redacted `changes` (`{field: {from, to}}`), `request_id`.
  **Never**: passwords, hashes, OTP codes, tokens, full phone numbers or emails (mask, e.g.
  `+2557•••••678`), file contents.
- **Integrity** _1A_: UPDATE/DELETE/TRUNCATE rejected by trigger; staff actors protected by RESTRICT.
- **Access**: owner/manager only, read-only. Audit reads of sensitive records are themselves audited
  from 1D.

### 4.1 Audit log retention and privacy review (Phase 1A)

Reviewed 2026-11-24 against the implemented `audit_logs` table and Tanzania's Personal Data
Protection Act, 2022 (legal confirmation pending, Q-06).

| Topic                    | Finding / rule                                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Immutability vs. erasure | Audit rows cannot be edited, so **personal data must never enter them**. Customers are referenced only by UUID (`entity_id`). After anonymisation, the UUID no longer resolves to a person, so the audit trail becomes pseudonymous without rewriting it.                                                                                             |
| `changes` content        | Allow-list only: each module declares which fields may be audited. Contact values are masked (`+2557•••••678`, `j•••@example.com`), and names are recorded as "changed" without values. Secrets, hashes, OTPs, tokens, file contents and free-text notes are never written. Phase 1B adds a `recordAudit()` helper with unit tests for this.          |
| Staff identity           | `actor_staff_user_id` is staff personal data, processed for security and accountability (legitimate interest). Staff are deactivated, not deleted (RESTRICT), so the actor stays attributable.                                                                                                                                                        |
| Network data             | No raw IP addresses or user agents are stored. `metadata` may hold a keyed hash for abuse investigation only.                                                                                                                                                                                                                                         |
| Access                   | Read-only, owner and manager roles only (1D). Exports of audit data are themselves audited.                                                                                                                                                                                                                                                           |
| Retention                | Proposed 7 years, covering the tax-record retention commonly required under Tanzania's Tax Administration Act (to be confirmed, Q-06). Rows older than the period are removed only by the purge procedure below.                                                                                                                                      |
| Purge procedure          | Owner-approved, one transaction: `ALTER TABLE audit_logs DISABLE TRIGGER audit_logs_no_update_delete` → `DELETE … WHERE occurred_at < cutoff` → re-enable trigger → insert an `audit_logs.purged` row recording cutoff and count. Run only with production approval; partition by year once volume justifies it, so a purge becomes a partition drop. |
| Phase 1A data            | Development contains two `SYSTEM` rows for the MAPESA GARAGE profile set-up (business data, no personal data). One has an empty `changes` object from an idempotent re-run; the script now skips no-op writes.                                                                                                                                        |

## 5. Sensitive data handling

| Data                           | Classification | Handling                                                                            |
| ------------------------------ | -------------- | ----------------------------------------------------------------------------------- |
| Staff password hashes          | Secret         | scrypt; never selected outside `authorizeStaff`; never logged (pino redaction)      |
| OTP codes, session tokens      | Secret         | Stored as SHA-256 (tokens) or HMAC (OTP) hashes only; compared in constant time     |
| Customer phone, email, address | Personal       | Stored normalised; masked in logs and audit; shown in full only to authorised staff |
| Names, vehicle ↔ person link   | Personal       | Same as above; never in URLs or query strings                                       |
| VIN, plate                     | Quasi-personal | Searchable by staff; not exposed to guests                                          |
| Payment references             | Financial      | Provider references only; **no card or bank numbers stored**                        |
| Integration secrets            | Secret         | Never in the database; `integration_configs.secret_ref` names an environment secret |
| IP addresses                   | Personal       | Stored as keyed hash for rate limiting/abuse only                                   |

Neon encrypts data at rest and requires TLS (`sslmode=require`, `channel_binding=require`).
Production access is limited to the deployment and owner-approved procedures.

## 6. Normalisation

**Phone numbers (1B).** Parse with `libphonenumber-js` using `garage_profile.country_code` as the
default region. Store `value_raw` (as typed) and `value_normalised` in E.164
(`^\+[1-9][0-9]{6,14}$`). Reject numbers that fail validation for their region. Never store
national-format variants as separate contacts.

**Email.** Trim and lower-case the whole address. No provider-specific rewriting (dots, plus tags).

**VIN (1B).** Upper-case, remove spaces and hyphens, map nothing (I, O and Q are invalid in VINs, so
they are rejected, not converted). Valid when `^[A-HJ-NPR-Z0-9]{17}$`. Check-digit validation
(position 9) is a warning, not a rejection, because many non-North-American VINs do not use it.
Pre-1981 or non-standard identifiers go in a separate `chassis_number` field (Q-11).

**Registration plates (1B).** `plate_normalised` = upper-case with spaces, hyphens and dots removed,
scoped by `country_code`. The display form (`plate_raw`) is preserved.

## 7. Duplicate detection

- **Customers.** Hard uniqueness is not enforced on names. On create and in a staff
  "possible duplicates" view, candidates are ranked by: same normalised phone or email (strong),
  trigram similarity of names ≥ 0.6 (weak), and shared vehicle (strong). Merging is an explicit,
  audited staff action that re-points FKs and keeps the losing ID in a `customer_merges` record
  (1B).
- **Vehicles.** Same `vin_normalised` → hard unique (DB). Same plate currently active → exclusion
  constraint (DB). Same make/model/year plus similar plate → warning (APP).
- **Phone shared by several customers: allowed (owner decision D-05).** Family members, a company
  and its driver, or a mechanic's customers may share one number. A shared number is a
  duplicate-candidate signal for staff, never a reason to block a save or to merge automatically. A
  number appears at most once per customer (partial unique per customer).

## 8. Data retention (proposal, pending Q-06)

| Data                              | Proposed retention                                                      |
| --------------------------------- | ----------------------------------------------------------------------- |
| Invoices, payments, refunds       | Statutory minimum (commonly 5–7 years; to be confirmed for the country) |
| Job cards and service records     | Life of the vehicle record (history value to later owners, BR-05)       |
| Unmatched guest booking snapshots | 12 months, then anonymised                                              |
| OTP challenges, expired sessions  | 30 days after expiry                                                    |
| Notification outbox and attempts  | 12 months                                                               |
| Audit logs                        | 7 years; partition by year when volume justifies it                     |

## 9. Transaction boundaries

| Operation                   | One transaction contains                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Any audited change          | The change and its `audit_logs` row                                                                                |
| Submit booking request (1C) | Request, requested services, initial status history, outbox row for the acknowledgement                            |
| Confirm appointment (1E)    | Appointment, services, all `resource_reservations` (all-or-nothing), request status change, history, outbox, audit |
| Transfer ownership (1B)     | Close current ownership period, open new one, audit                                                                |
| Issue invoice (future)      | Allocate sequence number (row lock on series counter), insert invoice and lines, set `ISSUED`, audit               |
| Record payment (future)     | Payment row, invoice balance/status, audit; webhook dedupe row                                                     |

Transactions run on the pooled connection via Prisma interactive transactions (WebSocket-backed Neon
driver). They stay short: no network calls to SMS, email or payment providers inside a transaction.
Side effects go through the outbox.

## 10. Idempotency

| Entry point               | Mechanism                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| Public booking submission | Client-generated `idempotency_key` (UK on `booking_requests`); replay returns the same result |
| Appointment confirmation  | `appointments.version` optimistic check plus the exclusion constraint                         |
| Notification enqueue      | `notification_outbox.idempotency_key`, e.g. `reminder:<schedule_id>:<due_on>`                 |
| Provider webhooks         | UK `(provider, provider_event_id)`; payments UK `(method, provider_reference)`                |
| Scheduled jobs            | `background_job_runs` UK `(job_name, run_key)`                                                |
| Migrations                | Prisma `_prisma_migrations` checksum; each migration applied once                             |

## 11. Customer verification and access boundaries

- **Booking references are not credentials.** A reference (e.g. `GMS-7KQ2-M9XD`) identifies a request
  in conversation. Knowing it grants nothing. `/track` asks for the reference **and** a one-time code
  sent to the phone or email on that request; responses do not reveal whether the reference exists
  (ADR 0011).
- **OTP challenge:** 6 digits, HMAC-hashed, 10-minute expiry, at most 5 attempts per challenge, at
  most 3 challenges per target per hour and per IP hash, lockout events in `auth_events`.
- **Phone verification is not authorisation (owner decision D-06, ADR 0013).** A successful OTP proves
  control of a phone or email and signs the person in to a `customer_portal_accounts` identity. It
  grants access to **no** customer profile by itself, even if that number appears on several
  customers.
- **Explicit per-customer grants.** Access to a customer requires an active `customer_portal_access`
  row (`HOLDER` for an individual; `COMPANY_ADMIN` or `COMPANY_VIEWER` for a company). Grants are
  created only by an explicit, audited action (staff, after identity checks at the counter or by
  call-back; or a future invitation accepted by an existing holder). They are revocable and are never
  created automatically from a phone match.
- **Customer session:** random 256-bit token in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie; only
  the SHA-256 hash is stored in `auth_sessions`; 30-minute idle and 12-hour absolute expiry;
  revocable. The session carries the portal account plus the `active_customer_id` the person chose
  from their grants.
- **Scope:** every portal query goes through an `assertCustomerAccess(customerId)` guard that
  re-checks the live grant (mirrors `assertStaff()`). Reads are limited to that customer's rows and
  to vehicles that customer currently owns (BR-05). There is no generic "fetch by id" for portal
  code. Revoking a grant takes effect on the next request.
- **Staff:** unchanged from Phase 0 (layered proxy → page → data guards). Fine-grained permissions in
  1D.
