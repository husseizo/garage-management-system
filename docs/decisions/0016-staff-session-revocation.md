# 0016 — Server-side revocation of staff sessions (S-1)

- **Status:** **Step 1 accepted and implemented** (owner approval 2026-11-26, Phase 1C-0 PR 3). Step 2
  (`auth_sessions`, server-side sign-out) remains Proposed for Phase 1C.
- **Date:** 2026-11-25
- **Relates to:** ADR 0004 (staff authentication), ADR 0005 (authorization boundaries), planned
  `auth_sessions` / `auth_events` tables (data dictionary, Phase 1C)

## Context — how sessions work today

- Auth.js v5 (beta) with the Credentials provider and `session.strategy = "jwt"`
  (`src/server/auth/auth.ts`). The session is an encrypted JWT in an HttpOnly cookie, valid
  8 hours. The JWT carries `sub` (staff id) and `role`.
- `getStaffSession()` (`src/server/auth/guards.ts`) decodes the cookie and trusts `role` from the
  token. Every page, server action and service goes through `requireStaff` / `requirePermission` /
  `assertStaff` / `assertPermission`, so this is a single choke point.
- `signOutAction` clears the cookie. Nothing is recorded server-side.

**Consequences (S-1):**

1. A deactivated staff member (`active = false`) keeps working until the token expires (≤ 8 h).
2. A role change (e.g. MANAGER → TECHNICIAN) takes effect only at the next sign-in.
3. A cookie copied before sign-out stays valid until expiry. Sign-out cannot be enforced
   server-side.
4. There is no "sign out everywhere" or forced sign-out after a password reset.

Auth.js's own database-session strategy is not available with the Credentials provider, so
switching `strategy` to `"database"` is not an option.

## Decision (proposed)

Keep the Auth.js JWT cookie as a transport, but make it carry only an opaque **session id**. The
authoritative state lives in a new `auth_sessions` table and is checked on every authorised
request.

### Data (one additive migration)

`auth_sessions`, the staff part of the table already planned for Phase 1C:

| Column                        | Notes                                                                 |
| ----------------------------- | --------------------------------------------------------------------- |
| `id uuid` PK (uuidv7)         | Also the value carried in the JWT (`sid`)                             |
| `subject_type`                | `STAFF` now; `PORTAL_ACCOUNT` added in Phase 1C (exclusive-arc CHECK) |
| `staff_user_id → staff_users` | `ON DELETE CASCADE`; index `(staff_user_id) WHERE revoked_at IS NULL` |
| `created_at`, `expires_at`    | `expires_at = created_at + 8 h` (absolute limit, as today)            |
| `last_seen_at`                | Updated at most every 5 minutes (one write per 5 min per user)        |
| `revoked_at`, `revoke_reason` | `SIGN_OUT`, `DEACTIVATED`, `ROLE_CHANGED`, `PASSWORD_RESET`, `ADMIN`  |
| `user_agent_hash`, `ip_hash`  | HMAC, never raw values (same approach as rate limiting)               |

`auth_events` (append-only) records sign-in success and failure, sign-out and revocation. This
also closes S-3.

### Flow

1. **Sign-in:** `authorizeStaff` succeeds → insert an `auth_sessions` row → the `jwt` callback
   stores `sid` only (no `role`).
2. **Every request:** `getStaffSession()` decodes the cookie and loads the session and its staff
   member in one indexed query: `auth_sessions JOIN staff_users WHERE id = sid AND revoked_at IS NULL
AND expires_at > now() AND staff_users.active`. Role, name and email come from the database. No row
   means unauthenticated (redirect to sign-in or 401). The result is memoised per request with React
   `cache()`.
3. **Sign-out:** set `revoked_at` (reason `SIGN_OUT`), then clear the cookie. A copied cookie is now
   useless.
4. **Deactivation or role change:** the staff-management action revokes all of that person's open
   sessions in the same transaction, with an audit row. Even without that step, (2) re-reads
   `active` and `role` on every request, so the change applies on the next request.
