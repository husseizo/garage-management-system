# 0006 — Validated configuration and structured logging

- **Status:** Accepted
- **Date:** 2026-11-23

## Decision

**Configuration** — `src/server/env-schema.ts` defines a Zod schema for every server variable;
`src/server/env.ts` exposes `env()` and imports `server-only`, so importing it from client code fails
the build. Validation errors list variable names and rules, never values. Optional features (the
database) degrade gracefully; required values (`AUTH_SECRET` in production) fail fast at runtime.
No `NEXT_PUBLIC_` variables exist yet; any future one must be reviewed as public.

**Logging** — `pino` JSON logs to stdout (`src/server/logger.ts`) with path-based redaction of
passwords, hashes, tokens, cookies, authorization headers, emails, phone numbers and connection
strings. Log events use stable `event` names (e.g. `auth.signin.rejected`) and IDs, not personal data.

**Errors** — `AppError` carries a code, HTTP status and a public message. `toPublicError` maps
anything else to a generic 500. Route handlers use `withErrorHandling`, which logs with a request ID
and returns that ID to the client. React error boundaries show only the digest.

## Consequences

- New sensitive fields must be added to `REDACT_PATHS`; a unit test guards the current list.
- Log shipping (e.g. to the hosting platform's log drain) is a deployment concern.
