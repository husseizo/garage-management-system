import "dotenv/config";

import { defineConfig } from "prisma/config";

import { connectionKinds, describeTarget, verifyWriteTarget } from "./src/server/db/identity";
import { classifyPrismaCommand } from "./src/server/db/prisma-command";
import { resolveMigrationUrl, UnsafeDatabaseTargetError } from "./src/server/db/target";

/**
 * Prisma CLI configuration (Prisma 7).
 *
 * Migrations use the DIRECT (unpooled) Neon connection — DIRECT_URL, else DATABASE_URL_UNPOOLED as
 * written by `neon env pull` — and never fall back to the pooled DATABASE_URL, which the application
 * runtime uses through the Neon driver adapter (src/server/db/client.ts).
 *
 * Database guard (ADR 0017, G-2): this file runs for EVERY Prisma command, including `npx prisma …`
 * typed directly, so the guard cannot be skipped by bypassing the npm scripts:
 * - commands that can write (`migrate deploy|dev|resolve`, `db execute`, `studio`, unknown ones)
 *   first verify the target — exact endpoint and the branch id the server reports — or refuse;
 * - `migrate reset`, `db push` and `db seed` are always refused;
 * - read-only commands (`generate`, `validate`, `migrate status|diff` …) run unchanged; `generate`
 *   still needs no database;
 * - if something other than the Prisma CLI loads this file, it gets no connection string.
 *
 * This stops mistakes in our tooling; it cannot stop direct access with valid credentials.
 */
async function guardedConfig() {
  const command = classifyPrismaCommand(process.argv);
  if (command.kind === "forbidden") {
    throw new UnsafeDatabaseTargetError(
      `db-guard: refusing "prisma ${command.command}": ${command.reason}.`,
    );
  }
  if (command.kind === "write") {
    const verified = await verifyWriteTarget(command.action, process.env, {
      connections: connectionKinds(process.env, "direct"),
    });
    console.error(`db-guard: OK — prisma ${command.command} on ${describeTarget(verified)}`);
  }
  return defineConfig({
    schema: "prisma/schema.prisma",
    migrations: { path: "prisma/migrations" },
    datasource: { url: command.kind === "not-cli" ? "" : resolveMigrationUrl(process.env) },
  });
}

export default guardedConfig;
