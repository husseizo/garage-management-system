# Data dictionary

- **Status:** Phase 1B (2026-11-24)
- **Part 1** documents every table that **exists** (Phase 0, 1A and 1B): each column, constraint and
  index, matching `prisma/schema.prisma` and `prisma/migrations/*`.
- **Part 2** documents **planned** tables at design level: key columns, keys, constraints and
  indexes. Full column lists are finalised in the phase that creates each table. Each phase's PR
  updates this file.

Conventions for every new table (ADR 0008, 0009):

| Convention       | Rule                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Primary key      | `id uuid NOT NULL DEFAULT uuidv7()`                                                                      |
| Timestamps       | `created_at timestamptz(3) NOT NULL DEFAULT now()`, `updated_at timestamptz(3) NOT NULL` (set by Prisma) |
| Soft delete      | `deleted_at timestamptz(3) NULL` on customer-facing master data only                                     |
| Names            | `snake_case` tables (plural, except singleton `garage_profile`) and columns; Prisma models PascalCase    |
| Constraint names | `<table>_<column(s)>_<rule>`; Prisma's `_pkey`, `_key`, `_fkey`, `_idx` suffixes kept                    |
| Enums            | PostgreSQL enums for closed sets that change rarely; lookup tables when staff edit the set               |
| Money            | `<name>_minor bigint` + `currency_code char(3)`                                                          |
| Distances        | `<name>_km integer` (whole kilometres)                                                                   |

---

## Part 1 — Implemented tables

### `staff_users` (Phase 0 — unchanged in 1A)

Staff sign-in identity for Auth.js credentials.

| Column          | Type           | Null | Default             | Notes                                                                                     |
| --------------- | -------------- | ---- | ------------------- | ----------------------------------------------------------------------------------------- |
| `id`            | `text`         | no   | Prisma `cuid()`     | PK `staff_users_pkey`. Kept as cuid (ADR 0008)                                            |
| `email`         | `text`         | no   | —                   | UK `staff_users_email_key`; stored trimmed and lower-case                                 |
| `name`          | `text`         | no   | —                   |                                                                                           |
| `password_hash` | `text`         | no   | —                   | `scrypt$N$r$p$salt$hash`; never logged or audited                                         |
| `role`          | `"StaffRole"`  | no   | `'SERVICE_ADVISOR'` | `OWNER`, `MANAGER`, `SERVICE_ADVISOR`, `TECHNICIAN`. Superseded by role assignments in 1D |
| `active`        | `boolean`      | no   | `true`              | Deactivate instead of deleting                                                            |
| `last_login_at` | `timestamp(3)` | yes  | —                   | No time zone (Phase 0 debt R-04)                                                          |
| `created_at`    | `timestamp(3)` | no   | `CURRENT_TIMESTAMP` | No time zone (R-04)                                                                       |
| `updated_at`    | `timestamp(3)` | no   | —                   | Set by Prisma                                                                             |

Referenced by: `audit_logs.actor_staff_user_id` (ON DELETE RESTRICT, since 1A).

### `garage_profile` (Phase 1A)

The garage's own configuration. At most one row. Not seeded: the owner enters real values (there
is no placeholder data). Required before customer/phone features in 1B because `country_code` is
the default region for phone normalisation. **Development** holds the owner-approved MAPESA GARAGE
profile (`TZ`, `Africa/Dar_es_Salaam`, `TZS`; no contact or address), set with
`npm run garage:profile`.

| Column               | Type             | Null | Default             | Notes                                                                                     |
| -------------------- | ---------------- | ---- | ------------------- | ----------------------------------------------------------------------------------------- |
| `id`                 | `uuid`           | no   | `uuidv7()`          | PK `garage_profile_pkey`                                                                  |
| `singleton`          | `boolean`        | no   | `true`              | UK `garage_profile_singleton_key` + CHECK `= true`, so max one row                        |
| `display_name`       | `text`           | no   | —                   | 1–120 characters after trimming                                                           |
| `legal_name`         | `text`           | yes  | —                   | 1–200 characters after trimming                                                           |
| `country_code`       | `char(2)`        | no   | —                   | ISO 3166-1 alpha-2, upper-case                                                            |
| `timezone`           | `text`           | no   | —                   | IANA name, e.g. `Africa/Dar_es_Salaam`; ≤ 64 chars. App validates against the tz database |
| `currency_code`      | `char(3)`        | no   | —                   | ISO 4217, upper-case                                                                      |
| `contact_phone_e164` | `text`           | yes  | —                   | `^\+[1-9][0-9]{6,14}$`                                                                    |
| `contact_email`      | `text`           | yes  | —                   | Basic shape check, ≤ 254 chars                                                            |
| `address_line1`      | `text`           | yes  | —                   |                                                                                           |
| `address_line2`      | `text`           | yes  | —                   |                                                                                           |
| `city`               | `text`           | yes  | —                   |                                                                                           |
| `region`             | `text`           | yes  | —                   |                                                                                           |
| `postal_code`        | `text`           | yes  | —                   |                                                                                           |
| `created_at`         | `timestamptz(3)` | no   | `CURRENT_TIMESTAMP` |                                                                                           |
| `updated_at`         | `timestamptz(3)` | no   | —                   | Set by Prisma `@updatedAt`; raw SQL inserts must supply it                                |

