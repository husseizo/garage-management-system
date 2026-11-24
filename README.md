# Garage Management System (GMS)

A web application for an independent automotive workshop offering general servicing, mechanical
repairs, diagnostics, bodywork/accident repair and vehicle painting.

It provides two interfaces:

- **Customer portal** — guest service booking, appointment tracking, vehicle information, service
  history (verified access) and service reminders.
- **Garage dashboard** — customers and vehicles, booking requests, appointment calendar,
  technicians, service bays, capacity-based scheduling, notifications and reporting.

> **Status: Phase 0 — foundation.** Routing, layouts, authentication, database wiring, tooling, CI
> and documentation are in place. Business features are not implemented yet; dashboard pages show
> honest placeholders and no sample data. See [`docs/progress/phase-0-report.md`](docs/progress/phase-0-report.md).

## Tech stack

Next.js 16 (App Router) · TypeScript 5.9 (strict) · Tailwind CSS 4 · shadcn/ui (Radix) ·
Neon PostgreSQL · Prisma 7 · Auth.js v5 · Zod 4 · pino · Vitest · Playwright.
Exact versions and rationale: [ADR 0002](docs/decisions/0002-toolchain-and-versions.md).

## Getting started

### Prerequisites

- **Node.js 22 LTS** (see `.nvmrc`). Prisma 7 does not run on Node 23.
- npm 10+
- A Neon project with a `development` branch and the Neon CLI (optional for UI work).

### Setup

```bash
git clone <repository-url> && cd garage-management-system
npm install                      # also runs `prisma generate`
cp .env.example .env             # then fill in values
npx auth secret                  # writes AUTH_SECRET (or use: openssl rand -base64 33)
npm run dev                      # http://localhost:3000
```

Without `DATABASE_URL` the app still runs: public pages work, `/api/health` reports the database as
`unconfigured`, and staff sign-in is unavailable.

### Connecting Neon (development branch)

The Neon project is linked with the Neon CLI (`neon.ts` is committed; the local `.neon` context
file is git-ignored). Local work always uses the **`development`** branch, never `production`.

```bash
npm i -g neon@latest             # Neon CLI
neon login                       # browser sign-in (do not paste tokens anywhere)
neon checkout development        # pin the development branch in .neon
neon env pull --branch development   # writes DATABASE_URL, DATABASE_URL_UNPOOLED, NEON_BRANCH… to .env
npm run db:guard                 # confirms the target is not a production branch
npm run db:migrate:deploy        # applies committed migrations (guarded)
npm run staff:create -- --email you@example.test --name "Your Name" --role OWNER
curl localhost:3000/api/health   # → "database": { "status": "ok" }
```

Safety rails: `db:migrate:*` and `staff:create` refuse to run when `NEON_BRANCH` is `production`,
`prod` or `main`, or when `NODE_ENV=production` (override only with `ALLOW_PRODUCTION_DB_WRITES=true`
and owner approval). Migrations never fall back to the pooled URL. Branch strategy and procedure:
[`docs/progress/phase-0.2-neon-integration.md`](docs/progress/phase-0.2-neon-integration.md).

## Environment variables

| Variable                     | Required          | Purpose                                                          |
| ---------------------------- | ----------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`               | for DB features   | Neon **pooled** (`-pooler`) connection string — app runtime      |
| `DATABASE_URL_UNPOOLED`      | for migrations    | Neon **direct** connection string — Prisma CLI (`neon env pull`) |
| `DIRECT_URL`                 | optional          | Legacy name for the direct string; overrides the above if set    |
| `NEON_BRANCH`                | recommended       | Neon branch name; production names block migrations              |
| `NEON_BRANCH_ID`             | informational     | Written by `neon env pull`                                       |
| `AUTH_SECRET`                | yes in production | Auth.js session encryption secret (≥32 chars)                    |
| `AUTH_URL`                   | deployed envs     | Public base URL                                                  |
| `AUTH_TRUST_HOST`            | optional          | `true` only behind a trusted proxy                               |
| `LOG_LEVEL`                  | optional          | `info` by default                                                |
| `ALLOW_PRODUCTION_DB_WRITES` | never by default  | Owner-approved override for the production guard                 |

All variables are validated at startup by `src/server/env-schema.ts`.

## Scripts

| Script                            | Description                                            |
| --------------------------------- | ------------------------------------------------------ |
| `npm run dev`                     | Development server                                     |
| `npm run build` / `npm start`     | Production build / serve                               |
| `npm run typecheck`               | Generate route types and run `tsc --noEmit`            |
| `npm run lint`                    | ESLint (zero warnings)                                 |
| `npm run format` / `format:check` | Prettier                                               |
| `npm test`                        | Vitest unit + integration                              |
| `npm run test:e2e`                | Playwright (requires `npm run build` first)            |
| `E2E_DATABASE=1 npm run test:e2e` | Playwright incl. signed-in tests against `development` |
| `npm run validate`                | Typecheck, lint, format check, tests, build            |
| `npm run db:migrate:dev`          | Create/apply a migration on the **development** branch |
| `npm run db:migrate:deploy`       | Apply committed migrations                             |
| `npm run db:migrate:status`       | Show migration status                                  |
| `npm run db:guard`                | Check the DB target is a non-production branch         |
| `npm run staff:create`            | Create or reset a staff account (dev only)             |

## Project structure

```
src/app         routes: (public) /, /book, /track, /portal · (auth) /login · /dashboard/* · /api
src/modules     business modules (bookings, scheduling, reminders, customers, vehicles, staff, notifications)
src/server      server-only infrastructure (env, db, auth, logger, errors, validation)
src/components  ui (shadcn), layout, states
prisma          schema and migrations
tests           unit, integration, e2e
docs            architecture, decisions (ADRs), progress reports
```

Details: [`docs/architecture/system-overview.md`](docs/architecture/system-overview.md) ·
Security: [`docs/architecture/security.md`](docs/architecture/security.md).

## Development workflow

- `main` — production-ready; changes only via reviewed PR with **owner approval**.
- `develop` — integration branch; feature PRs target it.
- `feature/<phase-or-topic>` — work branches, e.g. `feature/phase-0-foundation`.

Open a PR into `develop`; CI (typecheck, lint, format, tests, build, Playwright) must pass. Database
migrations must be additive unless the owner approves a destructive plan.

## Branding

Branding is neutral until the garage provides its name, logo and colours. Update
`src/config/site.ts` and the colour tokens in `src/app/globals.css`.
