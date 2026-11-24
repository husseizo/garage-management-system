import "dotenv/config";

import { describe, expect, it } from "vitest";

/**
 * Live Neon checks. Run only when DATABASE_URL is set (local `.env` or CI secret); otherwise they
 * are reported as skipped, never as passed. Read-only: no rows are written.
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const isProductionBranch = /^(production|prod|main)$/i.test(process.env.NEON_BRANCH ?? "");

describe.skipIf(!hasDb || isProductionBranch)("Neon development database", () => {
  it("answers SELECT 1 through the Prisma Neon adapter", async () => {
    const { checkDatabase } = await import("@/server/db/health");
    const result = await checkDatabase();
    expect(result.status).toBe("ok");
  });

  it("uses the pooled endpoint at runtime and identifies the database", async () => {
    expect(new URL(process.env.DATABASE_URL!).hostname).toContain("-pooler");
    const { getDb } = await import("@/server/db/client");
    const [row] = await getDb().$queryRaw<{ db: string; ro: boolean }[]>`
      select current_database()::text as db, pg_is_in_recovery() as ro`;
    expect(row?.db).toBeTruthy();
    expect(row?.ro).toBe(false);
  });

  it("reads staff_users through Prisma with the applied migration", async () => {
    const { getDb } = await import("@/server/db/client");
    const db = getDb();
    const count = await db.staffUser.count();
    expect(count).toBeGreaterThanOrEqual(0);
    const migrations = await db.$queryRaw<{ migration_name: string }[]>`
      select migration_name from _prisma_migrations where finished_at is not null`;
    expect(migrations.map((m) => m.migration_name)).toContain("20261123000000_init_staff_users");
  });
});