CHECK constraints: `garage_profile_singleton_true`, `garage_profile_display_name_len`,
`garage_profile_legal_name_len`, `garage_profile_country_code_iso`,
`garage_profile_currency_code_iso`, `garage_profile_timezone_iana`,
`garage_profile_contact_phone_e164`, `garage_profile_contact_email_format`.

### `audit_logs` (Phase 1A)

Append-only trail of security- and business-relevant actions (BR-14).

| Column                | Type               | Null | Default             | Notes                                                                                                        |
| --------------------- | ------------------ | ---- | ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `id`                  | `uuid`             | no   | `uuidv7()`          | PK `audit_logs_pkey`; time-ordered                                                                           |
| `occurred_at`         | `timestamptz(3)`   | no   | `CURRENT_TIMESTAMP` |                                                                                                              |
| `actor_type`          | `"AuditActorType"` | no   | —                   | `STAFF`, `CUSTOMER`, `SYSTEM`                                                                                |
| `actor_staff_user_id` | `text`             | yes  | —                   | FK → `staff_users.id` ON DELETE RESTRICT ON UPDATE CASCADE. CHECK: set if and only if `actor_type = 'STAFF'` |
| `action`              | `text`             | no   | —                   | Dotted lower-case verb (`garage_profile.updated`, `staff.sign_in`), ≤ 100 chars                              |
| `entity_type`         | `text`             | yes  | —                   | Table-like name `^[a-z][a-z0-9_]{0,62}$`; set together with `entity_id`                                      |
| `entity_id`           | `text`             | yes  | —                   | 1–100 chars; text so it holds both UUIDs and Phase 0 cuids                                                   |
| `changes`             | `jsonb`            | yes  | —                   | JSON object `{field: {from, to}}`, **redacted** (no secrets, hashes, OTPs, full contacts)                    |
| `metadata`            | `jsonb`            | yes  | —                   | JSON object (e.g. reason, source)                                                                            |
| `request_id`          | `text`             | yes  | —                   | Correlates with structured logs; ≤ 100 chars                                                                 |

Indexes: `audit_logs_entity_idx (entity_type, entity_id, occurred_at DESC)`,
`audit_logs_actor_staff_idx (actor_staff_user_id, occurred_at DESC)`,
`audit_logs_action_idx (action, occurred_at DESC)`.

CHECK constraints: `audit_logs_staff_actor_consistent`, `audit_logs_action_format`,
`audit_logs_entity_pair`, `audit_logs_entity_type_format`, `audit_logs_entity_id_len`,
`audit_logs_changes_object`, `audit_logs_metadata_object`, `audit_logs_request_id_len`.

Triggers: `audit_logs_no_update_delete` (BEFORE UPDATE OR DELETE, per row) and
`audit_logs_no_truncate` (BEFORE TRUNCATE) call `audit_logs_reject_mutation()`, which raises
SQLSTATE `42501`.

A `CUSTOMER` actor has no FK column yet. `actor_portal_account_id uuid` (FK →
`customer_portal_accounts`) is added additively in 1C with the portal, and the consistency CHECK is
extended. 1B adds `subject_customer_id` and `subject_vehicle_id` (by value) for activity timelines.

### Enum `"AuditActorType"` (Phase 1A)

`STAFF` · `CUSTOMER` · `SYSTEM`.

### Phase 1B tables (migration `20261124120000_phase_1b_customers_vehicles`)

Extensions: `pg_trgm`, `btree_gist`. Enums: `CustomerKind` (INDIVIDUAL, COMPANY), `ContactKind`
(PHONE, EMAIL), `FuelType` (PETROL, DIESEL, HYBRID, ELECTRIC, LPG, OTHER), `OwnershipRole`
(OWNER, KEEPER). All ids `uuid DEFAULT uuidv7()`; timestamps `timestamptz(3)`.

