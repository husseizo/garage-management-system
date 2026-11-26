/**
 * Database target identity verification for every tool that writes (ADR 0017, G-1/G-3).
 *
 * A write is allowed only when ALL of these agree, and anything missing, malformed, slow or
 * inconsistent refuses (fail closed):
 *
 *   1. the connection strings: Neon host, TLS, pooled/direct shape, the same endpoint for both;
 *   2. the expected target: a registry entry (known-targets.ts) chosen by that exact endpoint, or a
 *      temporary branch declared with DB_EXPECTED_BRANCH_ID + DB_EXPECTED_ENDPOINT_ID;
 *   3. the action is allowed on that target (production: never, except the guarded override);
 *   4. labels (NEON_BRANCH / NEON_BRANCH_ID), when set, agree — a label can refuse, never accept;
 *   5. the branch id the SERVER reports (`neon.branch_id`) on each connection the tool will use.
 *
 * These checks stop mistakes and misconfiguration in our own tools. They cannot stop anyone who
 * holds valid credentials from connecting with another client (psql, Neon Console).
 *
 * No `server-only` / env module imports, so scripts, Prisma config and tests can use it. Messages
 * contain identifiers only, never connection strings.
 */
import {
  DECLARED_TARGET_ACTIONS,
  KNOWN_TARGETS,
  type KnownTarget,
  type WriteAction,
} from "./known-targets";
import { assertWritableTarget, resolveMigrationUrl, UnsafeDatabaseTargetError } from "./target";

type Env = Record<string, string | undefined>;

export type ConnectionKind = "pooled" | "direct";

export interface ParsedConnection {
  kind: ConnectionKind;
  url: string;
  endpointId: string;
  database: string;
}

export interface ExpectedTarget {
  name: string;
  branchId: string;
  endpointId: string;
  database: string;
  production: boolean;
  declared: boolean;
}

export interface ServerIdentity {
  branchId: string | null;
  database: string;
  role: string;
}

/** Ask the server who it is, over exactly the given connection string. */
export type IdentityProbe = (url: string) => Promise<ServerIdentity>;

export interface VerifiedTarget extends ExpectedTarget {
  role: string;
  checked: ConnectionKind[];
}

const SAFE_SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);
const ENDPOINT_LABEL = /^ep-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID = /^[a-z]{2}-[a-z0-9-]+$/;

function refuse(message: string): never {
  throw new UnsafeDatabaseTargetError(message);
}

function clean(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

/** Parse and validate one Neon connection string. Never echoes the string. */
export function parseConnection(kind: ConnectionKind, url: string): ParsedConnection {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    refuse(`The ${kind} connection string is not a valid URL.`);
  }
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:") {
    refuse(`The ${kind} connection string is not a PostgreSQL URL.`);
  }
  const host = u.hostname.toLowerCase();
  const [label = "", ...rest] = host.split(".");
  if (!rest.length || !host.endsWith(".neon.tech")) {
    refuse(`The ${kind} connection does not point at a Neon host.`);
  }
  const pooled = label.endsWith("-pooler");
  if (kind === "pooled" && !pooled) refuse("DATABASE_URL must be the pooled (-pooler) string.");
  if (kind === "direct" && pooled) refuse("The direct connection string points at a pooled host.");
  const endpointId = pooled ? label.slice(0, -"-pooler".length) : label;
  if (!ENDPOINT_LABEL.test(endpointId)) refuse(`The ${kind} connection has no Neon endpoint id.`);
  const sslmode = u.searchParams.get("sslmode")?.toLowerCase();
  if (!sslmode || !SAFE_SSL_MODES.has(sslmode)) {
    refuse(`The ${kind} connection must use sslmode=require (or stricter).`);
  }
  const database = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!database) refuse(`The ${kind} connection names no database.`);
  return { kind, url, endpointId, database };
}

/** The connection strings a tool will use, validated, all on one endpoint. */
export function resolveConnections(env: Env, kinds: readonly ConnectionKind[]): ParsedConnection[] {
  if (!kinds.length) refuse("No connection to verify.");
  const conns = kinds.map((kind) => {
    const url = kind === "pooled" ? clean(env.DATABASE_URL) : resolveMigrationUrl(env);
    if (!url) {
      refuse(
        kind === "pooled"
          ? "DATABASE_URL (pooled) is required."
          : "DATABASE_URL_UNPOOLED (direct) is required.",
      );
    }
    return parseConnection(kind, url);
  });
  const endpoints = new Set(conns.map((c) => c.endpointId));
  if (endpoints.size !== 1) refuse("The pooled and direct strings point at different endpoints.");
  if (new Set(conns.map((c) => c.database)).size !== 1) {
    refuse("The pooled and direct strings name different databases.");
  }
  return conns;
}

/**
 * The connection a tool needs, plus the other one when it is configured, so a pooled and a direct
 * string that disagree are caught even when the tool uses only one of them.
 */
