import "dotenv/config";

import { PrismaNeon } from "@prisma/adapter-neon";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { consume } from "@/server/rate-limit-core";
import { createSqlRateLimitStore } from "@/server/rate-limit-store";

/**
 * Sliding-window rate limiter against a live, non-production Neon branch, through the POOLED URL
 * the application uses (PgBouncer transaction mode). Uses its own `itest:<run>:…` keys and deletes
 * exactly those rows afterwards; rate-limit rows are ephemeral counters with no personal data.
 */
const url = process.env.DATABASE_URL;
const isProductionBranch = /^(production|prod|main)$/i.test(process.env.NEON_BRANCH ?? "");
const enabled = Boolean(url) && !isProductionBranch;
const run = `itest:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

describe.skipIf(!enabled)("rate limiter on PostgreSQL (sliding window, advisory lock)", () => {
  // Two clients = two independent connection pools, like two serverless instances.
  let a: PrismaClient;
  let b: PrismaClient;

  beforeAll(() => {
    a = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url! }) });
    b = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url! }) });
  });
  afterAll(async () => {
    if (!a) return;
    await a.$executeRaw`DELETE FROM rate_limit_buckets WHERE key LIKE ${`${run}%`}`;
    await a.$disconnect();
    await b?.$disconnect();
  });

  const rule = { name: run, limit: 10, windowSeconds: 900 };
  const slotState = async (key: string, now: Date) =>
    (
      await a.$queryRaw<{ slots: number; busy: number; uses: number }[]>`
        SELECT count(*)::int AS slots, count(*) FILTER (WHERE expires_at > ${now})::int AS busy,
               COALESCE(SUM(count), 0)::int AS uses
        FROM rate_limit_buckets WHERE key = ${key}`
    )[0]!;

  it("30 concurrent attempts from two instances admit exactly the limit (cold and warm key)", async () => {
    const sa = createSqlRateLimitStore(a);
    const sb = createSqlRateLimitStore(b);
    const burst = (now: Date) =>
      Promise.all(
        Array.from({ length: 30 }, (_, i) => consume(i % 2 ? sa : sb, rule, "burst", now)),
      );

    // Cold: no slots exist yet, so all 30 race to create them.
    const t0 = new Date();
    const first = await burst(t0);
    expect(first.filter((r) => r.allowed)).toHaveLength(10);
    expect(first.filter((r) => !r.allowed).every((r) => r.retryAfterSeconds > 0)).toBe(true);
    expect(await slotState(`${run}:burst`, t0)).toEqual({ slots: 10, busy: 10, uses: 10 });

    // Warm: one window later every slot is free again; the next burst also gets exactly 10.
    const t1 = new Date(t0.getTime() + 900_000);
    const second = await burst(t1);
    expect(second.filter((r) => r.allowed)).toHaveLength(10);
    expect(await slotState(`${run}:burst`, t1)).toEqual({ slots: 10, busy: 10, uses: 20 });
  }, 60_000);

  it("a single request on a new key stores a single row (no storage amplification)", async () => {
    const now = new Date();
    expect(
      (await consume(createSqlRateLimitStore(a), { ...rule, limit: 50 }, "one", now)).allowed,
    ).toBe(true);
    expect(await slotState(`${run}:one`, now)).toEqual({ slots: 1, busy: 1, uses: 1 });
  }, 60_000);

  it("does not reset at a 15-minute clock boundary (B-1) and frees slots exactly one window later", async () => {
    const s = createSqlRateLimitStore(a);
    const t = (iso: string) => new Date(`2026-01-05T${iso}Z`);
    for (let i = 0; i < 10; i++)
      expect((await consume(s, rule, "edge", t("10:14:59"))).allowed).toBe(true);
    for (const x of ["10:15:00", "10:15:01", "10:29:58.999"])
      expect((await consume(s, rule, "edge", t(x))).allowed).toBe(false);
    expect((await consume(s, rule, "edge", t("10:29:59"))).allowed).toBe(true);
  }, 60_000);
});