#### `customers`

| Column                      | Type             | Null | Notes                                                |
| --------------------------- | ---------------- | ---- | ---------------------------------------------------- |
| `id`                        | `uuid`           | no   | PK                                                   |
| `kind`                      | `CustomerKind`   | no   |                                                      |
| `given_name`, `family_name` | `text`           | yes  | INDIVIDUAL: at least one; 1–100 chars each           |
| `company_name`              | `text`           | yes  | COMPANY: required, 1–200 chars                       |
| `tax_id`                    | `text`           | yes  | COMPANY only, optional TIN `^[0-9A-Z]{3,20}$` (J-02) |
| `display_name`              | `text`           | no   | Derived by the service; 1–200 chars                  |
| `search_name`               | `text`           | no   | CHECK `= lower(display_name)`; GIN trigram index     |
| `preferred_language`        | `char(2)`        | no   | `sw` (default) or `en`                               |
| `notes`                     | `text`           | yes  | Staff-only, ≤ 2 000; audited as "changed" only       |
| `created_by_staff_user_id`  | `text`           | no   | FK → `staff_users` RESTRICT                          |
| `created_at`, `updated_at`  | `timestamptz(3)` | no   | `updated_at` used for optimistic edits               |
| `deleted_at`                | `timestamptz(3)` | yes  | Soft delete (archive)                                |

Constraints: `customers_kind_names`, `customers_*_len`, `customers_tax_id_format`,
`customers_search_name_consistent`, `customers_preferred_language`. Indexes:
`customers_search_name_trgm_idx` (GIN), `customers_created_at_idx`, `customers_created_by_idx`.

#### `customer_contacts`

| Column                                   | Type             | Null | Notes                                                                   |
| ---------------------------------------- | ---------------- | ---- | ----------------------------------------------------------------------- |
| `id`                                     | `uuid`           | no   | PK                                                                      |
| `customer_id`                            | `uuid`           | no   | FK → `customers` CASCADE                                                |
| `kind`                                   | `ContactKind`    | no   |                                                                         |
| `value_raw`                              | `text`           | no   | As entered, 1–254 chars                                                 |
| `value_normalised`                       | `text`           | no   | PHONE: E.164; EMAIL: lower-case. **Not unique across customers** (D-05) |
| `label`, `contact_person_name`           | `text`           | yes  | ≤ 50 / ≤ 100 chars                                                      |
| `is_primary`                             | `boolean`        | no   |                                                                         |
| `verified_at`                            | `timestamptz(3)` | yes  | Never an access grant (ADR 0013)                                        |
| `created_at`, `updated_at`, `deleted_at` | `timestamptz(3)` |      | Soft delete                                                             |

Constraints: `customer_contacts_value_format`, length checks, **EXCLUDE**
`customer_contacts_one_primary (customer_id =, kind =) WHERE is_primary AND deleted_at IS NULL`,
**EXCLUDE** `customer_contacts_no_duplicate (customer_id =, kind =, value_normalised =) WHERE
deleted_at IS NULL`. Indexes: `customer_contacts_customer_idx`, `customer_contacts_lookup_idx
(kind, value_normalised)`.

#### `vehicles`

| Column                                   | Type             | Null | Notes                                                   |
| ---------------------------------------- | ---------------- | ---- | ------------------------------------------------------- |
| `id`                                     | `uuid`           | no   | PK                                                      |
| `vin_raw`, `vin_normalised`              | `text`           | yes  | Both or neither; `^[A-HJ-NPR-Z0-9]{17}$`                |
| `chassis_number`, `engine_number`        | `text`           | yes  | ≤ 30 chars                                              |
| `make`                                   | `text`           | no   | 1–60 chars                                              |
| `model`, `colour`                        | `text`           | yes  |                                                         |
| `model_year`                             | `smallint`       | yes  | 1900–2100 in DB; app enforces 1950–next year            |
| `fuel_type`                              | `FuelType`       | yes  |                                                         |
| `search_text`                            | `text`           | no   | CHECK `= lower(btrim(make ‖ ' ' ‖ model))`; GIN trigram |
| `created_by_staff_user_id`               | `text`           | no   | FK → `staff_users` RESTRICT                             |
| `created_at`, `updated_at`, `deleted_at` | `timestamptz(3)` |      | Archive ends current plate and ownerships               |

