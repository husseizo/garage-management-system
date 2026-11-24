import type { StaffRole } from "./roles";

/**
 * Code-defined permission matrix (Phase 1B plan §E). Every server action, query and route checks a
 * permission, never a role directly. Phase 1D seeds the database RBAC tables from this matrix.
 */
export const PERMISSIONS = [
  "customer.read",
  "customer.contacts.read",
  "customer.create",
  "customer.update",
  "customer.contacts.manage",
  "customer.archive",
  "vehicle.read",
  "vehicle.create",
  "vehicle.update",
  "vehicle.registration.change",
  "vehicle.ownership.transfer",
  "vehicle.archive",
  "activity.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ADVISOR_AND_UP: readonly StaffRole[] = ["OWNER", "MANAGER", "SERVICE_ADVISOR"];
const MANAGEMENT: readonly StaffRole[] = ["OWNER", "MANAGER"];
const ALL_STAFF: readonly StaffRole[] = ["OWNER", "MANAGER", "SERVICE_ADVISOR", "TECHNICIAN"];

export const PERMISSION_MATRIX: Record<Permission, readonly StaffRole[]> = {
  "customer.read": ALL_STAFF, // TECHNICIAN: names only; contact values need customer.contacts.read
  "customer.contacts.read": ADVISOR_AND_UP,
  "customer.create": ADVISOR_AND_UP,
  "customer.update": ADVISOR_AND_UP,
  "customer.contacts.manage": ADVISOR_AND_UP,
  "customer.archive": MANAGEMENT,
  "vehicle.read": ALL_STAFF,
  "vehicle.create": ADVISOR_AND_UP,
  "vehicle.update": ADVISOR_AND_UP,
  "vehicle.registration.change": ADVISOR_AND_UP,
  "vehicle.ownership.transfer": ADVISOR_AND_UP,
  "vehicle.archive": MANAGEMENT,
  "activity.read": ADVISOR_AND_UP,
};

export function can(role: StaffRole, permission: Permission): boolean {
  return PERMISSION_MATRIX[permission].includes(role);
}

/** Every permission the role holds — handy for passing capability flags to UI components. */
export function permissionsFor(role: StaffRole): ReadonlySet<Permission> {
  return new Set(PERMISSIONS.filter((p) => can(role, p)));
}
