/**
 * Sliding-window rate limiting with reusable slots, independent of storage (ADR 0015).
 *
 * Each key owns `limit` slots. An allowed request occupies one free slot until
 * `now + windowSeconds`; a request is allowed only if some slot is free (busy-until <= now). So a
 * request is allowed iff fewer than `limit` allowed requests happened in the rolling window
 * (now − window, now] — the limit holds for EVERY rolling window and nothing resets at a clock
 * boundary. Refused requests occupy nothing, so they cannot extend a lock-out indefinitely and a key
 * never needs more than `limit` rows.
 *
 * Stores must claim a slot atomically: the PostgreSQL store does it in ONE statement with
 * `FOR UPDATE SKIP LOCKED`, so concurrent requests on any number of instances never share a slot
 * and no connection is held waiting for a lock.
 */
export interface RateLimitRule {
  /** Logical bucket name, e.g. "signin:email". */
  name: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitStore {
  /**
   * Atomically claim one of slots `0 … limit-1` of `key` that is free at `now`, marking it busy
   * until `busyUntil`. Returns whether a slot was claimed and, if not, when the next one frees.
   */
  claim(
    key: string,
    limit: number,
    now: Date,
    busyUntil: Date,
  ): Promise<{ claimed: boolean; nextFreeAt: Date | null }>;
}

export interface RateLimitResult {
  allowed: boolean;
  /** When refused: seconds until a slot frees. 0 when allowed. */
  retryAfterSeconds: number;
}

export async function consume(
  store: RateLimitStore,
  rule: RateLimitRule,
  subjectKey: string,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const busyUntil = new Date(now.getTime() + rule.windowSeconds * 1000);
  const { claimed, nextFreeAt } = await store.claim(
    `${rule.name}:${subjectKey}`,
    rule.limit,
    now,
    busyUntil,
  );
  if (claimed) return { allowed: true, retryAfterSeconds: 0 };
  const waitMs = (nextFreeAt ?? busyUntil).getTime() - now.getTime();
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
}
