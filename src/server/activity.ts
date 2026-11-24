import "server-only";

import { can } from "@/modules/staff/permissions";

import type { StaffSession } from "./auth/guards";
import { getDb } from "./db/client";
import { AppError } from "./errors/app-error";

export interface ActivityItem {
  id: string;
  occurredAt: Date;
  action: string;
  actorName: string | null;
  /** Field names that changed (values are not exposed in the timeline). */
  fields: string[];
}

/**
 * Activity timeline for a customer or vehicle, read from `audit_logs` (subject columns, Phase 1B).
 * Shows who did what and when; changed field names only — redacted values stay in the audit log.
 */
export async function getActivity(
  actor: StaffSession,
  subject: { customerId: string } | { vehicleId: string },
  limit = 50,
): Promise<ActivityItem[]> {
  if (!can(actor.role, "activity.read")) throw new AppError("FORBIDDEN", "errors.forbidden");
  const rows = await getDb().auditLog.findMany({
    where:
      "customerId" in subject
        ? { subjectCustomerId: subject.customerId }
        : { subjectVehicleId: subject.vehicleId },
    orderBy: { occurredAt: "desc" },
    take: limit,
    select: {
      id: true,
      occurredAt: true,
      action: true,
      changes: true,
      actorStaffUser: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    occurredAt: r.occurredAt,
    action: r.action,
    actorName: r.actorStaffUser?.name ?? null,
    fields:
      r.changes && typeof r.changes === "object" && !Array.isArray(r.changes)
        ? Object.keys(r.changes)
        : [],
  }));
}
