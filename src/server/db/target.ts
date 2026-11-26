/**
 * Database target resolution and safety rules shared by the Prisma CLI config and the
 * maintenance scripts. Pure functions (no `server-only`, no I/O) so they can be unit tested.
 *
 * Connection strings, as written by `neon env pull`:
 *   DATABASE_URL           pooled (`-pooler` host) — application runtime
 *   DATABASE_URL_UNPOOLED  direct                  — Prisma migrations
 *   DIRECT_URL             direct (legacy name, still supported; takes precedence)
 *   NEON_BRANCH            name of the Neon branch the strings belong to
 */
type Env = Record<string, string | undefined>;

export const PRODUCTION_BRANCH_NAMES = ["production", "main", "prod"] as const;
export const PRODUCTION_OVERRIDE_VAR = "ALLOW_PRODUCTION_DB_WRITES";

export class UnsafeDatabaseTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeDatabaseTargetError";
  }
}

function clean(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

function isPooledHost(url: string): boolean {
  try {
    return new URL(url).hostname.includes("-pooler");
  } catch {
    return false;
  }
}

/**
 * The direct (unpooled) URL Prisma Migrate should use. Never falls back to the pooled
 * DATABASE_URL: PgBouncer transaction pooling breaks migrations. Returns "" when no direct URL is
 * configured so `prisma generate` keeps working without a database.
 */
export function resolveMigrationUrl(env: Env): string {
  const url = clean(env.DIRECT_URL) ?? clean(env.DATABASE_URL_UNPOOLED);
  if (!url) return "";
  if (isPooledHost(url)) {
    throw new UnsafeDatabaseTargetError(
      "The migration connection string points at a pooled (-pooler) host. Use the direct string.",
    );
  }
  return url;
}

export function isProductionBranchName(name: string | undefined): boolean {
  const n = clean(name)?.toLowerCase();
  return Boolean(n && (PRODUCTION_BRANCH_NAMES as readonly string[]).includes(n));
}

/**
 * Pure pre-check for tooling that writes. Fails closed: refuses NODE_ENV=production, an unset
 * NEON_BRANCH, and a production branch name, unless the owner explicitly sets
 * ALLOW_PRODUCTION_DB_WRITES=true. This is NOT proof of identity — labels are self-declared;
 * `verifyWriteTarget()` (identity.ts) checks the endpoint and the server-reported branch id.
 * Messages name variables and branch names only — never connection strings.
 */
export function assertWritableTarget(env: Env, action: string): void {
  if (env.NODE_ENV === "production" && env[PRODUCTION_OVERRIDE_VAR] !== "true") {
    throw new UnsafeDatabaseTargetError(`Refusing to ${action} with NODE_ENV=production.`);
  }
  if (!clean(env.NEON_BRANCH)) {
    throw new UnsafeDatabaseTargetError(
      `Refusing to ${action}: NEON_BRANCH is not set. Name the branch the connection strings ` +
        `belong to (it is cross-checked against the server).`,
    );
  }
  if (isProductionBranchName(env.NEON_BRANCH) && env[PRODUCTION_OVERRIDE_VAR] !== "true") {
    throw new UnsafeDatabaseTargetError(
      `Refusing to ${action}: NEON_BRANCH is "${clean(env.NEON_BRANCH)}". Point .env at a development ` +
        `branch (neon checkout <branch> && neon env pull), or set ${PRODUCTION_OVERRIDE_VAR}=true ` +
        `with owner approval.`,
    );
  }
}
