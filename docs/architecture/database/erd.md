# Entity-relationship design

- **Status:** Phase 1A design baseline (2026-11-24)
- **Format:** Mermaid `erDiagram`, renders on GitHub and can be diffed in Git. One diagram per domain
  plus a context map; attributes show keys and the columns that carry relationships or rules.
- **Legend:** `PK` primary key · `FK` foreign key · `UK` unique (alone or as part of a composite or
  partial unique index) · Mermaid cardinality: `||` exactly one, `o|` zero or one, `}o` zero or
  many, `}|` one or many.
- Tables that exist today: `staff_users` (Phase 0), `garage_profile` and `audit_logs` (Phase 1A).

## 0. Context map

```mermaid
erDiagram
    customers ||--o{ customer_contacts : has
    customers ||--o{ vehicle_ownerships : "owns over time"
    vehicles ||--o{ vehicle_ownerships : "owned over time"
    vehicles ||--o{ vehicle_registrations : "plates over time"
    booking_requests }o--o| customers : "matched to (staff action)"
    booking_requests }o--o| vehicles : "matched to (staff action)"
    booking_requests ||--o| appointments : "confirmed as"
    appointments }o--|| vehicles : for
    appointments }o--|| customers : for
    appointments ||--o{ resource_reservations : allocates
    scheduling_resources ||--o{ resource_reservations : "reserved by"
    appointments ||--o| job_cards : "checked in as"
    job_cards }o--|| vehicles : services
    job_cards }o--|| customers : "billed to"
    job_cards ||--o{ quotations : estimates
    job_cards ||--o{ invoices : bills
    job_cards ||--o| service_records : produces
    service_records }o--|| vehicles : "history of"
    vehicles ||--o{ reminder_schedules : "next due"
    customers ||--o{ consent_records : grants
    notification_outbox }o--o| customers : to
    staff_users ||--o{ audit_logs : "acts in"
```

## A. Identity & access

```mermaid
erDiagram
    staff_users {
        text id PK "cuid (Phase 0)"
        text email UK
        text password_hash
        StaffRole role "legacy enum, superseded by assignments in 1D"
        boolean active
    }
    roles {
        uuid id PK
        text code UK
        boolean system "built-in roles cannot be deleted"
    }
    permissions {
        uuid id PK
        text code UK "e.g. booking.confirm"
    }
    role_permissions {
        uuid role_id PK,FK
        uuid permission_id PK,FK
    }
    staff_role_assignments {
        uuid id PK
        text staff_user_id FK
        uuid role_id FK
        text granted_by_staff_user_id FK
        timestamptz revoked_at "partial UK (staff_user_id, role_id) where revoked_at is null"
    }
    customer_verification_challenges {
        uuid id PK
        uuid contact_id FK "nullable: guest challenge uses target only"
        text target_e164_or_email
        ChallengePurpose purpose
        text code_hash
        timestamptz expires_at
        smallint attempts
        timestamptz consumed_at
    }
    auth_sessions {
        uuid id PK
        SessionSubject subject_type "PORTAL_ACCOUNT | STAFF"
        uuid portal_account_id FK
        text staff_user_id FK
        bytea token_hash UK
        timestamptz expires_at
        timestamptz revoked_at
    }
    auth_events {
        uuid id PK
        AuthEventType type
        text staff_user_id FK
        uuid customer_id FK
        bytea ip_hash
        timestamptz occurred_at
    }
    roles ||--o{ role_permissions : grants
    permissions ||--o{ role_permissions : "granted by"
    staff_users ||--o{ staff_role_assignments : holds
    roles ||--o{ staff_role_assignments : "assigned in"
    staff_users ||--o{ auth_sessions : "signs in (staff, future)"
    staff_users ||--o{ auth_events : generates
    customer_portal_accounts {
        uuid id PK
        ContactKind kind "PHONE | EMAIL"
        text value_normalised UK "E.164 or lower-case email"
        timestamptz verified_at
        timestamptz disabled_at
    }
    customer_portal_access {
        uuid id PK
        uuid portal_account_id FK
        uuid customer_id FK
        PortalRole role "HOLDER | COMPANY_ADMIN | COMPANY_VIEWER"
        text granted_by_staff_user_id FK
        timestamptz revoked_at "partial UK (portal_account_id, customer_id) where revoked_at is null"
    }
    customer_portal_accounts ||--o{ customer_portal_access : "is granted"
    customer_portal_accounts ||--o{ auth_sessions : "signs in (customer)"
```

