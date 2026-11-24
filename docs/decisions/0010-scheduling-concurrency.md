# 0010 — Prevent double booking with PostgreSQL exclusion constraints

- **Status:** Accepted (design). Implemented in Phase 1E
- **Date:** 2026-11-24

## Context

BR-09: concurrent confirmations must not overbook technicians, bays or paint booths. Writes go
through Neon's PgBouncer pooler in transaction mode. Options compared in
`docs/architecture/database/scheduling-model.md` §6.2: check-then-insert, row locks, advisory locks,
SERIALIZABLE, discrete slot tables, and exclusion constraints.

## Decision

- All capacity claims are rows in one table, `resource_reservations (resource_id, during tstzrange,
status)`, protected by
  `EXCLUDE USING gist (resource_id WITH =, during WITH &&) WHERE (status IN ('HELD','CONFIRMED'))`
  (`btree_gist`).
- Technicians, bays and paint booths share the `scheduling_resources` supertype, so one constraint
  covers every resource kind without polymorphic FKs. Paint production stages reserve booths
  through the same table (BR-10).
- Confirmation is one transaction that inserts all of an appointment's reservations. `23P01` rolls
  everything back and is reported as a conflict with fresh alternatives.
- Holds use status `HELD` in the same table, so held capacity is protected identically. Expiry is a
  background job.

## Consequences

- Correctness does not depend on every code path following a locking protocol.
- Ranges are half-open `[start, end)`; back-to-back bookings are allowed.
- Slot search stays an application concern and may be stale; the constraint is the arbiter.
- Requires the `btree_gist` extension (available on Neon).
