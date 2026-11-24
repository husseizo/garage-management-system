# Security model

## Implemented in Phase 0

| Control                                                                 | Where                                                       |
| ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| Server-side authorization boundaries (proxy → page → data)              | `src/proxy.ts`, `src/server/auth/guards.ts`                 |
| Role checks (`OWNER`/`MANAGER` only for settings)                       | `requireStaff({ roles })`, `config/navigation.ts`           |
| Environment validation, secrets server-only                             | `src/server/env*.ts`, `import "server-only"`                |
| No credentials in client bundles                                        | `server-only` + build output scan                           |
| Safe error responses (no stack / SQL / hostnames)                       | `src/server/errors/*`, error boundaries                     |
| Input validation pattern (Zod)                                          | `src/server/validation.ts`, `modules/*/schemas.ts`          |
| Password hashing (scrypt, constant-time compare, enumeration-resistant) | `src/modules/staff/password.ts`, `server/auth/authorize.ts` |
| Open-redirect protection on `callbackUrl`                               | `safeCallbackPath`                                          |
| Log redaction of credentials and personal data                          | `src/server/logger.ts`                                      |
| Security headers, `X-Powered-By` removed                                | `next.config.ts`                                            |
| Customer data withheld until verified access exists                     | `/portal` renders no data                                   |

## Future requirements (must be addressed before the related feature ships)

### OTP verification

- 6-digit codes, CSPRNG, stored **hashed** with expiry (≤10 min) and single use.
- Max 5 attempts per code; resend cooldown (60 s) and daily cap per destination.
- Bind the code to purpose (portal login, booking tracking) and destination.
- Generic responses that do not reveal whether a phone/email is on file.

### Guest booking abuse prevention

- Rate limits per IP and per destination; bot challenge (e.g. Turnstile) on submit.
- Honeypot field and minimum time-to-submit; server-side validation of every field.
- Bookings start as `REQUESTED` and never consume capacity until staff confirm (or OTP verified).
- Cap open requests per phone/email/registration.

### Rate limiting

- Shared store (e.g. Upstash Redis / Postgres) so limits hold across serverless instances.
- Apply to: staff sign-in (per account + per IP, progressive lockout), OTP send/verify, booking
  submit, tracking lookups, all public POST endpoints.
- Return `429` with `Retry-After`; log events without personal data.

### Customer data isolation

- Every customer-facing query filters by the authenticated `customerId` inside the module service,
  never trusting IDs from the client.
- Consider PostgreSQL Row-Level Security for customer-scoped tables as defence in depth.
- Tracking links use unguessable references plus OTP; no sequential IDs in URLs.

### Audit logs

- Append-only `audit_log` (actor, action, entity, entity id, timestamp, request id, diff summary
  without sensitive values).
- Record staff sign-in/out, role changes, customer record views/edits, booking state changes,
  notification sends, settings changes. Retention policy agreed with the owner.

### Notification consent

- Store consent per customer × channel × purpose (service reminders vs marketing) with timestamp,
  source and wording version.
- Transactional messages (booking confirmations) separated from reminders/marketing.
- Every message includes an opt-out; opt-outs take effect before the next send; the dispatcher
  checks consent at send time.

### Other follow-ups

- Nonce-based Content-Security-Policy.
- Session revocation for deactivated staff (session version / database sessions).
- Dependency update automation and `npm audit` gating in CI.
- Data retention and deletion process (GDPR-style subject requests).
