import "server-only";

import type { Prisma } from "@/generated/prisma/client";

import type { StaffSession } from "./auth/guards";

/**
 * Transactional audit writer (ADR 0012, business-rules §4.1). Always call with the transaction
 * client that performs the change, so the change and its audit row commit or roll back together.
 *
 * `changes` must come from `auditChanges()`, which applies an allow-list: fields are recorded by
 * value, masked, or only as "changed". Never pass raw input objects.
 */
type Tx = Prisma.TransactionClient;

export type AuditFieldPolicy = "value" | "mask-phone" | "mask-email" | "changed-only";
export type AuditChanges = Record<
  string,
  { from: string | null; to: string | null } | { changed: true }
>;

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  subjectCustomerId?: string | null;
  subjectVehicleId?: string | null;
  changes?: AuditChanges;
  metadata?: Record<string, string | number | boolean | null>;
}

export function maskPhone(e164: string | null | undefined): string | null {
  if (!e164) return null;
  if (e164.length <= 7) return "•".repeat(e164.length);
  return `${e164.slice(0, 5)}${"•".repeat(e164.length - 8)}${e164.slice(-3)}`;
}

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}

function present(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Build a redacted diff of `before` → `after` for the fields listed in `policy`. */
export function auditChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
  policy: Record<string, AuditFieldPolicy>,
): AuditChanges {
  const out: AuditChanges = {};
  for (const [field, rule] of Object.entries(policy)) {
    const from = present(before?.[field]);
    const to = present(after[field]);
    if (from === to) continue;
    if (rule === "changed-only") out[field] = { changed: true };
    else if (rule === "mask-phone") out[field] = { from: maskPhone(from), to: maskPhone(to) };
    else if (rule === "mask-email") out[field] = { from: maskEmail(from), to: maskEmail(to) };
    else out[field] = { from, to };
  }
  return out;
}

export async function recordAudit(tx: Tx, actor: StaffSession, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorType: "STAFF",
      actorStaffUserId: actor.id,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      subjectCustomerId: entry.subjectCustomerId ?? null,
      subjectVehicleId: entry.subjectVehicleId ?? null,
      changes: entry.changes && Object.keys(entry.changes).length ? entry.changes : undefined,
      metadata: entry.metadata,
    },
  });
}
