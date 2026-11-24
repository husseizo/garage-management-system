import type { Metadata } from "next";

import { ADMIN_ROLES } from "@/modules/staff/roles";
import { requireStaff } from "@/server/auth/guards";

import { SectionPage, sectionTitle } from "../_components/section-page";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await sectionTitle("settings") };
}

export default async function Page() {
  await requireStaff({ returnTo: "/dashboard/settings", roles: ADMIN_ROLES });
  return <SectionPage section="settings" />;
}
