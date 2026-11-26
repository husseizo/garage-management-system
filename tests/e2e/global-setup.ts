import { config as loadEnv } from "dotenv";

import { connectionKinds, describeTarget, verifyWriteTarget } from "../../src/server/db/identity";

/**
 * DB mode only.
 *
 * 1. Verify the database identity before the app server or any test writes (ADR 0017): the
 *    endpoint and the server-reported branch id must match an allowed target, or the run fails.
 * 2. Reset sign-in rate-limit counters so repeated runs start clean. Touches only
 *    `rate_limit_buckets` rows whose key starts with "signin:" (ephemeral HMAC counters).
 */
export default async function globalSetup() {
  if (process.env.E2E_DATABASE !== "1") return;
  loadEnv({ path: ".env", quiet: true });
  const verified = await verifyWriteTarget("test-writes", process.env, {
    connections: connectionKinds(process.env, "pooled"),
  });
  process.stdout.write(`e2e: database ${describeTarget(verified)}\n`);
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL!);
  await sql`DELETE FROM rate_limit_buckets WHERE key LIKE 'signin:%'`;
}
