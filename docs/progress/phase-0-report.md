# Phase 0 report — Project foundation

- **Date:** 2026-11-23
- **Branch:** `feature/phase-0-foundation` → PR into `develop`
- **Status:** Foundation complete. Criterion 9 (Neon connectivity) was **closed in Phase 0.2** on
  2026-11-24 against the Neon `development` branch — see
  [`phase-0.2-neon-integration.md`](phase-0.2-neon-integration.md).

## Acceptance criteria

| #   | Criterion                                      | Result         | Evidence                                                                                                                                        |
| --- | ---------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | App starts                                     | ✅             | `next start` served all routes (manual browser check + Playwright web server)                                                                   |
| 2   | TypeScript validation                          | ✅             | `npm run typecheck`: no errors (strict mode)                                                                                                    |
| 3   | Linting                                        | ✅             | `npm run lint`: 0 errors, 0 warnings; Prettier check clean                                                                                      |
| 4   | Production build                               | ✅             | `npm run build`: 17 routes plus the proxy compiled                                                                                              |
| 5   | Foundational tests                             | ✅             | Vitest unit 38/38, integration 11/11 (1 skipped: live Neon)                                                                                     |
| 6   | Routes render                                  | ✅             | Playwright: `/`, `/book`, `/track`, `/portal`, `/login`, 404 on desktop and mobile                                                              |
| 7   | Protected routes reject unauthenticated access | ✅             | Playwright: all 9 `/dashboard*` routes return a 307 to `/login?callbackUrl=…`; a forged session cookie is rejected                              |
| 8   | Prisma configured                              | ✅             | Prisma 7.10.1, Neon adapter, client generated, initial migration committed                                                                      |
| 9   | Neon dev connectivity                          | ✅ (Phase 0.2) | Originally not verified (no credentials). Phase 0.2: live integration tests 3/3 and DB-backed Playwright 48/48 against the `development` branch |
| 10  | GitHub repo and workflow                       | ✅ (partial)   | Private repo, `main`/`develop`/feature branches, PR open. **Branch protection is not available** on a free-plan private repo                    |
| 11  | CI committed                                   | ✅             | `.github/workflows/ci.yml` (first run happens on this PR)                                                                                       |
| 12  | Architecture docs                              | ✅             | `docs/architecture/*`, 7 ADRs                                                                                                                   |

Validation was run locally on Node 22.23.5. Playwright ran on Chromium (Desktop Chrome and Pixel 7
profiles) and passed 42/42.

## What was built

- Next.js 16.4.6 App Router, TypeScript strict, Tailwind 4, shadcn/ui (Radix), ESLint 9 flat
  config + Prettier, module-boundary lint rule.
- Server foundation: Zod-validated env (`server-only`), pino logger with redaction, `AppError`
  taxonomy, a safe public error mapper, a route error wrapper with request IDs, and a `parseInput`
  validation helper.
- Auth.js v5 staff authentication: credentials provider, scrypt hashing, JWT session with role, and
  layered authorization (proxy, then `requireStaff` on pages, then `assertStaff` on data).
  Open-redirect-safe `callbackUrl`. `npm run staff:create` script for dev accounts.
- Prisma 7 + Neon adapter, lazy client, `checkDatabase()`, `GET /api/health`, and a `staff_users`
  migration generated offline.
- Responsive public site shell, staff login, and a dashboard shell with a role-aware sidebar, mobile
  sheet nav and user menu. Loading, empty, error and not-found states. Placeholder pages show
  planned capabilities only, never fake data.
- Security headers, `X-Powered-By` removed, and a client-bundle scan showing no secrets or server code.
- CI: typecheck, lint, format, Vitest, build, Playwright.

## Issues found and fixed during validation

- The email schema validated the address before trimming it, so `" a@b.test "` was rejected. Fixed
  with `string().trim().toLowerCase().pipe(z.email())`. A unit test caught it.
- The login page had no `<h1>`. Fixed (an E2E heading assertion caught it).
- The production `AUTH_SECRET` check blocked `next build`. It is now skipped only during the build
  phase and still enforced at runtime.

## Outstanding

**Resolved in Phase 0.2**

- Neon `development` branch connected, `staff_users` migration applied there, test staff account
  created, and signed-in dashboard flows (sign-in, protected sections, sign-out) verified by
  Playwright. Details in `phase-0.2-neon-integration.md`.

**Not verified**

- CI has not run on GitHub yet. Its first run is on the Phase 0 PR.
- Optional: the repo secret `NEON_DEV_DATABASE_URL` (owner action) would let CI run the live check.

**Known risks**

- Auth.js v5 is a beta release (ADR 0002/0004).
- `npm audit`: 3 high (ReDoS in `effect`, pulled in by the Prisma CLI config loader). It is not
  reachable from runtime input. Track the Prisma update.
- The local machine has Node 23.7, which Prisma 7 rejects. Install Node 22 LTS.
- JWT sessions cannot be revoked before expiry (8 hours).
- No rate limiting on staff sign-in yet.

**Blockers for Phase 1**

- Branch protection on `main` needs GitHub Pro (or the team plan), or the owner must agree to
  enforce "PR-only into main" by convention.
- Garage name, logo and colours (optional; neutral branding is in place).

## Recommendation for Phase 1

The Neon precondition was met in Phase 0.2. Suggested order:

1. Core data model: customers, vehicles, service types, bays, technicians and shifts, with
   additive migrations and audit log.
2. Guest booking: public form, Zod validation, abuse controls (rate limit, bot check), booking
   reference, and a staff review queue.
3. Capacity-based scheduling core as pure, heavily tested functions, plus calendar views.
4. Notification outbox and consent model, then automated service reminders.
5. Customer OTP verification for `/track` and `/portal`.
