/**
 * Fixed-window rate limiting, independent of storage so it can be unit tested. The database store
 * (`rate-limit.ts`) makes the limit shared across all server instances.
 */
export interface RateLimitRule {
  /** Logical bucket name, e.g. "signin:email". */
  name: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitStore {
  /** Atomically increment the counter for `key` in the window and return the new count. */
  increment(key: string, windowStart: Date, expiresAt: Date): Promise<number>;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

export function windowStartFor(now: Date, windowSeconds: number): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

export async function consume(
  store: RateLimitStore,
  rule: RateLimitRule,
  subjectKey: string,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const start = windowStartFor(now, rule.windowSeconds);
  const expires = new Date(start.getTime() + rule.windowSeconds * 1000);
  const count = await store.increment(`${rule.name}:${subjectKey}`, start, expires);
  return {
    allowed: count <= rule.limit,
    count,
    retryAfterSeconds: Math.max(1, Math.ceil((expires.getTime() - now.getTime()) / 1000)),
  };
}
