import { describe, expect, it } from "vitest";

import { auditChanges, maskEmail, maskPhone } from "@/server/audit";
import { consume, type RateLimitStore } from "@/server/rate-limit-core";
import { effectiveInstant, localDateString, startOfLocalDay } from "@/lib/dates";

/**
 * In-memory store with the same contract as the PostgreSQL store: `limit` reusable slots per key,
 * claimed atomically (the analogue of `FOR UPDATE SKIP LOCKED`). Each claim first yields to the
 * event loop so concurrent callers genuinely interleave.
 */
function memoryStore(): RateLimitStore & { slots: Map<string, number[]> } {
  const slots = new Map<string, number[]>();
  return {
    slots,
    async claim(key, limit, now, busyUntil) {
      await new Promise((r) => setTimeout(r, 0));
      const s = slots.get(key) ?? [];
      while (s.length < limit) s.push(-Infinity);
      slots.set(key, s);
      const live = s.slice(0, limit);
      const free = live.reduce<number>(
        (best, t, i) => (t <= now.getTime() && (best < 0 || t < live[best]!) ? i : best),
        -1,
      );
      if (free < 0) return { claimed: false, nextFreeAt: new Date(Math.min(...live)) };
      s[free] = busyUntil.getTime();
      return { claimed: true, nextFreeAt: null };
    },
  };
}

const at = (iso: string) => new Date(`2026-11-24T${iso}Z`);

describe("rate limiting (sliding window log)", () => {
  const rule = { name: "signin:email", limit: 3, windowSeconds: 900 };

  it("allows up to the limit, then blocks with a retry-after until the oldest attempt expires", async () => {
    const store = memoryStore();
    const results = [];
    for (const t of ["10:05:00", "10:06:00", "10:07:00", "10:08:00"])
      results.push(await consume(store, rule, "abc", at(t)));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    // Oldest counted attempt (10:05:00) leaves the window at 10:20:00 → 12 minutes from 10:08.
    expect(results[3]!.retryAfterSeconds).toBe(720);
  });

  it("does NOT reset at a clock-aligned boundary (B-1 regression)", async () => {
    const store = memoryStore();
    for (let i = 0; i < 3; i++) await consume(store, rule, "abc", at("10:14:59"));
    // The old fixed window reset here: 10:15:00 started a new bucket and allowed 3 more.
    for (const t of ["10:15:00", "10:15:01", "10:20:00", "10:29:58"]) {
      expect((await consume(store, rule, "abc", at(t))).allowed).toBe(false);
    }
    // Each attempt counts for exactly one window, (now − 15 min, now]: 1 ms before 10:29:59 the
    // 10:14:59 attempts still count; at 10:29:59 they have aged out.
    expect((await consume(store, rule, "abc", at("10:29:58.999"))).allowed).toBe(false);
    expect((await consume(store, rule, "abc", at("10:29:59"))).allowed).toBe(true);
  });

  it("frees slots one by one as individual attempts age out", async () => {
    const store = memoryStore();
    await consume(store, rule, "abc", at("10:00:00"));
    await consume(store, rule, "abc", at("10:05:00"));
    await consume(store, rule, "abc", at("10:10:00"));
    expect((await consume(store, rule, "abc", at("10:14:00"))).allowed).toBe(false);
    expect((await consume(store, rule, "abc", at("10:15:00.5"))).allowed).toBe(true); // 10:00 aged out
    expect((await consume(store, rule, "abc", at("10:16:00"))).allowed).toBe(false);
  });

  it("isolates subjects and rules", async () => {
    const store = memoryStore();
    for (let i = 0; i < 3; i++) await consume(store, rule, "abc", at("10:00:00"));
    expect((await consume(store, rule, "abc", at("10:00:01"))).allowed).toBe(false);
    expect((await consume(store, rule, "other", at("10:00:01"))).allowed).toBe(true);
    expect(
      (await consume(store, { ...rule, name: "signin:ip" }, "abc", at("10:00:01"))).allowed,
    ).toBe(true);
  });

  it("never allows more than the limit in ANY rolling window (randomised, 2 hours)", async () => {
    const store = memoryStore();
    const limit = { name: "signin:email", limit: 10, windowSeconds: 900 };
    let seed = 42;
    const rand = () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
    const allowed: number[] = [];
    let t = at("09:00:00").getTime();
    for (let i = 0; i < 2_000; i++) {
      t += Math.floor(rand() * 8_000); // bursts and gaps, crossing many 15-minute boundaries
      if ((await consume(store, limit, "abc", new Date(t))).allowed) allowed.push(t);
    }
    for (const end of allowed) {
      const inWindow = allowed.filter((x) => x > end - 900_000 && x <= end).length;
      expect(inWindow).toBeLessThanOrEqual(10);
    }
    expect(allowed.length).toBeGreaterThan(10); // and it does recover after windows pass
  });

  it("concurrent requests never share a slot, so the limit holds under a burst", async () => {
    const store = memoryStore();
    const now = at("10:00:00");
    const results = await Promise.all(
      Array.from({ length: 50 }, () => consume(store, { ...rule, limit: 10 }, "abc", now)),
    );
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect(store.slots.get("signin:email:abc")!.filter((t) => t > now.getTime())).toHaveLength(10);
  });

  it("lowering the limit takes effect immediately; raising it adds slots", async () => {
    const store = memoryStore();
    for (let i = 0; i < 3; i++) await consume(store, rule, "abc", at("10:00:00"));
    expect((await consume(store, { ...rule, limit: 2 }, "abc", at("10:01:00"))).allowed).toBe(
      false,
    );
    expect((await consume(store, { ...rule, limit: 4 }, "abc", at("10:01:00"))).allowed).toBe(true);
  });
});