5. **Proxy:** `proxy.ts` stays an optimistic, cookie-only redirect gate. It runs on every
   navigation and should not query the database. The authoritative check remains in pages, actions
   and services.

### Permission checks

Unchanged and server-side: `requirePermission` / `assertPermission` call `can(role, permission)`,
with `role` now read from the database instead of the token.

## Alternatives considered

| Option                                                                     | Verdict                                                                                                                               |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A. Re-read `staff_users.active` and `role` on every request (no new table) | Fixes deactivation and role change with **no migration**, but not server-side sign-out. A good interim step (see Rollout).            |
| B. `session_version int` on `staff_users`, carried in the JWT              | Small migration; sign-out would sign the person out on every device; no per-session list or audit.                                    |
| C. `auth_sessions` table + `sid` in the JWT (proposed)                     | Per-session revocation, sign-out everywhere, audit, and matches the Phase 1C design. One migration and one indexed query per request. |
| D. Short-lived JWT (5 min) + refresh token                                 | More moving parts; still needs a server-side store for the refresh tokens.                                                            |

## Migration and rollout implications

- **Schema:** one additive migration (`auth_sessions`, `auth_events`, enum `AuthSubjectType`,
  indexes). No change to existing tables. It must be applied to `development` and `ci-testing` (CI
  applies it automatically) and, with separate approval, to `production`.
- **Existing sessions:** tokens without `sid` are rejected after deployment, so every staff member
  signs in once. Today that is the owner and the two test accounts.
- **Performance:** one primary-key lookup (plus a join) per authorised request, a few milliseconds
  when the app runs near the database, and an occasional `last_seen_at` write. Acceptable at garage
  scale.
- **Database outage:** sign-in already needs the database; with this change existing sessions do
  too (fail closed), which is consistent with how data access already behaves.
- **Housekeeping:** expired or revoked sessions are deleted after 30 days; `auth_events` are kept
  per the audit-retention rule.

## Proposed rollout (each step needs owner approval)

1. **Step 1 — no migration (Option A):** `getStaffSession()` re-reads `active`, `role`, `name` and
   `email` from `staff_users` per request (memoised). This closes S-1 items 1 and 2 immediately.
   Tests: a unit test that the token's role is ignored, and an E2E test that a deactivated staff
   member is redirected on the next request.
2. **Step 2 — with the Phase 1C migration:** add `auth_sessions` / `auth_events`, move to `sid`,
   and revoke sessions on sign-out, deactivation and role change. Tests: integration (revoked,
   expired and inactive rows are rejected), and E2E (a cookie captured before sign-out is rejected
   afterwards).

## Consequences

- Sign-out, deactivation and role changes take effect on the next request, everywhere.
- Adds a per-request database dependency for authenticated pages, which is already true for every
  data screen.
- The Auth.js upgrade path is unaffected: only the `jwt` / `session` callbacks and
  `getStaffSession()` change.

## Step 1 — as implemented (Phase 1C-0 PR 3)

- `resolveStaffSession()` in `src/server/auth/guards.ts` is memoised per request with React
  `cache()`. It reads `staff_users` by the token's `sub` (one primary-key query) and returns
  `anonymous`, `ended` or `active`. Role, name and email come from the database; the token's
  `role` is ignored. A database error throws `SERVICE_UNAVAILABLE` (fail closed); with no database
  configured, a cookie counts as ended.
- `getStaffSession`, `assertStaff` and `assertPermission` deny an ended session (401).
  `requireStaff` and `requirePermission` redirect it to `/session-ended`.
- `/session-ended` is a route handler. It clears the cookie with `signOut` and shows
  `/login?ended=1` ("Your session has ended. Please sign in again."). A redirect to `/login` would
  loop, because the proxy still sees the cookie. A still-valid session is sent back to the
  dashboard instead of being signed out, so a link to that URL cannot log anyone out.
- The proxy and the Auth.js callbacks are unchanged. Nobody has to sign in again because of this
  change.
- **Still open (Step 2):** sign-out is cookie-only. A cookie copied before sign-out stays usable
  until it expires, for as long as the staff member stays active.
