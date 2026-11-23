import "dotenv/config";

import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration (Prisma 7).
 *
 * Migrations use the DIRECT (unpooled) Neon connection; the application runtime uses the pooled
 * DATABASE_URL through the Neon driver adapter (src/server/db/client.ts). `prisma generate` does
 * not need a database, so the URL may be absent until Neon credentials are supplied.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DIRECT_URL || process.env.DATABASE_URL || "" },
});
