import type { DefaultSession } from "next-auth";

import type { StaffRole } from "@/modules/staff/roles";

declare module "next-auth" {
  interface User {
    role?: StaffRole;
  }
  interface Session {
    user: { id: string; role: StaffRole } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: StaffRole;
  }
}