Constraints: `vehicles_vin_format`, `vehicles_vin_pair`, length/year checks,
`vehicles_search_text_consistent`, **EXCLUDE** `vehicles_vin_unique_active (vin_normalised =)
WHERE vin_normalised IS NOT NULL AND deleted_at IS NULL`.

#### `vehicle_registrations` (plate history)

| Column                      | Type             | Null | Notes                                                           |
| --------------------------- | ---------------- | ---- | --------------------------------------------------------------- |
| `id`                        | `uuid`           | no   | PK                                                              |
| `vehicle_id`                | `uuid`           | no   | FK → `vehicles` RESTRICT                                        |
| `country_code`              | `char(2)`        | no   | From `garage_profile` (TZ)                                      |
| `plate_raw`                 | `text`           | no   | Display form                                                    |
| `plate_normalised`          | `text`           | no   | `^[A-Z0-9]{2,12}$`; GIN trigram. Format **warning-only** (J-03) |
| `valid_from`                | `timestamptz(3)` | no   |                                                                 |
| `valid_to`                  | `timestamptz(3)` | yes  | NULL = current; CHECK `> valid_from`                            |
| `recorded_by_staff_user_id` | `text`           | no   | FK → `staff_users` RESTRICT                                     |

**EXCLUDE** `vehicle_registrations_plate_no_overlap (country_code =, plate_normalised =,
tstzrange(valid_from, valid_to) &&)`, **EXCLUDE** `vehicle_registrations_vehicle_no_overlap
(vehicle_id =, tstzrange(...) &&)`.

#### `vehicle_ownerships`

| Column                      | Type             | Null | Notes                                            |
| --------------------------- | ---------------- | ---- | ------------------------------------------------ |
| `id`                        | `uuid`           | no   | PK                                               |
| `vehicle_id`                | `uuid`           | no   | FK → `vehicles` RESTRICT                         |
| `customer_id`               | `uuid`           | no   | FK → `customers` RESTRICT                        |
| `role`                      | `OwnershipRole`  | no   | OWNER (legal/billing) or KEEPER (regular driver) |
| `started_at`                | `timestamptz(3)` | no   |                                                  |
| `ended_at`                  | `timestamptz(3)` | yes  | NULL = current; CHECK `> started_at`             |
| `source`                    | `text`           | no   | `REGISTRATION`, `TRANSFER`, `CORRECTION`         |
| `recorded_by_staff_user_id` | `text`           | no   | FK → `staff_users` RESTRICT                      |

**EXCLUDE** `vehicle_ownerships_one_owner (vehicle_id =, tstzrange(started_at, ended_at) &&)
WHERE role = 'OWNER'`; **EXCLUDE** `vehicle_ownerships_keeper_no_overlap (vehicle_id =,
customer_id =, range &&) WHERE role = 'KEEPER'`.

#### `rate_limit_buckets` (ADR 0015)

| Column         | Type             | Notes                                          |
| -------------- | ---------------- | ---------------------------------------------- |
| `key`          | `varchar(100)`   | `<rule>:<HMAC>`; never a raw email/IP. PK part |
| `window_start` | `timestamptz(3)` | PK part                                        |
| `count`        | `integer`        | CHECK ≥ 0                                      |
| `expires_at`   | `timestamptz(3)` | CHECK `> window_start`; indexed for cleanup    |

#### `audit_logs` additions (Phase 1B)

`subject_customer_id uuid NULL`, `subject_vehicle_id uuid NULL` (by value, ADR 0012), with indexes
`audit_logs_subject_customer_idx` and `audit_logs_subject_vehicle_idx` (`…, occurred_at DESC`). They
feed the customer/vehicle activity timelines. Ownership transfers write one row per timeline, so
neither row names the other customer.

### `_prisma_migrations`

Managed by Prisma Migrate. Never edited by hand.

---

## Part 2 — Planned tables (design level)

Columns listed are the ones that carry identity, relationships or rules. `→` means FK.

### A. Identity & access