Customer sessions belong to a **portal account** (a person proving control of a phone/email), not
to a customer. Several customers may share a phone (D-05), so access to each customer requires its
own `customer_portal_access` grant (ADR 0013). The `customers` table is in diagram B.

`auth_sessions` uses an exclusive-arc check: exactly one of `portal_account_id`/`staff_user_id` is set,
matching `subject_type`. Both are real FKs, so this is not polymorphism.

## B. Customer management

```mermaid
erDiagram
    customers {
        uuid id PK
        CustomerKind kind "INDIVIDUAL | COMPANY"
        text display_name
        text preferred_language
        timestamptz deleted_at "soft delete"
        timestamptz anonymised_at
    }
    customer_contacts {
        uuid id PK
        uuid customer_id FK
        ContactKind kind "PHONE | EMAIL"
        text value_raw
        text value_normalised "E.164 or lower-case email; NOT unique across customers (D-05)"
        text contact_person_name "COMPANY contacts"
        boolean is_primary "partial UK (customer_id, kind) where is_primary"
        timestamptz verified_at
        timestamptz deleted_at
    }
    vehicles {
        uuid id PK
        text vin_raw
        text vin_normalised "partial UK where not null"
        text make
        text model
        smallint model_year
        FuelType fuel_type
        timestamptz deleted_at
    }
    vehicle_registrations {
        uuid id PK
        uuid vehicle_id FK
        char country_code
        text plate_raw
        text plate_normalised
        tstzrange valid "EXCLUDE no overlap per (country_code, plate_normalised)"
    }
    vehicle_ownerships {
        uuid id PK
        uuid vehicle_id FK
        uuid customer_id FK
        OwnershipRole role "OWNER | KEEPER | FLEET_DRIVER"
        tstzrange period "EXCLUDE one OWNER per vehicle at a time"
        text source "staff | import | transfer"
    }
    customer_communication_preferences {
        uuid customer_id PK,FK
        Channel channel PK
        Topic topic PK
        boolean allowed
        time quiet_from
        time quiet_to
    }
    consent_records {
        uuid id PK
        uuid customer_id FK
        ConsentPurpose purpose
        Channel channel
        ConsentAction action "GRANTED | WITHDRAWN"
        text evidence "form version, IP hash, staff id"
        timestamptz recorded_at
    }
    customers ||--o{ customer_contacts : has
    customers ||--o{ vehicle_ownerships : holds
    vehicles ||--o{ vehicle_ownerships : "held via"
    vehicles ||--o{ vehicle_registrations : carries
    customers ||--o{ customer_communication_preferences : sets
    customers ||--o{ consent_records : records
```

## C. Booking management

