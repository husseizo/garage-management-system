import { config as loadEnv } from "dotenv";

/**
 * DB mode only: reset sign-in rate-limit counters on the DEVELOPMENT branch so repeated local runs
 * start clean. Touches only `rate_limit_buckets` rows whose key starts with "signin:" (ephemeral
 * HMAC counters, no personal data). Refuses production branch names.
 */
export default async function globalSetup() {
  if (process.env.E2E_DATABASE !== "1") return;
  loadEnv({ path: ".env", quiet: true });
  if (/^(production|prod|main)$/i.test(process.env.NEON_BRANCH ?? "")) {
    throw new Error("Refusing to run E2E setup against a production branch.");
  }
  const url = process.env.DATABASE_URL;
  if (!url) return;
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  await sql`DELETE FROM rate_limit_buckets WHERE key LIKE 'signin:%'`;
}
