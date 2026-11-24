import "dotenv/config";

import { defineConfig } from "prisma/config";

import { resolveMigrationUrl } from "./src/server/db/target";

/**
 * Prisma CLI configuration (Prisma 7).
 *
 * Migrations use the DIRECT (unpooled) Neon connection — DIRECT_URL, else DATABASE_URL_UNPOOLED as
 * written by `neon env pull` — and never fall back to the pooled DATABASE_URL, which the application
 * runtime uses through the Neon driver adapter (src/server/db/client.ts). `prisma generate` does not
 * need a database, so the URL may be absent. Migration scripts run `scripts/db-guard.ts` first.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: resolveMigrationUrl(process.env) },
});
