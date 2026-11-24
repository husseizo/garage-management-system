# 0015 — Database-backed rate limiting

- **Status:** Accepted. Implemented in Phase 1B
- **Date:** 2026-11-24

## Context

Phase 0 left staff sign-in without rate limiting (R-06), and Phase 1B adds search endpoints. The
app runs as several stateless instances (serverless), so in-memory counters are not shared.
No Redis-class service is provisioned yet.

## Decision

- Fixed-window counters in PostgreSQL: `rate_limit_buckets (key, window_start, count, expires_at)`,
  incremented atomically with `INSERT … ON CONFLICT DO UPDATE … RETURNING count`.
- **Keys are HMAC-SHA-256** (keyed with `AUTH_SECRET`) of the subject (email, IP, staff id), so no
  raw email or IP address is stored.
- Limits: sign-in 10 per email and 50 per IP per 15 minutes (configurable via
  `AUTH_RATE_LIMIT_PER_EMAIL` and `AUTH_RATE_LIMIT_PER_IP`); staff search 120/min; staff writes 60/min.
- The check runs **before** password verification, and the message is generic and identical for
  every account.
- Expired rows are deleted opportunistically; a scheduled job takes over in Phase 1F.

## Consequences

- One extra small write per sign-in or search (acceptable at garage scale).
- If request volume grows, swap the store for Upstash Redis behind the same `RateLimitStore`
  interface (`src/server/rate-limit-core.ts`).
- The per-IP limit depends on the platform's `X-Forwarded-For`. Without it, all clients share one
  bucket, so keep `AUTH_RATE_LIMIT_PER_IP` generous.