| Table                              | Phase | Key columns                                                                                                                                                                                                                                                                      | Constraints and indexes                                                                                                                                                      |
| ---------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `roles`                            | 1D    | `code text`, `name`, `system boolean`                                                                                                                                                                                                                                            | UK `code`; system roles undeletable (trigger)                                                                                                                                |
| `permissions`                      | 1D    | `code text` (`<module>.<verb>`)                                                                                                                                                                                                                                                  | UK `code`; seeded by migration, code-defined                                                                                                                                 |
| `role_permissions`                 | 1D    | `role_id → roles` CASCADE, `permission_id → permissions` CASCADE                                                                                                                                                                                                                 | PK `(role_id, permission_id)`; index `permission_id`                                                                                                                         |
| `staff_role_assignments`           | 1D    | `staff_user_id → staff_users` RESTRICT, `role_id → roles` RESTRICT, `granted_by_staff_user_id`, `granted_at`, `revoked_at`                                                                                                                                                       | Partial UK `(staff_user_id, role_id) WHERE revoked_at IS NULL`; data migration from `staff_users.role`                                                                       |
| `customer_verification_challenges` | 1C    | `target text` (E.164/email), `contact_id → customer_contacts` SET NULL, `purpose`, `code_hash bytea`, `expires_at`, `attempts smallint`, `consumed_at`                                                                                                                           | CHECK `attempts <= 5`; index `(target, created_at DESC)` for rate limits; hard-deleted 30 days after expiry                                                                  |
| `auth_sessions`                    | 1C    | `subject_type` (`PORTAL_ACCOUNT`/`STAFF`), `portal_account_id → customer_portal_accounts` CASCADE, `staff_user_id → staff_users` CASCADE, `active_customer_id → customers` (the customer currently being viewed), `token_hash bytea`, `expires_at`, `revoked_at`, `last_seen_at` | UK `token_hash`; exclusive-arc CHECK; `active_customer_id` must have a live grant (checked on every request)                                                                 |
| `customer_portal_accounts`         | 1C    | `kind` (`PHONE`/`EMAIL`), `value_normalised`, `verified_at`, `disabled_at`                                                                                                                                                                                                       | UK `(kind, value_normalised)`: one login identity per phone/email. It is **not** a customer and holds no customer data                                                       |
| `customer_portal_access`           | 1C    | `portal_account_id → customer_portal_accounts` CASCADE, `customer_id → customers` RESTRICT, `role` (`HOLDER`, `COMPANY_ADMIN`, `COMPANY_VIEWER`), `granted_by_staff_user_id`, `granted_at`, `revoked_at`, `revoke_reason`                                                        | Partial UK `(portal_account_id, customer_id) WHERE revoked_at IS NULL`; created only by an explicit, audited action, never automatically from a phone match (D-06, ADR 0013) |
| `auth_events`                      | 1C    | `type`, `staff_user_id`, `customer_id`, `target_hash bytea`, `ip_hash bytea`, `occurred_at`                                                                                                                                                                                      | Append-only; index `(type, occurred_at DESC)`; no raw IP/phone stored                                                                                                        |

### B. Customer management

| Table                                | Phase | Key columns                                                                                                                                                                                            | Constraints and indexes                                                                                                                                                                                                            |
| ------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `customers`                          | 1B    | `kind` (`INDIVIDUAL`/`COMPANY`), `display_name`, `given_name`, `family_name`, `company_name`, `tax_id` (TIN, optional, Q-12), `preferred_language` (`sw`/`en`), `notes`, `deleted_at`, `anonymised_at` | CHECK: `INDIVIDUAL` requires `given_name` or `family_name`; `COMPANY` requires `company_name`; trigram index on `lower(display_name)`                                                                                              |
| `customer_contacts`                  | 1B    | `customer_id → customers` CASCADE, `kind`, `value_raw`, `value_normalised`, `label`, `contact_person_name` (company contacts), `is_primary`, `verified_at`, `deleted_at`                               | Partial UK `(customer_id, kind) WHERE is_primary AND deleted_at IS NULL`; partial UK `(customer_id, kind, value_normalised) WHERE deleted_at IS NULL`; index `(kind, value_normalised)`. **No uniqueness across customers** (D-05) |
| `vehicles`                           | 1B    | `vin_raw`, `vin_normalised`, `make`, `model`, `model_year`, `fuel_type`, `colour`, `deleted_at`                                                                                                        | Partial UK `vin_normalised WHERE vin_normalised IS NOT NULL AND deleted_at IS NULL`; CHECK VIN `^[A-HJ-NPR-Z0-9]{17}$` (or relaxed for pre-1981, Q)                                                                                |
| `vehicle_registrations`              | 1B    | `vehicle_id → vehicles` RESTRICT, `country_code`, `plate_raw`, `plate_normalised`, `valid tstzrange`                                                                                                   | EXCLUDE GiST `(country_code =, plate_normalised =, valid &&)`; index `vehicle_id`; trigram on `plate_normalised`                                                                                                                   |
| `vehicle_ownerships`                 | 1B    | `vehicle_id → vehicles` RESTRICT, `customer_id → customers` RESTRICT, `role`, `period tstzrange`, `source`                                                                                             | EXCLUDE GiST `(vehicle_id =, period &&) WHERE role = 'OWNER'`; index `(customer_id) WHERE upper_inf(period)`                                                                                                                       |
| `customer_communication_preferences` | 1F    | `customer_id → customers` CASCADE, `channel`, `topic`, `allowed`, `quiet_from`, `quiet_to`                                                                                                             | PK `(customer_id, channel, topic)`                                                                                                                                                                                                 |
| `consent_records`                    | 1F    | `customer_id → customers` RESTRICT, `purpose`, `channel`, `action`, `evidence jsonb`, `recorded_at`, `recorded_by_staff_user_id`                                                                       | Append-only; index `(customer_id, purpose, channel, recorded_at DESC)`; current consent = latest row                                                                                                                               |

