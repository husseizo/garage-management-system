# 0001 — Modular monolith on Next.js App Router

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

The GMS serves one workshop. It needs a public booking surface, a customer portal, and a staff
dashboard, all sharing one data model (customers, vehicles, bookings, bays, technicians). The team is
small, and operational simplicity matters more than independent scaling of components.

## Decision

Build a single Next.js (App Router) application structured as a **modular monolith**:

- `src/app/` holds routing, layouts and thin page components only.
- `src/modules/<domain>/` holds business logic per bounded context (bookings, scheduling, reminders,
  customers, vehicles, staff, notifications). Modules expose a small public API through their
  `index.ts`; other code must not reach into a module's internals.
- `src/server/` holds cross-cutting server infrastructure (env, db, auth, logging, errors).
- UI components never contain business rules; they call server actions / route handlers, which call
  module services.

No microservices. Background work (reminder dispatch, notification delivery) will run as scheduled
jobs invoking the same module code, not as separate services.

## Consequences

- One deployable, one database, one CI pipeline — simple to operate.
- Module boundaries are enforced by convention and review (and can later be enforced by ESLint
  import rules) rather than by network boundaries.
- If a module ever needs to scale independently, its clean public API makes extraction feasible.
