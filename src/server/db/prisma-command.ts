/**
 * Classify the Prisma CLI command that is loading `prisma.config.ts` (ADR 0017, G-2 A).
 *
 * - `read`:      no database writes (generate, validate, format, migrate status/diff, db pull …);
 * - `write`:     may change the database; allowed only after `verifyWriteTarget(action)`;
 * - `forbidden`: never allowed from this project (`migrate reset`, `db push`, `db seed`);
 * - `not-cli`:   the config was loaded by something other than the Prisma CLI (for example the
 *                editor's language server); it gets NO connection string at all.
 *
 * Unknown subcommands are treated as `write` with the most restrictive action (fail closed).
 * Pure: no env, no I/O.
 */
import type { WriteAction } from "./known-targets";

export type PrismaCommand =
  | { kind: "read"; command: string }
  | { kind: "write"; command: string; action: WriteAction }
  | { kind: "forbidden"; command: string; reason: string }
  | { kind: "not-cli"; command: string };

/** Options that take a value, so the value is not mistaken for a subcommand. */
const VALUE_OPTIONS = new Set(["--config", "--schema", "--name", "-n", "--url", "--file"]);

const CLI_ENTRY = /(^|[\\/])(prisma|prisma[\\/]build[\\/]index\.js)$/;

const READ = new Set([
  "generate",
  "validate",
  "format",
  "version",
  "help",
  "init",
  "debug",
  "migrate status",
  "migrate diff",
  "db pull",
]);

const WRITE: Record<string, WriteAction> = {
  "migrate deploy": "migrate-deploy",
  "migrate resolve": "migrate-deploy", // edits the _prisma_migrations history
  "migrate dev": "migrate-dev",
  // Interactive or arbitrary-SQL tools: development-type targets only (not ci-testing).
  "db execute": "migrate-dev",
  studio: "migrate-dev",
};

const FORBIDDEN: Record<string, string> = {
  "migrate reset": "database resets are not allowed in this project",
  "db push": "schema pushes are not allowed; use migrations",
  "db seed": "no seed script is configured; data is loaded through reviewed scripts",
};

function positionals(args: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--") break;
    if (a.startsWith("-")) {
      if (VALUE_OPTIONS.has(a)) i++;
      continue;
    }
    out.push(a);
  }
  return out;
}

export function classifyPrismaCommand(argv: readonly string[]): PrismaCommand {
  const entry = argv[1] ?? "";
  if (!CLI_ENTRY.test(entry)) return { kind: "not-cli", command: "" };
  const args = argv.slice(2);
  const [first, second] = positionals(args);
  if (!first) {
    // `prisma`, `prisma -v`, `prisma --help`: prints only.
    return { kind: "read", command: args[0] ?? "" };
  }
  const two = second ? `${first} ${second}` : first;
  if (FORBIDDEN[two]) return { kind: "forbidden", command: two, reason: FORBIDDEN[two] };
  if (WRITE[two]) return { kind: "write", command: two, action: WRITE[two] };
  if (READ.has(two)) return { kind: "read", command: two };
  if (WRITE[first]) return { kind: "write", command: first, action: WRITE[first] };
  if (READ.has(first) && first !== "migrate" && first !== "db")
    return { kind: "read", command: first };
  // Unknown (new Prisma subcommand, typo, `migrate` / `db` without a known verb): fail closed.
  return { kind: "write", command: two, action: "migrate-dev" };
}