### C. Booking management

| Table                      | Phase | Key columns                                                                                                                                                                                                                | Constraints and indexes                                                                             |
| -------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `service_categories`       | 1C    | `code`, `name`, `sort_order`, `active`                                                                                                                                                                                     | UK `code`                                                                                           |
| `service_definitions`      | 1C    | `category_id → service_categories` RESTRICT, `code`, `name`, `default_duration_minutes`, `publicly_bookable`, `active`                                                                                                     | UK `code`; CHECK duration 5–14 400 minutes                                                          |
| `booking_requests`         | 1C    | `reference`, `source`, `status`, `customer_id → customers` RESTRICT, `vehicle_id → vehicles` RESTRICT, `contact_snapshot jsonb`, `vehicle_snapshot jsonb`, `preferred_window tstzrange`, `idempotency_key`, `submitted_at` | UK `reference` (random, unambiguous alphabet); UK `idempotency_key`; index `(status, submitted_at)` |
| `booking_request_services` | 1C    | `booking_request_id → booking_requests` CASCADE, `service_definition_id → service_definitions` RESTRICT, `customer_notes`                                                                                                  | PK `(booking_request_id, service_definition_id)`                                                    |
| `booking_status_history`   | 1C    | `booking_request_id` RESTRICT, `from_status`, `to_status`, `actor_type`, `actor_staff_user_id`, `reason`, `occurred_at`                                                                                                    | Append-only; index `(booking_request_id, occurred_at)`                                              |
| `file_attachments`         | 1C    | `storage_key`, `mime_type`, `size_bytes`, `sha256 bytea`, `scan_status`, `uploaded_by_*`                                                                                                                                   | UK `storage_key`; CHECK MIME allow-list and size limit                                              |
| `booking_attachments`      | 1C    | `booking_request_id` CASCADE, `file_attachment_id` RESTRICT                                                                                                                                                                | PK `(booking_request_id, file_attachment_id)`                                                       |
| `booking_communications`   | 1F    | `booking_request_id` RESTRICT, `direction`, `channel`, `notification_outbox_id → notification_outbox` SET NULL, `staff_user_id`, `summary`, `occurred_at`                                                                  | Index `(booking_request_id, occurred_at)`                                                           |

### D. Smart scheduling

See [`scheduling-model.md`](scheduling-model.md) for details and constraints.

