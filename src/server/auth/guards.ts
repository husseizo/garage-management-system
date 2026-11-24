import "server-only";

import { redirect } from "next/navigation";

import { can, type Permission } from "@/modules/staff/permissions";
import { hasRole, isStaffRole, type StaffRole } from "@/modules/staff/roles";

import { AppError } from "../errors/app-error";
import { auth } from "./auth";
import { LOGIN_PATH, STAFF_HOME } from "./redirects";

export interface StaffSession {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}

/** Read and validate the current staff session. Returns `null` when not signed in. */
export async function getStaffSession(): Promise<StaffSession | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !isStaffRole(user.role)) return null;
  return { id: user.id, name: user.name ?? "", email: user.email ?? "", role: user.role };
}

/**
 * Render-boundary guard for dashboard pages. Redirects to sign-in when unauthenticated, and back
 * to the dashboard home when the role is not permitted.
 */
export async function requireStaff(
  options: { roles?: readonly StaffRole[]; returnTo?: string } = {},
): Promise<StaffSession> {
  const staff = await getStaffSession();
  if (!staff) {
    const callback = options.returnTo ? `?callbackUrl=${encodeURIComponent(options.returnTo)}` : "";
    redirect(`${LOGIN_PATH}${callback}`);
  }
  if (!hasRole(staff.role, options.roles)) {
    redirect(`${STAFF_HOME}?denied=1`);
  }
  return staff;
}

/**
 * Data-boundary guard for server actions, route handlers and module services. Throws an
 * `AppError` instead of redirecting, so callers get a typed 401/403.
 */
export async function assertStaff(roles?: readonly StaffRole[]): Promise<StaffSession> {
  const staff = await getStaffSession();
  if (!staff) throw new AppError("UNAUTHENTICATED", "Please sign in to continue.");
  if (!hasRole(staff.role, roles)) {
    throw new AppError("FORBIDDEN", "You do not have permission to perform this action.");
  }
  return staff;
}

/** Page guard by permission: redirects like `requireStaff`, then checks the permission. */
export async function requirePermission(
  permission: Permission,
  options: { returnTo?: string } = {},
): Promise<StaffSession> {
  const staff = await requireStaff(options);
  if (!can(staff.role, permission)) redirect(`${STAFF_HOME}?denied=1`);
  return staff;
}

/** Data guard by permission for server actions and queries. Throws 401/403 `AppError`s. */
export async function assertPermission(permission: Permission): Promise<StaffSession> {
  const staff = await assertStaff();
  if (!can(staff.role, permission)) {
    throw new AppError("FORBIDDEN", "You do not have permission to perform this action.");
  }
  return staff;
}
