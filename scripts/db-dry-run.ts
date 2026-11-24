/**
 * Dry-run a migration file against the configured DEVELOPMENT database inside BEGIN … ROLLBACK.
 *
 *   npm run db:dry-run -- prisma/migrations/<name>/migration.sql
 *
 * Prints the database identity, the tables created inside the transaction and the constraint
 * count, then rolls back so nothing persists. Refuses production branches (db-guard rules).
 * Never prints connection strings.
 */
import "dotenv/config";

import { readFileSync } from "node:fs";

import { Pool } from "@neondatabase/serverless";

import { assertWritableTarget, resolveMigrationUrl } from "../src/server/db/target";

async function tables(c: { query: (q: string) => Promise<{ rows: { t: string }[] }> }) {
  const { rows } = await c.query(
    "select table_name::text t from information_schema.tables where table_schema = 'public' order by 1",
  );
  return rows.map((r) => r.t);
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npm run db:dry-run -- <migration.sql>");
  assertWritableTarget(process.env, "dry-run a migration");
  const url = resolveMigrationUrl(process.env);
  if (!url) throw new Error("No DIRECT_URL or DATABASE_URL_UNPOOLED is set.");

  const pool = new Pool({ connectionString: url });
  const c = await pool.connect();
  try {
    const id = (
      await c.query<{ db: string; usr: string; v: string }>(
        "select current_database()::text db, current_user::text usr, current_setting('server_version') v",
      )
    ).rows[0]!;
    console.log(
      `identity: branch=${process.env.NEON_BRANCH ?? "(unset)"} endpoint=${new URL(url).hostname.split(".")[0]} db=${id.db} role=${id.usr} pg=${id.v}`,
    );
    const before = await tables(c);
    await c.query("BEGIN");
    try {
      await c.query(readFileSync(file, "utf8"));
      const during = await tables(c);
      console.log(
        `tables created: ${during.filter((t) => !before.includes(t)).join(", ") || "(none)"}`,
      );
      const missing = before.filter((t) => !during.includes(t));
      if (missing.length) throw new Error(`tables disappeared: ${missing.join(", ")}`);
      const cons = await c.query<{ n: number }>(
        "select count(*)::int n from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname = 'public' and c.contype in ('c','x','f','u','p')",
      );
      console.log(`constraints (check/exclusion/fk/unique/pk) inside tx: ${cons.rows[0]!.n}`);
    } finally {
      await c.query("ROLLBACK");
    }
    const after = await tables(c);
    console.log(
      `rolled back: ${JSON.stringify(after) === JSON.stringify(before) ? "OK, table set unchanged" : "MISMATCH"}`,
    );
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`db-dry-run: ${error instanceof Error ? error.message : "failed"}`);
  process.exit(1);
});