export function connectionKinds(env: Env, needs: ConnectionKind): ConnectionKind[] {
  const other: ConnectionKind = needs === "pooled" ? "direct" : "pooled";
  const otherSet = other === "pooled" ? clean(env.DATABASE_URL) : resolveMigrationUrl(env);
  return otherSet ? [needs, other] : [needs];
}

function fromKnown(t: KnownTarget): ExpectedTarget {
  return { ...t, declared: false };
}

/**
 * Decide which branch the connections must be, from the registry or an explicit declaration.
 * Pure. Never uses NEON_BRANCH to choose; labels are only cross-checked.
 */
export function resolveExpectedTarget(
  env: Env,
  conns: readonly ParsedConnection[],
  action: WriteAction,
): ExpectedTarget {
  const endpointId = conns[0]!.endpointId;
  const database = conns[0]!.database;
  const declaredBranch = clean(env.DB_EXPECTED_BRANCH_ID);
  const declaredEndpoint = clean(env.DB_EXPECTED_ENDPOINT_ID);

  let target: ExpectedTarget;
  let allowed: readonly WriteAction[];
  if (declaredBranch || declaredEndpoint) {
    if (!declaredBranch || !declaredEndpoint) {
      refuse("Set both DB_EXPECTED_BRANCH_ID and DB_EXPECTED_ENDPOINT_ID, or neither.");
    }
    if (!ID.test(declaredBranch) || !ENDPOINT_LABEL.test(declaredEndpoint)) {
      refuse("DB_EXPECTED_BRANCH_ID / DB_EXPECTED_ENDPOINT_ID are malformed.");
    }
    if (declaredEndpoint !== endpointId) {
      refuse(
        `The connection endpoint ${endpointId} is not the expected endpoint ${declaredEndpoint}.`,
      );
    }
    const byBranch = KNOWN_TARGETS.find((t) => t.branchId === declaredBranch);
    const byEndpoint = KNOWN_TARGETS.find((t) => t.endpointId === declaredEndpoint);
    if (byBranch || byEndpoint) {
      if (!byBranch || byBranch !== byEndpoint) {
        refuse("DB_EXPECTED_* disagree with the registered branch/endpoint pair.");
      }
      target = fromKnown(byBranch);
      allowed = byBranch.actions;
    } else {
      target = {
        name: clean(env.NEON_BRANCH) ?? "declared",
        branchId: declaredBranch,
        endpointId: declaredEndpoint,
        database,
        production: false,
        declared: true,
      };
      allowed = DECLARED_TARGET_ACTIONS;
    }
  } else {
    const known = KNOWN_TARGETS.find((t) => t.endpointId === endpointId);
    if (!known) {
      refuse(
        `Endpoint ${endpointId} is not a registered target. For a temporary branch set ` +
          "DB_EXPECTED_BRANCH_ID and DB_EXPECTED_ENDPOINT_ID.",
      );
    }
    target = fromKnown(known);
    allowed = known.actions;
  }

  if (database !== target.database) {
    refuse(`Database "${database}" is not the expected "${target.database}".`);
  }

  // Labels may refuse, never accept.
  const label = clean(env.NEON_BRANCH);
  if (label && label !== target.name) {
    refuse(`NEON_BRANCH "${label}" does not match the target "${target.name}".`);
  }
  if (target.declared && KNOWN_TARGETS.some((t) => t.name === label)) {
    refuse(`A declared temporary branch may not be labelled "${label}".`);
  }
  const labelId = clean(env.NEON_BRANCH_ID);
  if (labelId && labelId !== target.branchId) {
    refuse(`NEON_BRANCH_ID ${labelId} does not match the target ${target.branchId}.`);
  }

  if (target.production) {
    assertProductionOverride(env, target, action);
  } else if (!allowed.includes(action)) {
    refuse(`Action "${action}" is not allowed on "${target.name}".`);
  }
  return target;
}

/**
 * Production writes from tooling: only `migrate-deploy`, only with BOTH the override flag and the
 * exact production branch id typed as confirmation, and never from a pull-request CI job. The
 * probe later confirms the server really is that branch.
 */
function assertProductionOverride(env: Env, target: ExpectedTarget, action: WriteAction) {
  const ok =
    env.ALLOW_PRODUCTION_DB_WRITES === "true" &&
    clean(env.CONFIRM_PRODUCTION_BRANCH_ID) === target.branchId &&
    action === "migrate-deploy" &&
    !(env.GITHUB_EVENT_NAME ?? "").startsWith("pull_request");
  if (!ok) refuse(`Refusing to ${action} on the production branch.`);
}