| Table                   | Phase | Key columns                                                                                                                      | Constraints and indexes                                                                                                                |
| ----------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `scheduling_resources`  | 1E    | `kind`, `name`, `active`                                                                                                         | —                                                                                                                                      |
| `technicians`           | 1E    | `resource_id → scheduling_resources` RESTRICT, `staff_user_id → staff_users` SET NULL, `display_name`                            | UK `resource_id`; partial UK `staff_user_id WHERE NOT NULL`; trigger: resource `kind = TECHNICIAN`                                     |
| `service_bays`          | 1E    | `resource_id` RESTRICT, `code`, `name`                                                                                           | UK `resource_id`, UK `code`; trigger: resource `kind IN (BAY, PAINT_BOOTH)`                                                            |
| `skills`                | 1E    | `code`, `name`                                                                                                                   | UK `code`                                                                                                                              |
| `technician_skills`     | 1E    | `technician_id` CASCADE, `skill_id` RESTRICT, `level smallint`, `certified_until date`                                           | PK `(technician_id, skill_id)`; index `skill_id`                                                                                       |
| `bay_capabilities`      | 1E    | `service_bay_id` CASCADE, `capability`                                                                                           | PK `(service_bay_id, capability)`                                                                                                      |
| `service_requirements`  | 1E    | `service_definition_id` CASCADE, `skill_id`, `bay_capability`, `duration_minutes`, `technicians_needed`                          | CHECK at least one of skill/bay capability                                                                                             |
| `garage_working_hours`  | 1E    | `iso_weekday`, `opens_at time`, `closes_at time`, `effective daterange`                                                          | CHECK `opens_at < closes_at`; EXCLUDE `(iso_weekday =, effective &&, tsrange-of-times &&)`                                             |
| `garage_closures`       | 1E    | `period tstzrange`, `reason`                                                                                                     | GiST index `period`                                                                                                                    |
| `technician_shifts`     | 1E    | `technician_id` CASCADE, `iso_weekday`, `starts_at`, `ends_at`, `effective daterange`                                            | CHECK times; EXCLUDE overlap per technician and weekday                                                                                |
| `technician_leave`      | 1E    | `technician_id` CASCADE, `period tstzrange`, `type`                                                                              | GiST `(technician_id, period)`                                                                                                         |
| `appointments`          | 1E    | `booking_request_id` RESTRICT, `customer_id` RESTRICT, `vehicle_id` RESTRICT, `status`, `scheduled tstzrange`, `version integer` | Partial UK `booking_request_id WHERE status <> 'CANCELLED'`; index `(lower(scheduled))`                                                |
| `appointment_services`  | 1E    | `appointment_id` CASCADE, `service_definition_id` RESTRICT, `planned_minutes`                                                    | PK `(appointment_id, service_definition_id)`                                                                                           |
| `capacity_holds`        | 1E    | `hold_token`, `created_by_staff_user_id`, `expires_at`, `status`                                                                 | UK `hold_token`; index `(status, expires_at)` for the expiry job                                                                       |
| `resource_reservations` | 1E    | `resource_id` RESTRICT, `appointment_id` CASCADE, `capacity_hold_id` CASCADE, `during tstzrange`, `status`, `kind`               | **EXCLUDE GiST `(resource_id =, during &&) WHERE status IN ('HELD','CONFIRMED')`**; CHECK exactly one of appointment/hold while active |

### E. Workshop operations (future)

| Table                     | Key columns                                                                                      | Constraints and indexes                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `job_cards`               | `number`, `appointment_id`, `vehicle_id`, `customer_id`, `status`, `odometer_in_km`, `opened_at` | UK `number`; partial UK `appointment_id`; index `(status, opened_at)`                                                                  |
| `job_card_tasks`          | `job_card_id` CASCADE, `service_definition_id`, `assigned_technician_id`, `status`               | Index `job_card_id`, `(assigned_technician_id, status)`                                                                                |
| `vehicle_inspections`     | `job_card_id` RESTRICT, `type`, `odometer_km`, `inspector_staff_user_id`                         | Odometer written to `mileage_readings` as `VERIFIED_INSPECTION`                                                                        |
| `inspection_findings`     | `inspection_id` CASCADE, `item`, `severity`, `recommended_service_definition_id`                 | —                                                                                                                                      |
| `diagnostic_results`      | `job_card_task_id` CASCADE, `fault_codes text[]`, `readings jsonb`                               | GIN on `fault_codes`                                                                                                                   |
| `parts`                   | `sku`, `name`, `unit`                                                                            | UK `sku`                                                                                                                               |
| `part_requirements`       | `job_card_task_id` CASCADE, `part_id` RESTRICT, `quantity numeric(12,3)`, `status`               | CHECK `quantity > 0`                                                                                                                   |
| `part_usages`             | `job_card_task_id` RESTRICT, `part_id` RESTRICT, `quantity`, `unit_cost_minor`                   | CHECK `quantity > 0`                                                                                                                   |
| `work_logs`               | `job_card_task_id` RESTRICT, `technician_id` RESTRICT, `worked tstzrange`                        | EXCLUDE `(technician_id =, worked &&)`                                                                                                 |
| `job_status_history`      | `job_card_id` RESTRICT, `from_status`, `to_status`, actor, `occurred_at`                         | Append-only                                                                                                                            |
| `qc_inspections`          | `job_card_id` RESTRICT, `passed`, `inspector_staff_user_id`, `notes`                             | —                                                                                                                                      |
| `vehicle_handovers`       | `job_card_id` RESTRICT, `collected_by_name`, `odometer_out_km`, `signature_file_id`              | UK `job_card_id`                                                                                                                       |
| `paint_production_blocks` | `job_card_id` RESTRICT, `stage`, `sequence`, `status`, planned/actual times                      | Each block owns one `resource_reservations` row (kind `PRODUCTION`) on its booth, so the single exclusion constraint covers it (BR-10) |

