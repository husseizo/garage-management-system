import { redirect } from "next/navigation";

import { signOut } from "@/server/auth/auth";
import { resolveStaffSession } from "@/server/auth/guards";
import { SESSION_ENDED_LOGIN, STAFF_HOME } from "@/server/auth/redirects";

/**
 * Landing point for a session cookie whose staff record is no longer valid (deactivated, deleted,
 * or without a valid role — ADR 0016 Step 1). Clears the cookie and shows the sign-in page with
 * "your session has ended".
 *
 * A still-valid session is NOT signed out (so a link to this URL cannot log people out); it goes
 * back to the dashboard. If the check itself fails, the cookie is cleared (fail closed).
 */
export async function GET(): Promise<Response> {
  const state = await resolveStaffSession().catch(() => null);
  if (state?.status === "active") redirect(STAFF_HOME);
  await signOut({ redirectTo: SESSION_ENDED_LOGIN });
  // signOut redirects by throwing; this line is never reached.
  redirect(SESSION_ENDED_LOGIN);
}