/** The pure part of the verification (no network). */
export function planWriteTarget(
  action: WriteAction,
  env: Env,
  kinds: readonly ConnectionKind[],
): { target: ExpectedTarget; conns: ParsedConnection[] } {
  // Existing pure pre-check, fail closed (NODE_ENV=production, unset or production label).
  assertWritableTarget(env, action);
  const conns = resolveConnections(env, kinds);
  return { target: resolveExpectedTarget(env, conns, action), conns };
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      timer = setTimeout(
        () => reject(new UnsafeDatabaseTargetError(`${what} timed out after ${ms} ms.`)),
        ms,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Compare a server-reported identity with the expected target. */
export function assertServerIdentity(
  expected: Pick<ExpectedTarget, "branchId" | "database">,
  server: ServerIdentity,
  kind: string,
): void {
  if (!server.branchId) {
    refuse(`The ${kind} connection did not report a Neon branch id; refusing.`);
  }
  if (server.branchId !== expected.branchId) {
    refuse(
      `The ${kind} connection reports branch ${server.branchId}, expected ${expected.branchId}.`,
    );
  }
  if (server.database !== expected.database) {
    refuse(`The ${kind} connection reports database "${server.database}".`);
  }
}

/**
 * Full verification: pure checks, then the server-reported branch id on every connection the tool
 * will use. Throws UnsafeDatabaseTargetError on any failure, including probe errors and timeouts.
 */
export async function verifyWriteTarget(
  action: WriteAction,
  env: Env,
  options: { connections: readonly ConnectionKind[]; probe?: IdentityProbe; timeoutMs?: number },
): Promise<VerifiedTarget> {
  const { target, conns } = planWriteTarget(action, env, options.connections);
  const probe = options.probe ?? neonIdentityProbe;
  const timeoutMs = options.timeoutMs ?? 30_000;
  let role = "";
  for (const conn of conns) {
    let server: ServerIdentity;
    try {
      server = await withTimeout(probe(conn.url), timeoutMs, `The ${conn.kind} identity check`);
    } catch (error) {
      if (error instanceof UnsafeDatabaseTargetError) throw error;
      refuse(`The ${conn.kind} identity check failed (${errorName(error)}); refusing.`);
    }
    assertServerIdentity(target, server, conn.kind);
    role = server.role;
  }
  return { ...target, role, checked: conns.map((c) => c.kind) };
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "error";
}

/**
 * CI policy (G-3): the database job may only touch the pinned `ci-testing` branch.
 * - The workflow pins DB_EXPECTED_BRANCH_ID / DB_EXPECTED_ENDPOINT_ID (committed, reviewed);
 * - they must equal the registry's `ci-testing` entry;
 * - BOTH the pooled and the direct string are required and verified against the server;
 * - the CI_FORBIDDEN_ENDPOINTS deny-list is kept as an extra layer only.
 */
export async function verifyCiTarget(
  action: WriteAction,
  env: Env,
  options: { probe?: IdentityProbe; timeoutMs?: number } = {},
): Promise<VerifiedTarget> {
  const ci = KNOWN_TARGETS.find((t) => t.name === "ci-testing");
  if (!ci) refuse("The registry has no ci-testing target.");
  if (
    clean(env.DB_EXPECTED_BRANCH_ID) !== ci.branchId ||
    clean(env.DB_EXPECTED_ENDPOINT_ID) !== ci.endpointId
  ) {
    refuse(
      "DB_EXPECTED_BRANCH_ID / DB_EXPECTED_ENDPOINT_ID must pin the registered ci-testing target.",
    );
  }
  const forbidden = (env.CI_FORBIDDEN_ENDPOINTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const conn of resolveConnections(env, ["pooled", "direct"])) {
    if (forbidden.includes(conn.endpointId)) refuse("This endpoint is on the CI deny-list.");
  }
  const verified = await verifyWriteTarget(action, env, {
    connections: ["pooled", "direct"],
    ...options,
  });
  if (verified.name !== "ci-testing" || verified.declared) refuse("Not the ci-testing target.");
  return verified;
}

export function describeTarget(v: VerifiedTarget): string {
  return (
    `branch "${v.name}" ${v.branchId} (server-reported), endpoint ${v.endpointId}, ` +
    `database ${v.database}, role ${v.role}, checked ${v.checked.join(" + ")}`
  );
}

export const IDENTITY_SQL =
  "SELECT current_setting('neon.branch_id', true) AS branch_id, current_database()::text AS db, current_user::text AS role";

/** Default probe: one short-lived connection through the Neon serverless driver. */
export const neonIdentityProbe: IdentityProbe = async (url) => {
  const { Pool } = await import("@neondatabase/serverless");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const { rows } = await pool.query<{ branch_id: string | null; db: string; role: string }>(
      IDENTITY_SQL,
    );
    const row = rows[0];
    return { branchId: row?.branch_id || null, database: row?.db ?? "", role: row?.role ?? "" };
  } finally {
    await pool.end().catch(() => undefined);
  }
};

/** Re-check identity on an open client, e.g. inside the transaction that is about to write. */
export async function assertClientBranch(
  client: {
    query: (
      q: string,
    ) => Promise<{ rows: { branch_id: string | null; db: string; role: string }[] }>;
  },
  expected: Pick<ExpectedTarget, "branchId" | "database">,
): Promise<void> {
  const row = (await client.query(IDENTITY_SQL)).rows[0];
  assertServerIdentity(
    expected,
    { branchId: row?.branch_id || null, database: row?.db ?? "", role: row?.role ?? "" },
    "transaction",
  );
}
