/**
 * Create or update the singleton garage profile in the configured DEVELOPMENT database, writing an
 * `audit_logs` row in the same transaction.
 *
 *   npm run garage:profile -- --name "MAPESA GARAGE" --country TZ \
 *     --timezone Africa/Dar_es_Salaam --currency TZS
 *
 * Only the fields passed are set. Nothing is invented: optional contact and address fields stay
 * empty unless provided. Refuses production and any target whose identity cannot be verified (src/server/db/identity.ts).
 */
import "dotenv/config";

import { parseArgs } from "node:util";

import { PrismaNeon } from "@prisma/adapter-neon";
import { z } from "zod";

import { PrismaClient } from "../src/generated/prisma/client";
import { connectionKinds, describeTarget, verifyWriteTarget } from "../src/server/db/identity";

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  countryCode: z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2, upper-case"),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown IANA time zone"),
  currencyCode: z.string().regex(/^[A-Z]{3}$/, "ISO 4217, upper-case"),
  legalName: z.string().trim().min(1).max(200).optional(),
  contactPhoneE164: z
    .string()
    .regex(/^\+[1-9][0-9]{6,14}$/, "E.164")
    .optional(),
  contactEmail: z.email().max(254).optional(),
});

async function main() {
  // Fail closed unless the endpoint and the server-reported branch match the expected target.
  const target = await verifyWriteTarget("garage-profile", process.env, {
    connections: connectionKinds(process.env, "pooled"),
  });
  console.log(`garage:profile: target ${describeTarget(target)}`);
  const url = process.env.DATABASE_URL!;

  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      country: { type: "string" },
      timezone: { type: "string" },
      currency: { type: "string" },
      "legal-name": { type: "string" },
      phone: { type: "string" },
      email: { type: "string" },
    },
  });
  const input = profileSchema.parse({
    displayName: values.name,
    countryCode: values.country,
    timezone: values.timezone,
    currencyCode: values.currency,
    legalName: values["legal-name"],
    contactPhoneE164: values.phone,
    contactEmail: values.email,
  });

  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) });
  try {
    const result = await db.$transaction(async (tx) => {
      const before = await tx.garageProfile.findUnique({ where: { singleton: true } });
      const after = await tx.garageProfile.upsert({
        where: { singleton: true },
        create: input,
        update: input,
      });
      const changes: Record<string, { from: string | null; to: string | null }> = {};
      for (const key of Object.keys(input) as (keyof typeof input)[]) {
        const from = before?.[key] ?? null;
        const to = after[key] ?? null;
        if (from !== to) changes[key] = { from, to };
      }
      if (before && Object.keys(changes).length === 0) {
        return { id: after.id, created: false, changed: [] as string[] };
      }
      await tx.auditLog.create({
        data: {
          actorType: "SYSTEM",
          action: before ? "garage_profile.updated" : "garage_profile.created",
          entityType: "garage_profile",
          entityId: after.id,
          changes,
          metadata: { source: "scripts/set-garage-profile.ts" },
        },
      });
      return { id: after.id, created: !before, changed: Object.keys(changes) };
    });
    console.log(
      `Garage profile ${result.created ? "created" : "updated"}: id=${result.id} fields=${result.changed.join(",") || "(none)"}`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Failed to set garage profile");
  process.exit(1);
});