```mermaid
erDiagram
    service_categories {
        uuid id PK
        text code UK
        smallint sort_order
    }
    service_definitions {
        uuid id PK
        uuid category_id FK
        text code UK
        text name
        integer default_duration_minutes
        boolean publicly_bookable
        boolean active
    }
    booking_requests {
        uuid id PK
        text reference UK "human-facing, not a credential"
        BookingSource source "WEB_GUEST | WEB_CUSTOMER | STAFF | PHONE"
        BookingStatus status
        uuid customer_id FK "null until matched"
        uuid vehicle_id FK "null until matched"
        jsonb contact_snapshot "as submitted"
        jsonb vehicle_snapshot "as submitted"
        tstzrange preferred_window
        text idempotency_key UK
        timestamptz submitted_at
    }
    booking_request_services {
        uuid booking_request_id PK,FK
        uuid service_definition_id PK,FK
        text customer_notes
    }
    booking_status_history {
        uuid id PK
        uuid booking_request_id FK
        BookingStatus from_status
        BookingStatus to_status
        text actor_staff_user_id FK
        text reason
        timestamptz occurred_at
    }
    file_attachments {
        uuid id PK
        text storage_key UK
        text mime_type
        bigint size_bytes
        bytea sha256
        ScanStatus scan_status
    }
    booking_attachments {
        uuid booking_request_id PK,FK
        uuid file_attachment_id PK,FK
    }
    booking_communications {
        uuid id PK
        uuid booking_request_id FK
        CommDirection direction
        Channel channel
        uuid notification_outbox_id FK "system messages"
        text staff_user_id FK "manual notes/calls"
        timestamptz occurred_at
    }
    service_categories ||--o{ service_definitions : groups
    booking_requests ||--o{ booking_request_services : requests
    service_definitions ||--o{ booking_request_services : "requested as"
    booking_requests ||--o{ booking_status_history : "transitions"
    booking_requests ||--o{ booking_attachments : has
    file_attachments ||--o{ booking_attachments : "attached as"
    booking_requests ||--o{ booking_communications : logs
```

## D. Smart scheduling

```mermaid
erDiagram
    scheduling_resources {
        uuid id PK
        ResourceKind kind "TECHNICIAN | BAY | PAINT_BOOTH"
        text name
        boolean active
    }
    technicians {
        uuid id PK
        uuid resource_id FK,UK
        text staff_user_id FK,UK "nullable"
        text display_name
    }
    service_bays {
        uuid id PK
        uuid resource_id FK,UK
        text code UK
    }
    skills {
        uuid id PK
        text code UK
    }
    technician_skills {
        uuid technician_id PK,FK
        uuid skill_id PK,FK
        smallint level
        date certified_until
    }
    bay_capabilities {
        uuid service_bay_id PK,FK
        BayCapability capability PK
    }
    service_requirements {
        uuid id PK
        uuid service_definition_id FK
        uuid skill_id FK "nullable"
        BayCapability bay_capability "nullable"
        integer duration_minutes
        smallint technicians_needed
    }
    garage_working_hours {
        uuid id PK
        smallint iso_weekday
        time opens_at
        time closes_at
        daterange effective "EXCLUDE overlap per weekday"
    }
    garage_closures {
        uuid id PK
        tstzrange period
        text reason
    }
    technician_shifts {
        uuid id PK
        uuid technician_id FK
        smallint iso_weekday
        time starts_at
        time ends_at
        daterange effective
    }
    technician_leave {
        uuid id PK
        uuid technician_id FK
        tstzrange period
        LeaveType type
    }
    appointments {
        uuid id PK
        uuid booking_request_id FK,UK "nullable: staff-created"
        uuid customer_id FK
        uuid vehicle_id FK
        AppointmentStatus status
        tstzrange scheduled
        integer version "optimistic concurrency"
    }
    appointment_services {
        uuid appointment_id PK,FK
        uuid service_definition_id PK,FK
        integer planned_minutes
    }
    capacity_holds {
        uuid id PK
        text hold_token UK
        text created_by_staff_user_id FK
        timestamptz expires_at
        HoldStatus status
    }
    resource_reservations {
        uuid id PK
        uuid resource_id FK
        uuid appointment_id FK "nullable while held"
        uuid capacity_hold_id FK "nullable once confirmed"
        tstzrange during "EXCLUDE overlap per resource where active"
        ReservationStatus status "HELD | CONFIRMED | RELEASED | CANCELLED"
    }
    scheduling_resources ||--o| technicians : "is a"
    scheduling_resources ||--o| service_bays : "is a"
    technicians ||--o{ technician_skills : has
    skills ||--o{ technician_skills : "held by"
    service_bays ||--o{ bay_capabilities : supports
    technicians ||--o{ technician_shifts : works
    technicians ||--o{ technician_leave : "is away"
    service_definitions ||--o{ service_requirements : needs
    appointments ||--o{ appointment_services : covers
    appointments ||--o{ resource_reservations : allocates
    capacity_holds ||--o{ resource_reservations : "holds"
    scheduling_resources ||--o{ resource_reservations : "booked as"
```

