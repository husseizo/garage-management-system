import type { Metadata } from "next";

import { ADMIN_ROLES } from "@/modules/staff/roles";
import { requireStaff } from "@/server/auth/guards";

import { SectionPage } from "../_components/section-page";

export const metadata: Metadata = { title: "Settings" };

export default async function Page() {
  await requireStaff({ returnTo: "/dashboard/settings", roles: ADMIN_ROLES });
  return <SectionPage section="settings" />;
}
