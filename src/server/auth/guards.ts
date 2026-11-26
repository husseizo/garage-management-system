import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { can, type Permission } from "@/modules/staff/permissions";
import { hasRole, isStaffRole, type StaffRole } from "@/modules/staff/roles";

import { getDb, isDatabaseConfigured } from "../db/client";
import { AppError } from "../errors/app-error";
import { logger } from "../logger";
import { auth } from "./auth";
import { LOGIN_PATH, SESSION_ENDED_PATH, STAFF_HOME } from "./redirects";

export interface StaffSession {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}

/**
 * - `anonymous`: no session cookie;
 * - `ended`: a valid cookie whose staff member no longer exists, is deactivated or has no valid
 *   role — the cookie must be cleared (see `/session-ended`);
 * - `active`: identity, name and role as currently stored in `staff_users`.
 */
export type StaffSessionState =
  { status: "anonymous" } | { status: "ended" } | { status: "active"; staff: StaffSession };

/**
 * One primary-key read per staff id and request (React `cache`). Fails closed: a database error
 * throws SERVICE_UNAVAILABLE and never falls back to the data in the token.
 */
const loadStaffUser = cache(async (id: string) => {
  if (!isDatabaseConfigured()) return null;
  try {
    return await getDb().staffUser.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
  } catch (error) {
    logger.error(
      { event: "auth.session.lookup_failed", errorName: error instanceof Error ? error.name : "" },
      "staff session lookup failed",
    );
    throw new AppError("SERVICE_UNAVAILABLE", "Sign-in cannot be verified right now.");
  }
});

/**
 * Resolve the current request's staff session against the database (ADR 0016 Step 1). The token
 * only identifies WHO signed in; whether they are still active, and their role, name and email,
 * always come from `staff_users`, so deactivation and role changes apply on the next request.
 */
export const resolveStaffSession = cache(async (): Promise<StaffSessionState> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return { status: "anonymous" };
  const user = await loadStaffUser(id);
  if (!user || !user.active || !isStaffRole(user.role)) {
    logger.info({ event: "auth.session.ended", staffId: id }, "staff session no longer valid");
    return { status: "ended" };
  }
  return {
    status: "active",
    staff: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
});

/** The current staff member, verified against the database. `null` when not (or no longer) valid. */
export async function getStaffSession(): Promise<StaffSession | null> {
  const state = await resolveStaffSession();
  return state.status === "active" ? state.staff : null;
}

/**
 * Render-boundary guard for dashboard pages. Redirects to sign-in when unauthenticated, to
 * `/session-ended` (which clears the cookie) when the staff record is no longer valid, and back to
 * the dashboard home when the role is not permitted.
 */
export async function requireStaff(
  options: { roles?: readonly StaffRole[]; returnTo?: string } = {},
): Promise<StaffSession> {
  const state = await resolveStaffSession();
  if (state.status === "anonymous") {
    const callback = options.returnTo ? `?callbackUrl=${encodeURIComponent(options.returnTo)}` : "";
    redirect(`${LOGIN_PATH}${callback}`);
  }
  // Not /login: the proxy would send a still-present cookie straight back to the dashboard.
  if (state.status === "ended") redirect(SESSION_ENDED_PATH);
  if (!hasRole(state.staff.role, options.roles)) {
    redirect(`${STAFF_HOME}?denied=1`);
  }
  return state.staff;
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
