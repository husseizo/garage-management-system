/**
 * Standalone pre-flight check (ADR 0017): `npm run db:guard`. Prisma commands no longer need it —
 * `prisma.config.ts` runs the same verification for every Prisma command that can write.
 *
 *   tsx scripts/db-guard.ts migrate-deploy
 *
 * Verifies the target from the connection strings AND the branch id the server reports, and exits
 * non-zero on any doubt (fail closed). Prints identifiers only, never connection strings.
 */
import "dotenv/config";

import { connectionKinds, describeTarget, verifyWriteTarget } from "../src/server/db/identity";
import type { WriteAction } from "../src/server/db/known-targets";

const ACTIONS: readonly WriteAction[] = ["migrate-dev", "migrate-deploy", "dry-run"];

async function main() {
  const action = process.argv[2] as WriteAction | undefined;
  if (!action || !ACTIONS.includes(action)) {
    throw new Error(`Usage: db-guard <${ACTIONS.join("|")}>`);
  }
  const verified = await verifyWriteTarget(action, process.env, {
    connections: connectionKinds(process.env, "direct"),
  });
  console.log(`db-guard: OK — ${action} on ${describeTarget(verified)}`);
}

main().catch((error) => {
  console.error(`db-guard: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
});
