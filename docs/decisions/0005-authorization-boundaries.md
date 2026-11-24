# 0005 — Layered server-side authorization

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

Garage routes expose personal data (customers, vehicles, service history). Route-level redirects in
an edge/proxy layer are useful but are not, on their own, a security boundary: they can be bypassed
by misconfigured matchers, and server actions / route handlers can be invoked directly.

## Decision

Apply authorization at three layers, each independently sufficient to deny access:

1. **Proxy (optimistic)** — `src/proxy.ts` redirects unauthenticated requests for `/dashboard/*` to
   `/login` before rendering. Cheap, improves UX, not trusted alone.
2. **Render boundary** — every dashboard page calls `requireStaff()` (from
   `src/server/auth/guards.ts`) which verifies the session server-side and redirects if absent or if
   the role is not permitted.
3. **Data boundary** — module services and server actions that read or mutate sensitive data must
   call `requireStaff({ roles })` (or the future customer equivalent) themselves. Data access never
   assumes a caller already checked.

The customer portal (`/portal`) shows no vehicle or service data until a verified customer identity
exists (OTP verification is planned for a later phase — see `docs/architecture/security.md`).

## Consequences

- Slight duplication of checks; acceptable for defence in depth.
- Tests cover the proxy decision function and guard behaviour directly (unit), and the redirect end to
  end (Playwright).
