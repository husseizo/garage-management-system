import "server-only";

import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "@/generated/prisma/client";

import { AppError } from "../errors/app-error";
import { env } from "../env";

/**
 * Prisma client over the Neon serverless driver adapter.
 *
 * - Created lazily so the app boots (and non-database pages render) before Neon credentials exist.
 * - Cached on `globalThis` in development to survive hot reloads without exhausting connections.
 */
const globalForDb = globalThis as unknown as { __gmsPrisma?: PrismaClient };

export function isDatabaseConfigured(): boolean {
  return Boolean(env().DATABASE_URL);
}

export function getDb(): PrismaClient {
  if (globalForDb.__gmsPrisma) return globalForDb.__gmsPrisma;

  const connectionString = env().DATABASE_URL;
  if (!connectionString) {
    throw new AppError("SERVICE_UNAVAILABLE", "The database is not configured.");
  }

  const client = new PrismaClient({
    adapter: new PrismaNeon({ connectionString }),
    log: env().NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  globalForDb.__gmsPrisma = client;
  return client;
}