## E. Workshop operations (future)

```mermaid
erDiagram
    job_cards {
        uuid id PK
        text number UK
        uuid appointment_id FK,UK "nullable: walk-in"
        uuid vehicle_id FK
        uuid customer_id FK
        JobStatus status
        integer odometer_in_km
    }
    job_card_tasks {
        uuid id PK
        uuid job_card_id FK
        uuid service_definition_id FK "nullable: ad-hoc"
        uuid assigned_technician_id FK
        TaskStatus status
    }
    vehicle_inspections {
        uuid id PK
        uuid job_card_id FK
        InspectionType type "CHECK_IN | MULTIPOINT | BODYWORK | PRE_DELIVERY"
        integer odometer_km
    }
    inspection_findings {
        uuid id PK
        uuid inspection_id FK
        Severity severity
        uuid recommended_service_definition_id FK
    }
    diagnostic_results {
        uuid id PK
        uuid job_card_task_id FK
        text_array fault_codes
    }
    parts {
        uuid id PK
        text sku UK
    }
    part_requirements {
        uuid id PK
        uuid job_card_task_id FK
        uuid part_id FK
        numeric quantity
        PartReqStatus status
    }
    part_usages {
        uuid id PK
        uuid job_card_task_id FK
        uuid part_id FK
        numeric quantity
        bigint unit_cost_minor
    }
    work_logs {
        uuid id PK
        uuid job_card_task_id FK
        uuid technician_id FK
        tstzrange worked "EXCLUDE overlap per technician"
    }
    job_status_history {
        uuid id PK
        uuid job_card_id FK
        JobStatus to_status
    }
    qc_inspections {
        uuid id PK
        uuid job_card_id FK
        boolean passed
        text inspector_staff_user_id FK
    }
    vehicle_handovers {
        uuid id PK
        uuid job_card_id FK,UK
        integer odometer_out_km
        uuid signature_file_id FK
    }
    paint_production_blocks {
        uuid id PK
        uuid job_card_id FK
        PaintStage stage
        smallint sequence
        PaintBlockStatus status "booth time = its resource_reservations row (kind PRODUCTION)"
    }
    job_cards ||--o{ job_card_tasks : contains
    job_cards ||--o{ vehicle_inspections : "inspected in"
    vehicle_inspections ||--o{ inspection_findings : finds
    job_card_tasks ||--o{ diagnostic_results : records
    job_card_tasks ||--o{ part_requirements : needs
    job_card_tasks ||--o{ part_usages : uses
    parts ||--o{ part_requirements : "required as"
    parts ||--o{ part_usages : "used as"
    job_card_tasks ||--o{ work_logs : "worked in"
    job_cards ||--o{ job_status_history : transitions
    job_cards ||--o{ qc_inspections : "checked in"
    job_cards ||--o| vehicle_handovers : "released in"
    job_cards ||--o{ paint_production_blocks : "painted in"
```

## F. Quotations & finance (future)

