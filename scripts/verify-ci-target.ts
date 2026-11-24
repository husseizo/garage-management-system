/**
 * CI pre-flight: the database job may only run against the Neon `ci-testing` branch.
 * Checks NEON_BRANCH and that both URLs point to the same, non-pooled/pooled pair of one endpoint.
 * Prints endpoint ids only — never connection strings.
 */
import { resolveMigrationUrl } from "../src/server/db/target";

function endpoint(url: string): string {
  return new URL(url).hostname.split(".")[0]!.replace(/-pooler$/, "");
}

try {
  if (process.env.NEON_BRANCH !== "ci-testing") {
    throw new Error(`NEON_BRANCH must be "ci-testing" (got "${process.env.NEON_BRANCH ?? ""}").`);
  }
  const pooled = process.env.DATABASE_URL ?? "";
  const direct = resolveMigrationUrl(process.env);
  if (!pooled || !direct) throw new Error("DATABASE_URL and DATABASE_URL_UNPOOLED are required.");
  if (!new URL(pooled).hostname.includes("-pooler"))
    throw new Error("DATABASE_URL must be the pooled (-pooler) string.");
  if (endpoint(pooled) !== endpoint(direct))
    throw new Error("Pooled and direct URLs point to different endpoints.");
  const forbidden = (process.env.CI_FORBIDDEN_ENDPOINTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (forbidden.includes(endpoint(direct)))
    throw new Error("This endpoint is not allowed for CI (development/production).");
  console.log(`verify-ci-target: OK — branch "ci-testing", endpoint ${endpoint(direct)}`);
} catch (error) {
  console.error(`verify-ci-target: ${error instanceof Error ? error.message : "failed"}`);
  process.exit(1);
}
