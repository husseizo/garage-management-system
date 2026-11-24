# System overview

Garage Management System (GMS) — a web application for a single automotive workshop offering
servicing, mechanical repair, diagnostics, bodywork and painting.

## 1. Application architecture

A **modular monolith** (ADR 0001): one Next.js 16 App Router application, one Neon PostgreSQL
database, deployed as a single unit.

```
Browser ──HTTPS──▶ Next.js (Node runtime)
                    ├─ proxy.ts ............ optimistic auth gate for /dashboard
                    ├─ app/ ................ routes, layouts, server components, route handlers
                    ├─ modules/<domain>/ ... business logic (bookings, scheduling, reminders, …)
                    └─ server/ ............. env, db, auth, logging, errors
                                 │
                                 ▼ Prisma 7 + Neon driver adapter (pooled)
                           Neon PostgreSQL (dev / prod branches)
```

### Directory layout

```
src/
  app/
    (public)/          / · /book · /track · /portal — public site + customer entry
    (auth)/login/      staff sign-in (server action)
    dashboard/         garage dashboard (all routes guarded)
    api/auth/          Auth.js handlers
    api/health/        liveness + DB connectivity
  components/
    ui/                shadcn/ui primitives (generated, Radix based)
    layout/            site header/footer, dashboard nav, user menu
    states/            empty / error / loading / module-placeholder states
  config/              site branding placeholders, navigation
  modules/             one folder per bounded context, public API via index.ts
  server/              server-only infrastructure
  generated/prisma/    Prisma client (generated, git-ignored)
  proxy.ts             request-time auth gate
prisma/                schema + migrations
scripts/               operational scripts (staff account creation)
tests/                 unit · integration · e2e
docs/                  architecture, ADRs, progress reports
```

## 2. Frontend / backend boundaries

- **Server Components by default.** Pages fetch through module services on the server; only
  interactive leaves (`"use client"`) run in the browser — navigation, menus, the sign-in form.
- **Mutations** go through Server Actions or Route Handlers. Each validates input with Zod
  (`parseInput`) and authorises with `assertStaff()` before calling a module service.
- **Module rule:** UI components never contain business rules and never import `@/server/db` or the
  generated Prisma client (enforced by ESLint `no-restricted-imports`).
- **Secrets** live only in `src/server/**`, guarded by `import "server-only"`. A build-output scan
  confirms no secrets or server code in `.next/static`.

## 3. Database integration

See ADR 0003 and `docs/progress/phase-0.2-neon-integration.md`. Neon project `quiet-violet-31193699`
(region aws-eu-central-1), linked via the Neon CLI and `neon.ts`. Branches: `production` (default,
untouched by local tooling) and `development` (local work, migrations, test accounts).

| Concern           | Connection                             | Where                     |
| ----------------- | -------------------------------------- | ------------------------- |
| App runtime       | `DATABASE_URL` — pooled (PgBouncer)    | `src/server/db/client.ts` |
| Prisma migrations | `DIRECT_URL` → `DATABASE_URL_UNPOOLED` | `prisma.config.ts`        |
| Safety rules      | `NEON_BRANCH`, `NODE_ENV`              | `src/server/db/target.ts` |

One runtime client: `getDb()` builds a single `PrismaClient` over `@prisma/adapter-neon`, lazily,
cached on `globalThis` across hot reloads. `resolveMigrationUrl()` never falls back to the pooled
URL and rejects `-pooler` hosts. `scripts/db-guard.ts` runs before every `db:migrate:*` script, and
`staff:create` applies the same check, refusing production branch names unless the owner sets
`ALLOW_PRODUCTION_DB_WRITES=true`. `checkDatabase()` runs `SELECT 1` with a 5 s timeout and returns
only `ok | unconfigured | error`.

Current schema: `staff_users` (Phase 0), `garage_profile` and `audit_logs` (Phase 1A). The complete
domain model (all planned modules), ERD, data dictionary, business rules, scheduling concurrency
design and migration roadmap are in [`database/`](database/domain-model.md); see ADRs 0008–0012.

## 4. Authentication strategy

See ADRs 0004 and 0005.

| Audience          | Mechanism                                                                              | Status      |
| ----------------- | -------------------------------------------------------------------------------------- | ----------- |
| Staff             | Auth.js v5 credentials, scrypt hashes, JWT session cookie, role in token               | Implemented |
| Guest booker      | No account; booking reference + OTP for tracking                                       | Planned     |
| Customer (portal) | OTP to verified phone/email → short-lived customer session scoped to their own records | Planned     |

Authorization is layered: proxy → page `requireStaff()` → data `assertStaff()`. Each layer alone
denies access.

## 5. Module separation

| Module          | Responsibility                                           | Depends on                      |
| --------------- | -------------------------------------------------------- | ------------------------------- |
| `staff`         | Staff identity, roles, credential verification           | —                               |
| `customers`     | Customer records, verified identity, contact preferences | —                               |
| `vehicles`      | Vehicles and service history                             | customers                       |
| `bookings`      | Booking requests and lifecycle, tracking references      | customers, vehicles, scheduling |
| `scheduling`    | Capacity model and slot allocation                       | (bays, technicians data)        |
| `reminders`     | Service-due rules and reminder scheduling                | vehicles, notifications         |
| `notifications` | Outbox, channel providers, delivery status               | customers (consent)             |

Modules call each other only via `index.ts` exports. Cross-module workflows (e.g. "booking
confirmed → send confirmation") use domain events written in the same transaction (outbox), avoiding
direct coupling.

## 6. Notification architecture (planned)

1. A module records an intent in `notification_outbox` **in the same transaction** as the business
   change (transactional outbox).
2. A scheduled worker (cron-triggered route handler secured with a shared secret, or platform
   cron) claims pending rows (`FOR UPDATE SKIP LOCKED`), checks **consent** and quiet hours, renders
   the template and calls the provider adapter (email / SMS).
3. Delivery results update the row (`sent | failed | suppressed`) with retry and exponential backoff;
   provider webhooks update final status.
4. Providers are behind a `NotificationChannel` interface so they can be swapped, and are faked in tests.

## 7. Scheduling architecture (planned)

Capacity-based scheduling allocates work to **bay × technician × time**:

- **Inputs:** opening hours, bay types and downtime, technician shifts and skills, service type
  duration and required bay/skill, existing appointments.
- **Slot search:** for a requested service, compute free intervals per compatible bay, intersect with
  qualified technicians' availability, and return candidate start times at a configurable
  granularity (e.g. 15 min), honouring buffers.
- **Allocation:** confirm within a serializable transaction (or PostgreSQL exclusion constraint on
  `tstzrange` per bay/technician) so two bookings can never take the same capacity.
- **Pure core:** the slot algorithm lives in `modules/scheduling` as pure functions over plain data
  — heavily unit-tested, no I/O.

## 8. Deployment considerations

- **Target:** a Node-capable Next.js host (e.g. Vercel) in the same region as the Neon project.
- **Environments:** local → preview (Neon dev branch or per-PR branch) → production (Neon production
  branch). Production deploys and migrations need owner approval.
- **Secrets:** set in the platform's encrypted environment settings; `.env*` files are git-ignored.
- **Migrations:** `npm run db:migrate:deploy` as a release step before traffic shifts; only additive
  migrations auto-apply.
- **Observability:** JSON logs to the platform log drain; `/api/health` for uptime checks.
- **Security headers** are set in `next.config.ts`; a nonce-based CSP is a follow-up.
- **Background jobs:** platform cron hitting authenticated route handlers (reminders, notifications).