describe("audit redaction", () => {
  it("masks phones and emails", () => {
    expect(maskPhone("+255712345678")).toBe("+2557•••••678");
    expect(maskEmail("asha@example.com")).toBe("a•••@example.com");
    expect(maskPhone(null)).toBeNull();
  });

  it("records only allow-listed fields, with the configured policy", () => {
    const changes = auditChanges(
      {
        displayName: "Asha",
        notes: "old",
        preferredLanguage: "sw",
        phone: "+255712345678",
        secret: "x",
      },
      {
        displayName: "Asha M",
        notes: "new",
        preferredLanguage: "en",
        phone: "+255754000111",
        secret: "y",
      },
      {
        displayName: "changed-only",
        notes: "changed-only",
        preferredLanguage: "value",
        phone: "mask-phone",
      },
    );
    expect(changes).toEqual({
      displayName: { changed: true },
      notes: { changed: true },
      preferredLanguage: { from: "sw", to: "en" },
      phone: { from: "+2557•••••678", to: "+2557•••••111" },
    });
    expect(JSON.stringify(changes)).not.toContain("Asha");
    expect(JSON.stringify(changes)).not.toContain("secret");
  });

  it("omits unchanged fields", () => {
    expect(auditChanges({ a: "1" }, { a: "1" }, { a: "value" })).toEqual({});
  });
});

describe("garage-local dates (Africa/Dar_es_Salaam, UTC+3)", () => {
  const tz = "Africa/Dar_es_Salaam";
  it("computes local midnight", () => {
    expect(startOfLocalDay("2026-11-20", tz).toISOString()).toBe("2026-11-19T21:00:00.000Z");
  });
  it("uses 'now' for today or empty, midnight for past dates", () => {
    const now = new Date("2026-11-24T20:30:00Z"); // 23:30 local
    expect(localDateString(now, tz)).toBe("2026-11-24");
    expect(effectiveInstant(undefined, tz, now)).toBe(now);
    expect(effectiveInstant("2026-11-24", tz, now)).toBe(now);
    expect(effectiveInstant("2026-11-01", tz, now).toISOString()).toBe("2026-10-31T21:00:00.000Z");
  });
});
