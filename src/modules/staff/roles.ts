/**
 * Staff roles. Mirrors the `StaffRole` enum in `prisma/schema.prisma`; kept as a plain union here so
 * that role logic can be used (and tested) without a generated Prisma client.
 */
export const STAFF_ROLES = ["OWNER", "MANAGER", "SERVICE_ADVISOR", "TECHNICIAN"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABELS: Record<StaffRole, string> = {
  OWNER: "Owner",
  MANAGER: "Workshop manager",
  SERVICE_ADVISOR: "Service advisor",
  TECHNICIAN: "Technician",
};

/** Roles allowed to administer garage-wide settings. */
export const ADMIN_ROLES: readonly StaffRole[] = ["OWNER", "MANAGER"];

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

export function hasRole(role: StaffRole, allowed?: readonly StaffRole[]): boolean {
  return !allowed || allowed.length === 0 || allowed.includes(role);
}
