/**
 * Create (or reset the password of) a staff account in the configured DEVELOPMENT database.
 *
 *   npm run staff:create -- --email owner@example.test --name "Alex Owner" --role OWNER
 *
 * The password is read from a hidden prompt (or STAFF_PASSWORD for non-interactive use) and is
 * never printed or logged. Refuses to run when NODE_ENV=production or when NEON_BRANCH names a
 * production branch, or when the database identity cannot be verified (src/server/db/identity.ts).
 */
import "dotenv/config";

import { parseArgs } from "node:util";
import { createInterface } from "node:readline";

import { PrismaNeon } from "@prisma/adapter-neon";

import { PrismaClient } from "../src/generated/prisma/client";
import { connectionKinds, describeTarget, verifyWriteTarget } from "../src/server/db/identity";
import { hashPassword } from "../src/modules/staff/password";
import { isStaffRole } from "../src/modules/staff/roles";
import { staffPasswordSchema } from "../src/modules/staff/schemas";

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      write.call(rl, s.startsWith(question) ? question : "");
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  // Fail closed unless the endpoint and the server-reported branch match the expected target.
  const target = await verifyWriteTarget("staff-create", process.env, {
    connections: connectionKinds(process.env, "pooled"),
  });
  console.log(`staff:create: target ${describeTarget(target)}`);
  const url = process.env.DATABASE_URL!;

  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string", default: "OWNER" },
    },
  });
  const email = values.email?.trim().toLowerCase();
  if (!email || !values.name) throw new Error("--email and --name are required.");
  if (!isStaffRole(values.role))
    throw new Error("--role must be OWNER, MANAGER, SERVICE_ADVISOR or TECHNICIAN.");

  const password = process.env.STAFF_PASSWORD ?? (await promptHidden("Password (min 12 chars): "));
  const check = staffPasswordSchema.safeParse(password);
  if (!check.success) throw new Error(check.error.issues[0]?.message ?? "Invalid password");

  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
  try {
    const passwordHash = await hashPassword(password);
    const user = await db.staffUser.upsert({
      where: { email },
      create: { email, name: values.name, role: values.role, passwordHash },
      update: { name: values.name, role: values.role, passwordHash, active: true },
    });
    console.log(`Staff account ready: id=${user.id} role=${user.role}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Failed to create staff user");
  process.exit(1);
});
