import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { isStaffRole } from "@/modules/staff/roles";

import { env } from "../env";
import { logger } from "../logger";
import { authorizeStaff } from "./authorize";
import { LOGIN_PATH } from "./redirects";

const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // one working shift

/**
 * Auth.js configuration for garage staff.
 *
 * - Credentials provider backed by the `staff_users` table (scrypt hashes).
 * - Stateless JWT sessions in an encrypted, HttpOnly cookie; `role` is carried in the token.
 * - Customers do NOT authenticate here; customer access will use OTP verification (Phase 1+).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env().AUTH_SECRET,
  trustHost: env().AUTH_TRUST_HOST || env().NODE_ENV !== "production",
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: LOGIN_PATH, error: LOGIN_PATH },
  providers: [
    Credentials({
      credentials: { email: { type: "email" }, password: { type: "password" } },
      authorize: (credentials) => authorizeStaff(credentials),
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub && isStaffRole(token.role)) {
        session.user.id = token.sub;
        session.user.role = token.role;
      }
      return session;
    },
  },
  logger: {
    // Route Auth.js diagnostics through the redacting logger; never log raw credentials.
    error: (error) => logger.error({ event: "auth.error", errorName: error.name }, error.message),
    warn: (code) => logger.warn({ event: "auth.warn", code }, "auth warning"),
    debug: () => {},
  },
});
