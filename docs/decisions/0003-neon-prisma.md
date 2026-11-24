# 0003 — Neon PostgreSQL with Prisma ORM

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

We need a managed PostgreSQL with cheap isolated environments and a type-safe data layer.

## Decision

- **Neon** hosts PostgreSQL. Use a `development` branch for local work and preview deployments and a
  separate `production` branch. Production is never touched without explicit owner authorisation.
- **Prisma 7** with the `prisma-client` generator (output `src/generated/prisma`, git-ignored and
  regenerated on `postinstall`) and the **`@prisma/adapter-neon`** driver adapter at runtime.
- Two connection strings: `DATABASE_URL` (pooled, runtime) and `DIRECT_URL` (direct, migrations,
  configured in `prisma.config.ts`).
- The client is created lazily (`getDb()`), so the app runs without a database and the health check
  reports `unconfigured`.
- Migrations are SQL files in `prisma/migrations`, reviewed in PRs. `migrate dev` only against the
  development branch; `migrate deploy` in release pipelines. Destructive changes (drops, type
  narrowing) require an explicit expand → migrate → contract plan and owner approval.

## Consequences

- Phase 0 ships one table (`staff_users`) needed for authentication; the business schema is Phase 1.
- The initial migration was generated offline (`prisma migrate diff`) and has not yet been applied
  to any database.
