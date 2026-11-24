import "server-only";

import { logger } from "../logger";
import { getDb, isDatabaseConfigured } from "./client";

export type DatabaseHealth =
  { status: "ok"; latencyMs: number } | { status: "unconfigured" } | { status: "error" };

const TIMEOUT_MS = 5_000;

/**
 * Lightweight connectivity probe (`SELECT 1`). The result deliberately contains no host, database
 * name, version or error text — those are logged server-side only.
 */
export async function checkDatabase(): Promise<DatabaseHealth> {
  if (!isDatabaseConfigured()) return { status: "unconfigured" };

  const started = performance.now();
  try {
    await Promise.race([
      getDb().$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    return { status: "ok", latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    logger.error({ event: "health.database.failed", err: error }, "database health check failed");
    return { status: "error" };
  }
}
