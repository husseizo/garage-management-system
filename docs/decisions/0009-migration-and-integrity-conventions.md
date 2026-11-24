# 0009 — Migration safety and data-integrity conventions

- **Status:** Accepted
- **Date:** 2026-11-24

## Context

The full domain has ~80 tables, delivered in phases. BR-15 requires incremental, non-destructive
migrations. Prisma does not model CHECK constraints, exclusion constraints or triggers, but those
carry several business rules (BR-04, BR-09, BR-14).

## Decision

- **Database first for invariants.** Rules that must never be violated (uniqueness, non-overlap,
  append-only, value shape) are database constraints. Application validation (Zod) mirrors them
  for good error messages but is not the last line of defence.
- **Prisma schema + hand-extended SQL.** Each migration starts from
  `prisma migrate diff --from-config-datasource --to-schema` and is extended by hand with CHECKs,
  exclusions and triggers, with a comment header stating that it is additive.
- **Migration procedure:** `db:guard` → dry-run in `BEGIN … ROLLBACK` on `development` → review →
  `db:migrate:deploy` → drift check (`migrate diff --exit-code`) → integration tests. Production
  only via owner-approved release.
- **Additive by default.** Destructive steps use expand → migrate → contract, and a Neon
  point-in-time branch is taken before the contract step. `prisma migrate reset` is never used.
- **Conventions:** RESTRICT by default, CASCADE only for owned details; soft delete for master data;
  money in minor units; constraint names `<table>_<column>_<rule>`.

## Consequences

- Constraint names become part of the API: services map `23505`/`23514`/`23P01` plus the
  constraint name to `AppError` codes.
- Drift checks cannot see CHECKs and triggers, so integration tests assert them explicitly
  (`tests/integration/phase-1a-schema.test.ts`).
