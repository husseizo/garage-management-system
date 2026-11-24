# 0004 — Staff authentication with Auth.js

- **Status:** Accepted
- **Date:** 2026-11-23

## Context

Garage staff need secure sign-in to the dashboard. Customers have different needs (occasional,
low-friction, phone/email based) and must not share the staff identity system.

## Decision

- **Auth.js v5** (`next-auth@5 beta`) for **staff only**, configured in `src/server/auth/auth.ts`.
- **Credentials provider** against `staff_users`, passwords hashed with Node's built-in **scrypt**
  (N=2^15, r=8, p=1, 16-byte salt, constant-time comparison). Unknown accounts still run a dummy
  verification to avoid user enumeration by timing.
- **JWT session strategy** (encrypted, HttpOnly, SameSite=Lax cookie; 8-hour max age). The `role`
  is embedded in the token and re-validated on every read (`isStaffRole`).
- Roles: `OWNER`, `MANAGER`, `SERVICE_ADVISOR`, `TECHNICIAN`.
- Sign-in errors are generic ("Incorrect email or password"); `callbackUrl` is restricted to
  same-origin relative paths.
- First accounts are created with `npm run staff:create` (development database only).

**Customers** will verify with one-time codes (OTP) in a later phase, issuing a separate,
narrowly-scoped customer session. See `docs/architecture/security.md`.

## Consequences

- JWT sessions cannot be revoked server-side before expiry. When account deactivation must take
  effect immediately, add a `sessionVersion` check or switch to database sessions.
- Login rate limiting and lockout are not yet implemented (Phase 1 requirement).
- SSO / OAuth providers can be added later without changing guards.