### F. Quotations & finance (future)

| Table                   | Key columns                                                                                         | Constraints and indexes                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `quotations`            | `number`, `version`, `job_card_id`, `customer_id`, `status`, `currency_code`, totals                | UK `(number, version)`; immutable after `SENT` (trigger)                                                |
| `quotation_lines`       | `quotation_id` CASCADE, `kind`, `description`, `quantity`, `unit_price_minor`, `tax_rate`           | CHECK non-negative amounts                                                                              |
| `quotation_approvals`   | `quotation_id` RESTRICT, `quotation_line_id`, `decision`, `channel`, `evidence jsonb`, `decided_at` | Append-only                                                                                             |
| `invoices`              | `series`, `sequence_no`, `job_card_id`, `customer_id`, `status`, `issued_at`, totals                | UK `(series, sequence_no)`; numbering in a transaction via a counter row lock; immutable after `ISSUED` |
| `invoice_lines`         | `invoice_id` CASCADE, snapshot of description, quantity, prices, tax                                | —                                                                                                       |
| `payments`              | `invoice_id` RESTRICT, `method`, `provider_reference`, `amount_minor`, `received_at`                | Partial UK `(method, provider_reference) WHERE NOT NULL` (idempotent webhooks)                          |
| `refunds`               | `payment_id` RESTRICT, `amount_minor`, `reason`, `approved_by_staff_user_id`                        | CHECK amount > 0; sum ≤ payment (trigger)                                                               |
| `financial_adjustments` | `invoice_id` RESTRICT, `type`, `amount_minor`, `reason`, `approved_by_staff_user_id`                | Append-only                                                                                             |

### G. Customer retention

| Table                            | Phase  | Key columns                                                                                                               | Constraints and indexes                                                                             |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `service_records`                | 1F     | `vehicle_id` RESTRICT, `job_card_id` RESTRICT (nullable), `serviced_on`, `odometer_km`, `summary`                         | Partial UK `job_card_id`; index `(vehicle_id, serviced_on DESC)`                                    |
| `service_recommendations`        | future | `vehicle_id`, `inspection_finding_id`, `status`, `due_on`                                                                 | —                                                                                                   |
| `mileage_readings`               | 1F     | `vehicle_id` RESTRICT, `odometer_km`, `source`, `read_at`, `recorded_by_*`                                                | CHECK `odometer_km >= 0`; index `(vehicle_id, read_at DESC)`; `ESTIMATED` never overwrites verified |
| `reminder_rules`                 | 1F     | `service_definition_id`, `interval_months`, `interval_km`, `lead_days`, `active`                                          | CHECK at least one interval                                                                         |
| `reminder_schedules`             | 1F     | `vehicle_id`, `reminder_rule_id`, `due_on`, `due_at_km`, `due_km_is_estimate`, `state`, `next_notify_at`                  | UK `(vehicle_id, reminder_rule_id)`; index `(state, next_notify_at)`                                |
| `notification_templates`         | 1F     | `code`, `channel`, `locale`, `version`, `body`, `active`                                                                  | UK `(code, channel, locale, version)`                                                               |
| `notification_outbox`            | 1F     | `idempotency_key`, `customer_id`, `channel`, `template_id`, `payload jsonb`, `status`, `not_before`, `consent_checked_at` | UK `idempotency_key`; index `(status, not_before)`                                                  |
| `notification_delivery_attempts` | 1F     | `outbox_id` CASCADE, `attempt_no`, `provider`, `provider_message_id`, `status`, `error_code`                              | UK `(outbox_id, attempt_no)`; index `(provider, provider_message_id)`                               |
| `notification_provider_events`   | 1F     | `provider`, `provider_event_id`, `delivery_attempt_id`, `type`, `payload jsonb`, `received_at`                            | UK `(provider, provider_event_id)` (webhook dedupe)                                                 |

### H. Platform administration

| Table                 | Phase | Key columns                                                                   | Constraints and indexes                                              |
| --------------------- | ----- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `system_settings`     | 1D    | `key text` PK, `value jsonb`, `updated_by_staff_user_id`, `updated_at`        | Keys defined in code with Zod schemas; no secrets                    |
| `integration_configs` | 1F    | `provider`, `enabled`, `settings jsonb`, `secret_ref text`                    | UK `provider`; `secret_ref` names an env var/secret, never the value |
| `background_job_runs` | 1F    | `job_name`, `run_key`, `status`, `started_at`, `finished_at`, `error_summary` | UK `(job_name, run_key)` (idempotent scheduling)                     |
