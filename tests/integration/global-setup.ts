import { config as loadEnv } from "dotenv";

import { connectionKinds, describeTarget, verifyWriteTarget } from "../../src/server/db/identity";

/**
 * Before any live integration test can write: verify the database identity (ADR 0017). Without
 * connection strings the live tests skip themselves and there is nothing to verify. With them, the
 * endpoint and the server-reported branch id must match an allowed target, or the run fails.
 */
export default async function setup() {
  loadEnv({ quiet: true });
  const env = process.env;
  if (!env.DATABASE_URL && !env.DATABASE_URL_UNPOOLED && !env.DIRECT_URL) return;
  const verified = await verifyWriteTarget("test-writes", env, {
    connections: connectionKinds(env, env.DATABASE_URL ? "pooled" : "direct"),
  });
  process.stdout.write(`integration tests: database ${describeTarget(verified)}\n`);
}
