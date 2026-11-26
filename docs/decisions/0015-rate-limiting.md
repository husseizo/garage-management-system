# 0015 — Database-backed rate limiting

- **Status:** Accepted. Implemented in Phase 1B; algorithm revised 2026-11-25 (B-1)
- **Date:** 2026-11-24

## Context

Phase 0 left staff sign-in without rate limiting (R-06), and Phase 1B adds search endpoints. The
app runs as several stateless instances (serverless), so in-memory counters are not shared.
No Redis-class service is provisioned yet.

## Decision

- **Sliding window with reusable slots** in PostgreSQL, on the existing
  `rate_limit_buckets (key, window_start, count, expires_at)` table (no schema change). Each key
  has `limit` slot rows (`window_start` = 1970-01-01 + slot index in ms; `expires_at` = busy
  until). An allowed request claims one free slot (`expires_at <= now`) and marks it busy until
  `now + window`. A request is therefore allowed iff fewer than `limit` allowed requests happened
  in the rolling window `(now − window, now]`. See "Revision 2026-11-25" below.
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

## Revision 2026-11-25 — sliding window (fixes B-1)

**Problem.** The original fixed windows were aligned to the clock (`floor(now / 15 min)`). The
counter reset at every boundary, so up to 2 × limit attempts were possible within seconds (10 just
before 10:15:00 and 10 just after). A CI run that crossed 00:15:00 UTC exposed it as a flaky E2E
test (the 11th attempt was accepted).

**Options considered.**

| Option                                                 | Exact limit per rolling window  | Round trips per request           | Schema change | Verdict                                                                     |
| ------------------------------------------------------ | ------------------------------- | --------------------------------- | ------------- | --------------------------------------------------------------------------- |
| Fixed window (original)                                | No (2 × limit at boundary)      | 1                                 | —             | Rejected (B-1)                                                              |
| Two-window weighted estimate                           | No (approximation)              | 1–2                               | No            | Rejected: still admits more than the limit in some windows                  |
| Sum of previous + current fixed window                 | Yes, but over-blocks (≤ 30 min) | 1                                 | No            | Rejected: stricter than the intended rule                                   |
| Sliding log + advisory-lock transaction                | Yes                             | ~5, connection held while waiting | No            | Rejected after testing: a 30-request burst exhausted the pool at 175 ms RTT |
| **Sliding window, `limit` slots, `SKIP LOCKED` claim** | **Yes**                         | **1 (3 on a key's first use)**    | **No**        | **Chosen**                                                                  |

**Algorithm.** `UPDATE rate_limit_buckets SET expires_at = now + window, count = count + 1 WHERE
key = $k AND window_start = (SELECT window_start … WHERE key = $k AND slot < limit AND expires_at
<= now ORDER BY expires_at LIMIT 1 FOR UPDATE SKIP LOCKED)`. One row updated → allowed. Zero → if
the key has fewer than `limit` slots, ONE new slot (a random missing index) is inserted already busy
(`INSERT … ON CONFLICT DO NOTHING`); one row inserted → allowed. Otherwise, if every slot exists and
is busy → refused, with `Retry-After` = earliest `expires_at` − now. A request that lost an insert
race retries; each lost race means another request created a slot, so the loop is bounded by
`limit`, and it gives up (refuses, fail-safe) after `min(limit, 50) + 2` rounds.

**Why it is correct under concurrency.** A slot can be claimed only by the statement that locked
it; `SKIP LOCKED` makes a concurrent claimer take a different free slot or none, and READ COMMITTED
re-checks `expires_at <= now` on the latest row version before locking. With `limit` slots, at most
`limit` requests can be busy at once in any window. If a claimer's transaction fails, its slot
stays free and other requests may be refused that instant (fails safe).

**Trade-offs.**

- Refused requests are not recorded. The limit counts the attempts that reach password
  verification; an attacker cannot extend a lock-out beyond one window by continuing to try, but a
  user locked out by someone else's attempts still waits up to 15 minutes (unchanged).
- The request time comes from the application server clock. Instances must be NTP-synchronised; skew
  shifts a slot's release by the skew, never the number of slots.
- Rows: one per allowed request still in the window, never more than `limit` per key (10 per email,
  50 per IP, 120/60 per staff member). Slots are created only when used, so new IPs or emails cannot
  amplify storage. Housekeeping deletes idle slots; they are recreated on next use.
- On deployment, rows from the old fixed-window scheme are ignored, so a subject can get at most one
  fresh window. Old rows expire through housekeeping.
- Lowering a limit takes effect immediately (slots ≥ limit are ignored); raising it adds slots.

**Tests.** Unit (`tests/unit/rate-limit-and-audit.test.ts`): the boundary regression (no reset at
10:15:00; release exactly one window later), slot ageing, subject/rule isolation, a randomised
two-hour run checking every rolling window, a 50-request concurrent burst, and limit changes.
Integration (`tests/integration/rate-limit.test.ts`, live non-production branch, pooled URL): 30
concurrent requests from two independent client pools admit exactly 10, for a new key and again for
an existing key, plus the boundary case.
