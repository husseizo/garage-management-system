import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/env", () => ({ env: () => ({ NODE_ENV: "test", DATABASE_URL: undefined }) }));

const { checkDatabase } = await import("@/server/db/health");
const { getDb, isDatabaseConfigured } = await import("@/server/db/client");

describe("database connection management without credentials", () => {
  it("reports unconfigured instead of failing", async () => {
    expect(isDatabaseConfigured()).toBe(false);
    await expect(checkDatabase()).resolves.toEqual({ status: "unconfigured" });
  });

  it("refuses to create a client with a typed SERVICE_UNAVAILABLE error", () => {
    expect(() => getDb()).toThrowError(expect.objectContaining({ code: "SERVICE_UNAVAILABLE" }));
  });
});
