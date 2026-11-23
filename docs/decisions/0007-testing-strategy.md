# 0007 — Testing strategy

- **Status:** Accepted
- **Date:** 2026-11-23

## Decision

| Layer       | Tool                           | Location            | Scope                                                                                                                                       |
| ----------- | ------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Vitest (`unit` project)        | `tests/unit`        | Pure logic: env schema, redirect rules, roles, hashing, errors, log redaction                                                               |
| Integration | Vitest (`integration` project) | `tests/integration` | Server modules wired together with framework boundaries mocked: guards, health route, DB client; live Neon check when `DATABASE_URL` is set |
| End to end  | Playwright                     | `tests/e2e`         | Production build: public routes render, all dashboard routes redirect, forged cookies rejected, headers, health                             |

`server-only` is aliased to a stub in Vitest. E2E runs `next start` with no database.
CI (`.github/workflows/ci.yml`) runs typecheck, lint, format check, Vitest, build and Playwright on
every PR to `develop` and `main`.

## Consequences

- Tests that need a database are skipped — and reported as skipped — when no credentials exist.
- Phase 1 should add a disposable Neon branch per CI run for database-backed integration tests.
