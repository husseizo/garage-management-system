import { neon } from "@neondatabase/serverless";

import { connectionKinds, verifyWriteTarget } from "../../../src/server/db/identity";

/**
 * Test-only: change an EPHEMERAL E2E staff account (`*@example.test`) directly in the database, to
 * simulate an owner deactivating someone or changing their role while they are signed in.
 *
 * Fails closed: runs only in DB mode, only for `@example.test` accounts, and only after the
 * database identity is verified (exact endpoint + server-reported branch id, ADR 0017) — the same
 * check the global setup runs.
 */
let verified: Promise<unknown> | undefined;

export async function setStaffState(
  email: string,
  change: { active?: boolean; role?: "OWNER" | "MANAGER" | "SERVICE_ADVISOR" | "TECHNICIAN" },
): Promise<void> {
  if (process.env.E2E_DATABASE !== "1") throw new Error("setStaffState: DB mode only.");
  if (!/^[a-z0-9.]+@example\.test$/.test(email)) {
    throw new Error("setStaffState: only ephemeral @example.test accounts may be changed.");
  }
  verified ??= verifyWriteTarget("test-writes", process.env, {
    connections: connectionKinds(process.env, "pooled"),
  });
  await verified;
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    UPDATE staff_users
    SET active = COALESCE(${change.active ?? null}::boolean, active),
        role = COALESCE(${change.role ?? null}::"StaffRole", role),
        updated_at = now()
    WHERE email = ${email}
    RETURNING id`;
  if (rows.length !== 1) throw new Error("setStaffState: test account not found.");
}
