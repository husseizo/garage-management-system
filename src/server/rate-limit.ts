import "server-only";

import { createHmac } from "node:crypto";

import { getDb, isDatabaseConfigured } from "./db/client";
import { env } from "./env";
import { logger } from "./logger";
import {
  consume,
  type RateLimitResult,
  type RateLimitRule,
  type RateLimitStore,
} from "./rate-limit-core";
import { createSqlRateLimitStore } from "./rate-limit-store";

const WINDOW_15_MIN = 15 * 60;

export const RATE_LIMITS = {
  /** Per normalised email: slows password guessing against one account from many IPs. */
  get signInPerEmail(): RateLimitRule {
    return {
      name: "signin:email",
      limit: env().AUTH_RATE_LIMIT_PER_EMAIL,
      windowSeconds: WINDOW_15_MIN,
    };
  },
  /** Per client IP: slows credential stuffing across accounts. */
  get signInPerIp(): RateLimitRule {
    return { name: "signin:ip", limit: env().AUTH_RATE_LIMIT_PER_IP, windowSeconds: WINDOW_15_MIN };
  },
  /** Per staff member: dashboard search and picker lookups. */
  staffSearch: { name: "search:staff", limit: 120, windowSeconds: 60 } as RateLimitRule,
  /** Per staff member: create/update actions on customers and vehicles. */
  staffWrite: { name: "write:staff", limit: 60, windowSeconds: 60 } as RateLimitRule,
};

/** HMAC the subject so buckets never contain raw emails, IPs or ids. */
export function rateLimitKey(subject: string): string {
  const secret = env().AUTH_SECRET ?? "gms-dev-rate-limit-key";
  return createHmac("sha256", secret).update(subject).digest("base64url").slice(0, 43);
}

let dbStore: RateLimitStore | undefined;
function store(): RateLimitStore {
  dbStore ??= createSqlRateLimitStore(getDb());
  return dbStore;
}

function housekeeping() {
  if (Math.random() < 0.01) {
    // Opportunistic housekeeping; a scheduled job takes over in Phase 1F.
    void getDb()
      .$executeRaw`DELETE FROM rate_limit_buckets WHERE expires_at < now() - interval '1 hour'`.catch(
      () => undefined,
    );
  }
}

/**
 * Consume one unit for `subject` under `rule`. Fails open (allowed) only when no database is
 * configured — in that case sign-in and data features are unavailable anyway.
 */
export async function checkRateLimit(
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitResult> {
  if (!isDatabaseConfigured()) return { allowed: true, retryAfterSeconds: 0 };
  const result = await consume(store(), rule, rateLimitKey(subject));
  housekeeping();
  if (!result.allowed)
    logger.warn({ event: "rate_limit.exceeded", rule: rule.name }, "rate limit exceeded");
  return result;
}
