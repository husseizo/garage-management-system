import { afterEach, describe, expect, it, vi } from "vitest";

const checkDatabase = vi.fn();
vi.mock("@/server/db/health", () => ({ checkDatabase: () => checkDatabase() }));

const { GET } = await import("@/app/api/health/route");

const call = () => GET(new Request("http://localhost/api/health"), undefined as never);

describe("GET /api/health", () => {
  afterEach(() => checkDatabase.mockReset());

  it("reports degraded (200) when the database is not configured", async () => {
    checkDatabase.mockResolvedValue({ status: "unconfigured" });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({
      status: "degraded",
      checks: { database: { status: "unconfigured" } },
    });
  });

  it("reports ok when the database responds", async () => {
    checkDatabase.mockResolvedValue({ status: "ok", latencyMs: 12 });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok" });
  });

  it("returns 503 without infrastructure details when the database is unreachable", async () => {
    checkDatabase.mockResolvedValue({ status: "error" });
    const res = await call();
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toMatch(/postgres|neon\.tech|password|host/i);
  });

  it("converts unexpected exceptions into a safe 500 with a request id", async () => {
    checkDatabase.mockRejectedValue(
      new Error("FATAL: password authentication failed for user admin"),
    );
    const res = await call();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.requestId).toMatch(/[0-9a-f-]{36}/);
    expect(JSON.stringify(body)).not.toContain("password authentication");
  });
});