```mermaid
erDiagram
    quotations {
        uuid id PK
        text number UK
        uuid job_card_id FK "nullable: pre-visit estimate"
        uuid customer_id FK
        smallint version "UK (number, version)"
        QuoteStatus status
        char currency_code
        bigint total_minor
    }
    quotation_lines {
        uuid id PK
        uuid quotation_id FK
        LineKind kind "LABOUR | PART | FEE"
        numeric quantity
        bigint unit_price_minor
        numeric tax_rate
    }
    quotation_approvals {
        uuid id PK
        uuid quotation_id FK
        uuid quotation_line_id FK "nullable: whole quote"
        ApprovalDecision decision
        Channel channel
        text evidence
    }
    invoices {
        uuid id PK
        text series
        integer sequence_no "UK (series, sequence_no), gap-free"
        uuid job_card_id FK
        uuid customer_id FK
        InvoiceStatus status
        timestamptz issued_at
    }
    invoice_lines {
        uuid id PK
        uuid invoice_id FK
        bigint amount_minor
    }
    payments {
        uuid id PK
        uuid invoice_id FK
        PaymentMethod method
        text provider_reference "partial UK (method, provider_reference)"
        bigint amount_minor
    }
    refunds {
        uuid id PK
        uuid payment_id FK
        bigint amount_minor
    }
    financial_adjustments {
        uuid id PK
        uuid invoice_id FK
        AdjustmentType type
        bigint amount_minor
        text approved_by_staff_user_id FK
    }
    quotations ||--o{ quotation_lines : itemises
    quotations ||--o{ quotation_approvals : "decided by"
    invoices ||--o{ invoice_lines : itemises
    invoices ||--o{ payments : "paid by"
    payments ||--o{ refunds : "refunded by"
    invoices ||--o{ financial_adjustments : "adjusted by"
```

## G. Customer retention

```mermaid
erDiagram
    service_records {
        uuid id PK
        uuid vehicle_id FK
        uuid job_card_id FK,UK "nullable: imported history"
        date serviced_on
        integer odometer_km
    }
    service_recommendations {
        uuid id PK
        uuid vehicle_id FK
        uuid inspection_finding_id FK
        RecStatus status
    }
    mileage_readings {
        uuid id PK
        uuid vehicle_id FK
        integer odometer_km
        MileageSource source "VERIFIED_INSPECTION | CUSTOMER_REPORTED | ESTIMATED"
        timestamptz read_at
    }
    reminder_rules {
        uuid id PK
        uuid service_definition_id FK
        smallint interval_months
        integer interval_km
    }
    reminder_schedules {
        uuid id PK
        uuid vehicle_id FK
        uuid reminder_rule_id FK "UK (vehicle_id, reminder_rule_id)"
        date due_on
        integer due_at_km
        boolean due_km_is_estimate
        ReminderState state
    }
    notification_templates {
        uuid id PK
        text code
        Channel channel
        text locale
        smallint version "UK (code, channel, locale, version)"
    }
    notification_outbox {
        uuid id PK
        text idempotency_key UK
        uuid customer_id FK
        uuid template_id FK
        Channel channel
        OutboxStatus status
        timestamptz not_before
    }
    notification_delivery_attempts {
        uuid id PK
        uuid outbox_id FK
        smallint attempt_no "UK (outbox_id, attempt_no)"
        text provider_message_id
        AttemptStatus status
    }
    notification_provider_events {
        uuid id PK
        text provider
        text provider_event_id "UK (provider, provider_event_id)"
        uuid delivery_attempt_id FK
    }
    vehicles ||--o{ service_records : "history"
    vehicles ||--o{ mileage_readings : "odometer"
    vehicles ||--o{ reminder_schedules : "due"
    reminder_rules ||--o{ reminder_schedules : drives
    notification_templates ||--o{ notification_outbox : renders
    notification_outbox ||--o{ notification_delivery_attempts : "tried as"
    notification_delivery_attempts ||--o{ notification_provider_events : reports
```

## H. Platform administration

