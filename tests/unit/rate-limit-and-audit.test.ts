import { describe, expect, it } from "vitest";

import { auditChanges, maskEmail, maskPhone } from "@/server/audit";
import { consume, windowStartFor, type RateLimitStore } from "@/server/rate-limit-core";
import { effectiveInstant, localDateString, startOfLocalDay } from "@/lib/dates";

function memoryStore(): RateLimitStore & { data: Map<string, number> } {
  const data = new Map<string, number>();
  return {
    data,
    async increment(key, windowStart) {
      const k = `${key}@${windowStart.toISOString()}`;
      const n = (data.get(k) ?? 0) + 1;
      data.set(k, n);
      return n;
    },
  };
}

describe("rate limiting (fixed window)", () => {
  const rule = { name: "signin:email", limit: 3, windowSeconds: 900 };

  it("allows up to the limit, then blocks with a retry-after", async () => {
    const store = memoryStore();
    const now = new Date("2026-11-24T10:05:00Z");
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await consume(store, rule, "abc", now));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3]!.retryAfterSeconds).toBe(600);
  });

  it("starts a new window and isolates subjects", async () => {
    const store = memoryStore();
    const t0 = new Date("2026-11-24T10:14:59Z");
    for (let i = 0; i < 3; i++) await consume(store, rule, "abc", t0);
    expect((await consume(store, rule, "abc", t0)).allowed).toBe(false);
    expect((await consume(store, rule, "other", t0)).allowed).toBe(true);
    expect((await consume(store, rule, "abc", new Date("2026-11-24T10:15:00Z"))).allowed).toBe(
      true,
    );
    expect(windowStartFor(t0, 900).toISOString()).toBe("2026-11-24T10:00:00.000Z");
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
