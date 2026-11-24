# Phase 1B implementation plan: customer and vehicle management

- **Business:** MAPESA GARAGE (Tanzania, +255, `Africa/Dar_es_Salaam`, `TZS`, single garage)
- **Status:** **Proposed, awaiting owner approval.** Nothing in this plan has been implemented.
- **Date:** 2026-11-24
- **Depends on:** Phase 1A (PR #3) merged into `develop`
- **Out of scope:** guest booking, smart scheduling, service reminders, notifications, customer
  portal sign-in, workshop, finance. No production deployment or production database changes.
- **Inputs:** owner decisions D-01–D-07 (`docs/architecture/database/domain-model.md` §6.1),
  BR-01–BR-15, ADRs 0008–0013.

## Scope summary

Staff (not customers) can, from the dashboard:

1. Register and edit **individual** and **company** customers.
2. Manage each customer's phones (E.164, +255 default) and emails; company contacts carry a contact
   person's name. Shared numbers across customers are allowed and flagged.
3. Register vehicles with optional, validated VIN; record make, model, year, fuel and colour.
4. Record **registration number history** (plate changes keep history).
5. Record **ownership history**: assign an owner, transfer ownership, and keep the history without
   exposing earlier owners.
6. Search customers and vehicles by name, phone, plate or VIN.
7. View a customer or vehicle **activity history** (from the audit log).
8. Everything above is governed by **role-based permissions** and backed by database constraints
   and tests.

---

## A. Database schema changes

One migration, `2026112X000000_phase_1b_customers_vehicles`, additive only.

### A.1 Extensions

`btree_gist` (exclusion constraints on ranges with equality) and `pg_trgm` (similarity search).
Both are supported on Neon. `CREATE EXTENSION IF NOT EXISTS` inside the migration.

### A.2 New enums

| Enum            | Values                                                   |
| --------------- | -------------------------------------------------------- |
| `CustomerKind`  | `INDIVIDUAL`, `COMPANY`                                  |
| `ContactKind`   | `PHONE`, `EMAIL`                                         |
| `FuelType`      | `PETROL`, `DIESEL`, `HYBRID`, `ELECTRIC`, `LPG`, `OTHER` |
| `OwnershipRole` | `OWNER`, `KEEPER`                                        |

### A.3 New tables

**`customers`**

| Column                     | Type             | Rules                                                                    |
| -------------------------- | ---------------- | ------------------------------------------------------------------------ |
| `id`                       | `uuid` PK        | `uuidv7()` (BR-01)                                                       |
| `kind`                     | `CustomerKind`   | required                                                                 |
| `given_name`               | `text`           | INDIVIDUAL: `given_name` or `family_name` required                       |
| `family_name`              | `text`           |                                                                          |
| `company_name`             | `text`           | COMPANY: required; must be null for INDIVIDUAL                           |
| `tax_id`                   | `text`           | COMPANY only, optional; TIN format check pending Q-12                    |
| `display_name`             | `text`           | Derived by the service (name or company name), used for search and lists |
| `preferred_language`       | `char(2)`        | `sw` or `en`, default `sw`                                               |
| `notes`                    | `text`           | Staff-only, ≤ 2 000 chars, never audited by value                        |
| `created_by_staff_user_id` | `text` FK        | → `staff_users` RESTRICT                                                 |
| `created_at`, `updated_at` | `timestamptz(3)` |                                                                          |
| `deleted_at`               | `timestamptz(3)` | soft delete                                                              |

CHECKs `customers_kind_names`, length limits. Indexes: GIN trigram on `lower(display_name)`;
`(deleted_at)` partial for active lists; `(created_at DESC)`.

**`customer_contacts`**

| Column                | Type          | Rules                                                               |
| --------------------- | ------------- | ------------------------------------------------------------------- |
| `id`                  | `uuid` PK     |                                                                     |
| `customer_id`         | `uuid` FK     | → `customers` CASCADE                                               |
| `kind`                | `ContactKind` |                                                                     |
| `value_raw`           | `text`        | as typed                                                            |
| `value_normalised`    | `text`        | PHONE: E.164 CHECK `^\+[1-9][0-9]{6,14}$`; EMAIL: lower-case, ≤ 254 |
| `label`               | `text`        | e.g. "Mobile", "Office", "Driver"                                   |
| `contact_person_name` | `text`        | for COMPANY contacts                                                |
| `is_primary`          | `boolean`     |                                                                     |
| `verified_at`         | `timestamptz` | null in 1B (no OTP yet); **never** an access grant (ADR 0013)       |
| `deleted_at`          | `timestamptz` |                                                                     |

Partial UK one primary per `(customer_id, kind)`; partial UK `(customer_id, kind, value_normalised)`
(no duplicates within one customer); index `(kind, value_normalised)` for lookup. **No uniqueness
across customers** (D-05).

**`vehicles`**

| Column                                               | Type       | Rules                                                                    |
| ---------------------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| `id`                                                 | `uuid` PK  |                                                                          |
| `vin_raw`                                            | `text`     | optional (BR-03)                                                         |
| `vin_normalised`                                     | `text`     | CHECK `^[A-HJ-NPR-Z0-9]{17}$`; partial UK where not null and not deleted |
| `chassis_number`                                     | `text`     | for non-17-character identifiers (Q-11)                                  |
| `make`, `model`                                      | `text`     | required make; model optional                                            |
| `model_year`                                         | `smallint` | CHECK 1950–(current year + 1)                                            |
| `fuel_type`                                          | `FuelType` | optional                                                                 |
| `colour`                                             | `text`     | optional                                                                 |
| `engine_number`                                      | `text`     | optional                                                                 |
| `created_by_staff_user_id`, timestamps, `deleted_at` |            |                                                                          |

**`vehicle_registrations`** (plate history, BR-04)

| Column             | Type        | Rules                                                        |
| ------------------ | ----------- | ------------------------------------------------------------ |
| `id`               | `uuid` PK   |                                                              |
| `vehicle_id`       | `uuid` FK   | → `vehicles` RESTRICT                                        |
| `country_code`     | `char(2)`   | default from `garage_profile` (`TZ`)                         |
| `plate_raw`        | `text`      | as written                                                   |
| `plate_normalised` | `text`      | upper-case, no spaces/hyphens/dots; CHECK `^[A-Z0-9]{2,12}$` |
| `valid`            | `tstzrange` | `[registered_from, NULL)` while current                      |

`EXCLUDE USING gist (country_code WITH =, plate_normalised WITH =, valid WITH &&)`: a plate can
belong to only one vehicle at any moment. `EXCLUDE USING gist (vehicle_id WITH =, valid WITH &&)`:
one current plate per vehicle. Trigram index on `plate_normalised`.

**`vehicle_ownerships`** (BR-05)

| Column                      | Type            | Rules                                                |
| --------------------------- | --------------- | ---------------------------------------------------- |
| `id`                        | `uuid` PK       |                                                      |
| `vehicle_id`                | `uuid` FK       | → `vehicles` RESTRICT                                |
| `customer_id`               | `uuid` FK       | → `customers` RESTRICT                               |
| `role`                      | `OwnershipRole` | `OWNER` (legal/billing) or `KEEPER` (regular driver) |
| `period`                    | `tstzrange`     | `[from, NULL)` while current                         |
| `source`                    | `text`          | `REGISTRATION`, `TRANSFER`, `CORRECTION`             |
| `recorded_by_staff_user_id` | `text` FK       | → `staff_users` RESTRICT                             |

`EXCLUDE USING gist (vehicle_id WITH =, period WITH &&) WHERE (role = 'OWNER')`: one owner at a
time. Index `(customer_id) WHERE upper_inf(period)` for "current vehicles of a customer".

### A.4 Modified table

`audit_logs` gains `subject_customer_id uuid NULL` and `subject_vehicle_id uuid NULL` (by value,
consistent with ADR 0012), plus indexes `(subject_customer_id, occurred_at DESC)` and
`(subject_vehicle_id, occurred_at DESC)`. Additive nullable columns are metadata-only in
PostgreSQL. Existing rows are unaffected.

### A.5 Deferred (decision needed, see J)

`customer_merges` (duplicate merge). Recommended for a later phase; 1B only **warns** about
duplicates.

## B. Server actions and API endpoints

All mutations are **Server Actions** in the owning module (`src/modules/customers`,
`src/modules/vehicles`). Each one: parses input with Zod → `assertPermission()` → runs a service
function in **one Prisma transaction** that writes the change **and** its `audit_logs` row → maps
constraint errors (`23505`, `23514`, `23P01`) to `AppError` codes → revalidates the affected path.

| Module    | Action                                                              | Permission                    | Notes                                                                             |
| --------- | ------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------- |
| customers | `createCustomer(input)`                                             | `customer.create`             | INDIVIDUAL/COMPANY discriminated union; optional first contact                    |
| customers | `updateCustomer(id, version, input)`                                | `customer.update`             | Optimistic check on `updated_at`                                                  |
| customers | `archiveCustomer(id)` / `restoreCustomer(id)`                       | `customer.archive`            | Soft delete; blocked while the customer owns an active vehicle unless transferred |
| customers | `addContact`, `updateContact`, `removeContact`, `setPrimaryContact` | `customer.contacts.manage`    | Normalises phone/email; flags shared numbers                                      |
| vehicles  | `createVehicle(input)`                                              | `vehicle.create`              | Optional VIN, optional initial plate and owner in one tx                          |
| vehicles  | `updateVehicle(id, version, input)`                                 | `vehicle.update`              | VIN change audited                                                                |
| vehicles  | `changeRegistration(vehicleId, plate, effectiveAt)`                 | `vehicle.registration.change` | Closes current plate range, opens new one                                         |
| vehicles  | `transferOwnership(vehicleId, toCustomerId, effectiveAt, reason)`   | `vehicle.ownership.transfer`  | Closes current OWNER period, opens new one, in one tx                             |
| vehicles  | `assignKeeper`, `endKeeper`                                         | `vehicle.ownership.transfer`  |                                                                                   |
| vehicles  | `archiveVehicle(id)`                                                | `vehicle.archive`             |                                                                                   |

Read access is through **server components calling module query functions**, which enforce
permissions themselves (`assertStaff` + permission) and project only the allowed columns.

Route Handlers (JSON) only where client-side fetching is needed:

| Endpoint                                 | Method | Permission                        | Purpose                                                            |
| ---------------------------------------- | ------ | --------------------------------- | ------------------------------------------------------------------ |
| `/api/dashboard/search?q=&type=`         | GET    | `customer.read` or `vehicle.read` | Typeahead for the dashboard search box (≤ 10 results, min 2 chars) |
| `/api/dashboard/customers/lookup?phone=` | GET    | `customer.contacts.read`          | "This number is already used by N customers" warning in forms      |

Both return `no-store`, are rate-limited per staff session, never return contact values to roles
without `customer.contacts.read`, and are covered by the proxy and `assertStaff`.

## C. UI pages and components

| Route                            | Content                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/dashboard/customers`           | Search, filter (kind, archived), paginated table (name, kind, primary phone masked by role, vehicles) |
| `/dashboard/customers/new`       | Kind toggle (Individual / Company) → matching form; first contact; duplicate warning panel            |
| `/dashboard/customers/[id]`      | Profile, contacts, current vehicles, previous vehicles (own history only), activity tab               |
| `/dashboard/customers/[id]/edit` | Edit form                                                                                             |
| `/dashboard/vehicles`            | Search by plate, VIN, make/model; table with current plate and current owner                          |
| `/dashboard/vehicles/new`        | Vehicle form with VIN check feedback, initial plate, owner picker (search) or "create customer"       |
| `/dashboard/vehicles/[id]`       | Details, plate history, ownership history, activity tab                                               |
| Dashboard header                 | Global search box (customers + vehicles)                                                              |

Components (`src/components/` and module-local `_components`): `CustomerForm`
(discriminated by kind), `ContactList` and `ContactEditor`, `PhoneInput` (+255 default, shows E.164
preview), `VinInput` (live normalisation and validation message), `PlateInput`, `CustomerPicker`
(typeahead), `DuplicateWarning`, `HistoryTimeline` (activity), `OwnershipHistory`,
`RegistrationHistory`, `ConfirmDialog` for transfer and archive. Empty, loading and error states
use the Phase 0 components. Forms use `useActionState` and progressive enhancement. Copy is in
English in 1B. Swahili UI strings are a follow-up (J-07).

Ownership history display rule (BR-05): on a vehicle page, staff with `customer.read` see previous
owners' names (staff need this for disputes). The future portal shows a new owner service history
only, never earlier owners. On a **customer** page, "previous vehicles" lists vehicles the customer
used to own, without later owners.

## D. Business rules

| Rule                                                                                                                | Source         |
| ------------------------------------------------------------------------------------------------------------------- | -------------- |
| Customer IDs are UUIDv7; phone, email, VIN and plate are attributes                                                 | BR-01          |
| INDIVIDUAL requires a given or family name; COMPANY requires a company name                                         | D-04           |
| A phone may appear on several customers; at most once per customer; at most one primary phone and one primary email | D-05           |
| Contact `verified_at` never grants portal access                                                                    | D-06, ADR 0013 |
| VIN optional; if present, valid and unique among active vehicles                                                    | BR-03          |
| A plate is current on at most one vehicle at a time; a vehicle has at most one current plate; history is kept       | BR-04          |
| A vehicle has at most one OWNER at a time; transfer closes the old period and opens the new one at the same instant | BR-05          |
| Archiving a customer who currently owns vehicles requires transferring or confirming them first                     | Integrity      |
| Every create/update/archive/transfer writes an audit row in the same transaction with redacted `changes`            | BR-14          |
| No hard deletes from the UI                                                                                         | §3 soft delete |

## E. Security and authorisation

**RBAC in 1B.** A code-defined permission matrix on the existing `StaffRole` enum
(`src/modules/staff/permissions.ts`), checked by `assertPermission(permission)` on every action,
query and route. The RBAC tables (`roles`, `permissions`, assignments) remain in Phase 1D; the
matrix becomes the seed for them. This gives real role-based control now without schema churn.

| Permission                    | OWNER | MANAGER | SERVICE_ADVISOR |   TECHNICIAN   |
| ----------------------------- | :---: | :-----: | :-------------: | :------------: |
| `customer.read`               |  ✅   |   ✅    |       ✅        | ✅ (name only) |
| `customer.contacts.read`      |  ✅   |   ✅    |       ✅        |       —        |
| `customer.create` / `update`  |  ✅   |   ✅    |       ✅        |       —        |
| `customer.contacts.manage`    |  ✅   |   ✅    |       ✅        |       —        |
| `customer.archive` / restore  |  ✅   |   ✅    |        —        |       —        |
| `vehicle.read`                |  ✅   |   ✅    |       ✅        |       ✅       |
| `vehicle.create` / `update`   |  ✅   |   ✅    |       ✅        |       —        |
| `vehicle.registration.change` |  ✅   |   ✅    |       ✅        |       —        |
| `vehicle.ownership.transfer`  |  ✅   |   ✅    |       ✅        |       —        |
| `vehicle.archive`             |  ✅   |   ✅    |        —        |       —        |
| `activity.read`               |  ✅   |   ✅    |       ✅        |       —        |

Other controls:

- Layered checks stay in place: proxy → `requireStaff` (page) → `assertPermission` (data).
  Components never import Prisma (lint rule).
- **Projection by role:** query functions return DTOs. Contact values are omitted (not just
  hidden) for roles without `customer.contacts.read`. Lists show masked phones by default.
- **No customer data on public routes.** `/book`, `/track` and `/portal` remain placeholders.
- **IDOR protection:** every `[id]` route re-checks permission. There are no client-supplied
  owner IDs without validation.
- **Audit redaction** via a `recordAudit()` helper with per-entity allow-lists. Phones and emails
  are masked; notes are never recorded by value (business-rules §4.1).
- **Rate limiting** on search endpoints and server actions (per staff session). This also closes
  the Phase 0 sign-in rate-limit gap (R-06) with the same limiter.
- **CSRF:** Server Actions' built-in origin check, plus `SameSite=Lax` session cookies.

## F. Data validation

Zod schemas in `src/modules/*/schemas.ts`, shared by forms and actions. Database CHECKs mirror
them.

| Field                  | Normalisation                                                                                                                                                     | Validation                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Phone                  | `libphonenumber-js` with default region `TZ` from `garage_profile`. `0712 345 678`, `712345678`, `255712345678` and `+255 712 345 678` all become `+255712345678` | Must be a valid number for its region; international numbers accepted with an explicit `+`                       |
| Email                  | trim, lower-case                                                                                                                                                  | `z.email()`, ≤ 254                                                                                               |
| Names                  | trim, collapse internal whitespace                                                                                                                                | 1–100 chars (company ≤ 200)                                                                                      |
| VIN                    | upper-case, strip spaces and hyphens                                                                                                                              | `^[A-HJ-NPR-Z0-9]{17}$`. I, O and Q are rejected with a clear message. A check-digit mismatch is a warning only  |
| Plate (TZ)             | upper-case, strip spaces, hyphens, dots                                                                                                                           | `^[A-Z0-9]{2,12}$`. Warn, don't block, when it doesn't match the common private format `T123ABC` (decision J-03) |
| Model year             | integer                                                                                                                                                           | 1950–next year                                                                                                   |
| TIN                    | digits only                                                                                                                                                       | optional; format per Q-12                                                                                        |
| Dates (effective-from) | interpreted in `Africa/Dar_es_Salaam`, stored UTC                                                                                                                 | not in the future beyond 1 day; not before the vehicle's previous period start                                   |

Duplicate warnings (non-blocking): same normalised phone or email on another customer; name
trigram similarity ≥ 0.6; same plate seen historically; same make/model/year with a similar plate.

## G. Migration strategy

1. Branch `feature/phase-1b-customers-vehicles` from `develop` after PR #3 merges.
2. Author the Prisma models, then generate the SQL with
   `prisma migrate diff --from-config-datasource --to-schema --script` against `development`.
3. Hand-add the extensions, CHECKs, exclusion constraints, trigram indexes and the `audit_logs`
   columns, with a header comment stating it is additive.
4. Scan for `DROP` and `ALTER … TYPE`. Expected: none.
5. `npm run db:guard`, re-confirm the Neon identity (`br-wild-river-bgrlfo90`,
   `ep-rapid-lake-bgk09wmz`), then dry-run inside `BEGIN … ROLLBACK`.
6. `npm run db:migrate:deploy`, then `migrate status` and the drift check
   (`migrate diff --exit-code`).
7. No data migration: there is no legacy customer data. A CSV import tool is a separate, optional
   decision (J-06).
8. **Rollback:** additive. Before release, a forward migration can drop the new tables (owner
   approval). After data exists, roll forward only. Neon point-in-time branch for disaster recovery.
9. Production: not in this phase.

## H. Testing strategy

| Layer                                         | Tests                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                                          | Phone normaliser (TZ local, national, international, invalid); email; VIN (valid, I/O/Q, length, check-digit warning); plate normaliser; customer Zod union by kind; permission matrix (every role × permission); audit redaction (no raw phone, email or notes)                                                                                                                                                                          |
| Integration (live `development`, rolled back) | Every CHECK; VIN partial unique; contact uniqueness per customer **and** shared phone allowed across customers; plate exclusion (same plate overlapping rejected, sequential allowed); one current plate per vehicle; one OWNER at a time (concurrent transfer → one `23P01`); RESTRICT vs CASCADE behaviour; service transaction writes change + audit atomically (forced failure leaves neither); trigram search returns expected order |
| Authorisation                                 | Each action and query refuses missing permission (`FORBIDDEN`); TECHNICIAN receives no contact values; unauthenticated access to every new route → 307 to `/login`                                                                                                                                                                                                                                                                        |
| E2E (Playwright, `E2E_DATABASE=1`)            | Create individual and company customers; add contacts (local `07…` → shown as `+255…`); shared-number warning; create vehicle with/without VIN; invalid VIN message; plate change creates history; ownership transfer shows history correctly; search by plate, phone and name; activity timeline entries; archived customer hidden; technician view restricted; mobile layout                                                            |
| Regression                                    | Existing suites: staff sign-in, protected routes, health, Phase 1A schema tests                                                                                                                                                                                                                                                                                                                                                           |
| Test data                                     | Created inside rolled-back transactions or by the E2E run with a unique prefix and cleaned up by soft-delete. Never against production. Never presented as real customers                                                                                                                                                                                                                                                                 |

CI runs unit, authorisation and no-DB E2E. Live-DB suites run locally unless the owner adds the
`NEON_DEV_DATABASE_URL` secret (J-05).

## I. Acceptance criteria

1. Migration applied to Neon `development` only; production unchanged; drift check clean.
2. Staff with the right role can create, edit, archive and restore individual and company
   customers; validation messages are clear.
3. Phones entered in any common Tanzanian format are stored as E.164; the same number can be saved
   on two customers with a warning.
4. Vehicles can be registered without a VIN; an invalid VIN is rejected; a duplicate VIN is rejected.
5. Changing a plate keeps the old plate in history, and the same plate cannot be current on two
   vehicles.
6. Transferring ownership records the history; at no time does a vehicle have two owners; the
   customer page shows only that customer's own ownership periods.
7. Search finds customers by name or phone and vehicles by plate or VIN within 300 ms on the dev
   dataset.
8. Activity history shows who did what and when, with contact values masked.
9. Permissions are enforced as in the matrix (automated tests for every cell).
10. All quality gates pass: typecheck, lint, format, unit, integration, E2E (both modes), build, CI.
11. No guest-booking, scheduling or reminder functionality is introduced.
12. Docs updated: data dictionary (Part 1 for the new tables), ERD, roadmap, Phase 1B report.

## J. Risks and unresolved decisions

| #    | Item                                                                                                                               | Recommendation                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| J-01 | Customer **merge** in 1B or later?                                                                                                 | Later (with 1D). 1B warns only                                       |
| J-02 | Q-12: collect company **TIN** in 1B? Required or optional?                                                                         | Optional field, no format enforcement until confirmed                |
| J-03 | Tanzanian plate validation: enforce `T123ABC` style or warn only? Motorcycles, government and diplomatic plates differ             | Warn only                                                            |
| J-04 | Q-11: older or imported vehicles without a 17-character VIN                                                                        | Store in `chassis_number`                                            |
| J-05 | Add `NEON_DEV_DATABASE_URL` as a GitHub secret so CI runs the live-DB tests (sends a dev credential to GitHub)                     | Owner decision. Recommended, with a dedicated restricted dev role    |
| J-06 | Import existing customer and vehicle lists (CSV)?                                                                                  | Separate mini-phase if needed                                        |
| J-07 | UI language: Swahili, English, or both in 1B?                                                                                      | English first; Swahili strings next                                  |
| J-08 | May TECHNICIANs see customer phone numbers?                                                                                        | No (matrix above)                                                    |
| J-09 | Show previous owners' names to staff on the vehicle page?                                                                          | Yes, staff only; never in the portal                                 |
| R-01 | `libphonenumber-js` adds about 80 KB of metadata; keep it server-side, or use the "min" metadata client-side for the input preview | Server-side normalisation, min metadata in the browser               |
| R-02 | Trigram search quality on short names                                                                                              | Combine exact-prefix and trigram ranking; measure on the dev dataset |
| R-03 | Auth.js beta, sign-in rate limiting (carried)                                                                                      | Rate limiting delivered in 1B (§E)                                   |

## Estimated effort

About 6–8 working sessions: schema and migration (1), customer module and UI (2), vehicle module,
registration and ownership (2), search and activity (1), RBAC matrix, tests and hardening (1–2).
