/**
 * Pre-flight check run before `prisma migrate deploy` / `prisma migrate dev`.
 * Exits non-zero when the configured target is a production branch or when no direct
 * (unpooled) connection string is available. Prints branch/endpoint names only, never secrets.
 */
import "dotenv/config";

import {
  assertWritableTarget,
  resolveMigrationUrl,
  UnsafeDatabaseTargetError,
} from "../src/server/db/target";

try {
  const action = process.argv[2] ?? "run migrations";
  assertWritableTarget(process.env, action);
  const url = resolveMigrationUrl(process.env);
  if (!url) throw new UnsafeDatabaseTargetError("No DIRECT_URL or DATABASE_URL_UNPOOLED is set.");
  const host = new URL(url).hostname.split(".")[0];
  console.log(`db-guard: OK — branch "${process.env.NEON_BRANCH ?? "(unset)"}", endpoint ${host}`);
} catch (error) {
  console.error(`db-guard: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exit(1);
}
