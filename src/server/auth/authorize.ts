import "server-only";

import { verifyPassword } from "@/modules/staff/password";
import { isStaffRole, type StaffRole } from "@/modules/staff/roles";
import { staffSignInSchema } from "@/modules/staff/schemas";

import { getDb, isDatabaseConfigured } from "../db/client";
import { logger } from "../logger";

export interface AuthorizedStaff {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
}

// A valid hash of a random value, verified when the account does not exist so that response time
// does not reveal whether an email is registered.
const DUMMY_HASH =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

/**
 * Verify staff credentials. Returns `null` for any failure; the reason is logged server-side
 * without the submitted email or password.
 */
export async function authorizeStaff(raw: unknown): Promise<AuthorizedStaff | null> {
  const parsed = staffSignInSchema.safeParse(raw);
  if (!parsed.success) return null;

  if (!isDatabaseConfigured()) {
    logger.warn({ event: "auth.signin.unavailable" }, "staff sign-in attempted without database");
    return null;
  }

  const db = getDb();
  const user = await db.staffUser.findUnique({ where: { email: parsed.data.email } });
  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !ok || !user.active || !isStaffRole(user.role)) {
    logger.info({ event: "auth.signin.rejected" }, "staff sign-in rejected");
    return null;
  }

  await db.staffUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  logger.info({ event: "auth.signin.success", staffId: user.id }, "staff signed in");
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
