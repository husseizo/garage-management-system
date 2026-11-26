/**
 * CI only: remove the business records created by the E2E run on the Neon `ci-testing` branch.
 *
 * Deletes customers/vehicles (and their contacts, plates and ownerships) created by the two
 * ephemeral E2E staff accounts, plus sign-in rate-limit counters. Staff accounts and audit rows
 * are kept: `audit_logs` is append-only by design (ADR 0012) and staff with audit history are
 * protected by ON DELETE RESTRICT. Refuses to run anywhere but the pinned `ci-testing` branch,
 * re-checked inside the deleting transaction.
 */
import { Pool } from "@neondatabase/serverless";

import { assertClientBranch, describeTarget, verifyCiTarget } from "../src/server/db/identity";
import { resolveMigrationUrl } from "../src/server/db/target";

const E2E_STAFF = [
  "e2e.owner@example.test",
  "e2e.technician@example.test",
  "e2e.revoke@example.test",
];

async function main() {
  // Pinned ci-testing target, verified against the server on both connections (ADR 0017).
  const target = await verifyCiTarget("ci-cleanup", process.env);
  const url = resolveMigrationUrl(process.env);

  const pool = new Pool({ connectionString: url });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    // Same connection, same transaction as the deletes: refuse (and roll back) on any mismatch.
    await assertClientBranch(c, target);
    const staff = (
      await c.query<{ id: string }>("select id from staff_users where email = any($1)", [E2E_STAFF])
    ).rows.map((r) => r.id);
    const vehicles = (
      await c.query<{ id: string }>(
        "select id::text from vehicles where created_by_staff_user_id = any($1)",
        [staff],
      )
    ).rows.map((r) => r.id);
    const customers = (
      await c.query<{ id: string }>(
        "select id::text from customers where created_by_staff_user_id = any($1)",
        [staff],
      )
    ).rows.map((r) => r.id);
    const counts: Record<string, number> = {};
    counts.registrations =
      (
        await c.query("delete from vehicle_registrations where vehicle_id = any($1::uuid[])", [
          vehicles,
        ])
      ).rowCount ?? 0;
    counts.ownerships =
      (
        await c.query(
          "delete from vehicle_ownerships where vehicle_id = any($1::uuid[]) or customer_id = any($2::uuid[])",
          [vehicles, customers],
        )
      ).rowCount ?? 0;
    counts.vehicles =
      (await c.query("delete from vehicles where id = any($1::uuid[])", [vehicles])).rowCount ?? 0;
    counts.customers =
      (await c.query("delete from customers where id = any($1::uuid[])", [customers])).rowCount ??
      0; // contacts cascade
    counts.rateLimitBuckets =
      (
        await c.query(
          "delete from rate_limit_buckets where key like 'signin:%' or key like 'search:%' or key like 'write:%'",
        )
      ).rowCount ?? 0;
    await c.query("COMMIT");
    const left = (
      await c.query<{ customers: number; vehicles: number }>(
        "select (select count(*) from customers where created_by_staff_user_id = any($1))::int customers, (select count(*) from vehicles where created_by_staff_user_id = any($1))::int vehicles",
        [staff],
      )
    ).rows[0]!;
    console.log(
      `ci-cleanup: ${describeTarget(target)}; removed ${JSON.stringify(counts)}; remaining E2E customers=${left.customers} vehicles=${left.vehicles}`,
    );
    if (left.customers || left.vehicles) process.exit(1);
  } catch (error) {
    await c.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`ci-cleanup: ${error instanceof Error ? error.message : "failed"}`);
  process.exit(1);
});