```mermaid
erDiagram
    garage_profile {
        uuid id PK "uuidv7() — Phase 1A"
        boolean singleton UK "CHECK = true, so max one row"
        text display_name
        char country_code "ISO 3166-1 alpha-2"
        text timezone "IANA"
        char currency_code "ISO 4217"
        text contact_phone_e164
    }
    audit_logs {
        uuid id PK "uuidv7() — Phase 1A"
        timestamptz occurred_at
        AuditActorType actor_type "STAFF | CUSTOMER | SYSTEM"
        text actor_staff_user_id FK "RESTRICT"
        text action "dotted verb"
        text entity_type "by value (ADR 0012)"
        text entity_id
        jsonb changes "redacted"
    }
    system_settings {
        text key PK
        jsonb value
        text updated_by_staff_user_id FK
    }
    integration_configs {
        uuid id PK
        text provider UK
        jsonb settings "non-secret"
        text secret_ref "name of env/secret, never the value"
    }
    background_job_runs {
        uuid id PK
        text job_name
        text run_key "UK (job_name, run_key)"
        JobRunStatus status
        timestamptz started_at
    }
    staff_users ||--o{ audit_logs : "actor (Phase 1A)"
    staff_users ||--o{ system_settings : "last edited"
```

## Referential actions

| Relationship                                                                                                       | ON DELETE                                                           | Why                                                                                              |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `audit_logs.actor_staff_user_id → staff_users`                                                                     | **RESTRICT** (1A)                                                   | Audit evidence must keep its actor; staff are deactivated, not deleted                           |
| Child "detail" rows → aggregate root (contacts → customer, lines → quotation, attempts → outbox, role_permissions) | CASCADE                                                             | Rows have no meaning without the parent and are only hard-deleted with it during approved purges |
| History rows (`*_status_history`, `consent_records`, `mileage_readings`, `vehicle_ownerships`)                     | RESTRICT                                                            | History must not vanish silently                                                                 |
| Cross-aggregate references (appointment → customer/vehicle, job card → appointment, invoice → job card)            | RESTRICT                                                            | Business records are soft-deleted or anonymised, never cascaded                                  |
| Optional links (`booking_requests.customer_id`, `technicians.staff_user_id`)                                       | SET NULL only where losing the link is harmless; otherwise RESTRICT | Documented per table in the data dictionary                                                      |
| All FKs                                                                                                            | ON UPDATE CASCADE (Prisma default; keys are immutable in practice)  | —                                                                                                |

## Indexing strategy

1. **Every FK column gets an index** (PostgreSQL does not create them automatically). A composite
   index whose leading column is the FK counts.
2. **Partial unique indexes** encode "one current/active X": `WHERE deleted_at IS NULL`,
   `WHERE revoked_at IS NULL`, `WHERE is_primary`.
3. **Time-descending composites** for history lists (`(entity, occurred_at DESC)`), as on
   `audit_logs`.
4. **GiST exclusion constraints** (`btree_gist`) on `tstzrange` columns for non-overlap: reservations,
   ownership periods, plate validity, work logs. Paint stages reserve booths through
   `resource_reservations`, so one constraint covers all booth usage.
5. **Trigram indexes** (`pg_trgm`) on normalised names, plates and phones for duplicate detection and
   staff search (1B).
6. **No speculative indexes.** Add them with the query that needs them and verify with `EXPLAIN`.
   Neon `inspect db unused-indexes` and `seq-scans` are reviewed each phase.

## Data lifecycle (summary)

| Data                                       | Lifecycle                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Configuration (`garage_profile`, settings) | Updated in place; every change written to `audit_logs`                                                 |
| Customers, contacts, vehicles              | Soft delete (`deleted_at`); anonymisation on erasure request (PII replaced, IDs kept)                  |
| Booking requests                           | Kept; guest snapshots purged/anonymised after the retention period if never matched (Q-06)             |
| Appointments, job cards, service records   | Kept for the vehicle's history; customer PII lives in `customers`, not duplicated                      |
| Financial documents                        | Immutable once issued; corrections by adjustment/credit note; retained for the statutory period (Q-06) |
| Verification challenges, sessions          | Hard-deleted by a background job after expiry plus 30 days                                             |
| Audit logs                                 | Append-only (trigger); retention purge only through an owner-approved maintenance procedure            |
| Notification outbox and attempts           | Kept for 12 months then purged; consent records kept as long as the customer exists                    |

See [`business-rules.md`](business-rules.md) for the full integrity and security rules.
