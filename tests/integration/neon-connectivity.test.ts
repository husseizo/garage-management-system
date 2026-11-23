import "dotenv/config";

import { describe, expect, it } from "vitest";

/**
 * Live Neon connectivity check. Runs only when DATABASE_URL is set (local `.env` or CI secret);
 * otherwise it is reported as skipped, never as passed.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("Neon development database", () => {
  it("answers SELECT 1 through the Prisma Neon adapter", async () => {
    const { checkDatabase } = await import("@/server/db/health");
    const result = await checkDatabase();
    expect(result.status).toBe("ok");
  });
});
