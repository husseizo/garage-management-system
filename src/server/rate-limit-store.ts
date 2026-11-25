import type { RateLimitStore } from "./rate-limit-core";

/**
 * PostgreSQL store for the sliding-window slot limiter (ADR 0015), on the existing
 * `rate_limit_buckets (key, window_start, count, expires_at)` table — no schema change:
 *
 * - slot `i` of a key is the row `(key, window_start = 1970-01-01T00:00:00Z + i ms)`, for
 *   `0 <= i < limit`; `expires_at` is "busy until", `count` is how often the slot has been used;
 * - re-using a slot is ONE `UPDATE` whose target is chosen by `SELECT … FOR UPDATE SKIP LOCKED`, so
 *   concurrent claims (any instance, through PgBouncer transaction pooling) take different slots
 *   or none — never the same one — and nothing waits on a lock while holding a connection;
 * - when no slot is free and the key has fewer than `limit` slots, ONE new slot is inserted already
 *   busy (a random missing index); the primary key makes concurrent inserts of the same slot
 *   conflict, and the loser retries.
 *   A key therefore never holds more rows than requests actually allowed (no amplification when
 *   many new IPs or emails appear);
 * - rows from the former fixed-window scheme (real timestamps in `window_start`) are ignored and
 *   expire through housekeeping.
 *
 * Kept free of `server-only` / env access so integration tests can run it against a real branch.
 */
export interface RawSqlClient {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/** Slot timestamps live on 1970-01-01, far from any real request time. */
const SLOT_EPOCH = new Date(0);
const slotBound = (limit: number) => new Date(SLOT_EPOCH.getTime() + limit);

export function createSqlRateLimitStore(db: RawSqlClient): RateLimitStore {
  const tryClaim = async (key: string, limit: number, now: Date, busyUntil: Date) => {
    const n = await db.$executeRaw`
      UPDATE rate_limit_buckets
      SET expires_at = ${busyUntil}, count = count + 1
      WHERE key = ${key}
        AND window_start = (
          SELECT window_start FROM rate_limit_buckets
          WHERE key = ${key} AND window_start >= ${SLOT_EPOCH} AND window_start < ${slotBound(limit)}
            AND expires_at <= ${now}
          ORDER BY expires_at
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )`;
    return n === 1;
  };

  const addClaimedSlot = async (key: string, limit: number, busyUntil: Date) => {
    const n = await db.$executeRaw`
      INSERT INTO rate_limit_buckets (key, window_start, count, expires_at)
      SELECT ${key}, ${SLOT_EPOCH}::timestamptz + make_interval(secs => i / 1000.0), 1, ${busyUntil}
      FROM generate_series(0, ${limit}::int - 1) AS i
      WHERE NOT EXISTS (
        SELECT 1 FROM rate_limit_buckets b
        WHERE b.key = ${key}
          AND b.window_start = ${SLOT_EPOCH}::timestamptz + make_interval(secs => i / 1000.0)
      )
      ORDER BY random()
      LIMIT 1
      ON CONFLICT (key, window_start) DO NOTHING`;
    return n === 1;
  };

  return {
    async claim(key, limit, now, busyUntil) {
      // Each round either claims, proves every slot busy, or lost an insert race to a request that
      // created a slot — so at most `limit` rounds can be lost. Random slot choice keeps races rare.
      const rounds = Math.min(limit, 50) + 2;
      for (let round = 0; round < rounds; round++) {
        if (await tryClaim(key, limit, now, busyUntil)) return { claimed: true, nextFreeAt: null };
        if (await addClaimedSlot(key, limit, busyUntil)) return { claimed: true, nextFreeAt: null };
        const [state] = await db.$queryRaw<{ slots: number; next_free: Date | null }[]>`
          SELECT count(*)::int AS slots, min(expires_at) AS next_free FROM rate_limit_buckets
          WHERE key = ${key} AND window_start >= ${SLOT_EPOCH} AND window_start < ${slotBound(limit)}`;
        if ((state?.slots ?? 0) >= limit && (state?.next_free ?? busyUntil) > now) {
          return { claimed: false, nextFreeAt: state?.next_free ?? null };
        }
      }
      // Persistent contention: refuse (fail safe) rather than risk exceeding the limit.
      return { claimed: false, nextFreeAt: null };
    },
  };
}
