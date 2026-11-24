# 0008 — Identifiers and time representation

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

BR-01 requires internal UUIDs for customer identity. Natural keys (phone, VIN, plate, booking
reference) change or are missing. Phase 0's `staff_users` uses Prisma `cuid()` text keys and
`timestamp(3)` without a time zone. Neon runs PostgreSQL 18.7, which ships a native `uuidv7()`.

## Decision

- Every table from Phase 1A onward uses `id uuid PRIMARY KEY DEFAULT uuidv7()`. The key is
  generated **in the database**, so raw SQL, imports and jobs get the same keys as Prisma.
  UUIDv7 is time-ordered, which keeps B-tree inserts local and makes IDs roughly sortable by
  creation.
- Natural identifiers are attributes with their own normalised columns and (partial) unique
  constraints. They are never PKs or FK targets.
- `staff_users.id` stays `cuid` text. Converting it would rewrite the table and every reference for
  no functional gain. FKs to it are `text`.
- New timestamps are `timestamptz(3)`. Garage-local wall-clock values (opening hours, shifts) are
  `time` + weekday, resolved through `garage_profile.timezone`.

## Consequences

- PostgreSQL 18+ is a hard requirement (documented; Neon meets it). Porting to an older server
  would need `gen_random_uuid()` (v4) or an extension.
- UUIDv7 embeds creation time at millisecond resolution. That is acceptable for internal IDs; IDs are
  still not shown to unauthenticated users.
- `staff_users` timestamps without a time zone remain as debt (R-04), to be converted in a
  scheduled maintenance migration.
