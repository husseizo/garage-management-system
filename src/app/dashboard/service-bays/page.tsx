import type { Metadata } from "next";

import { requireStaff } from "@/server/auth/guards";

import { SectionPage } from "../_components/section-page";

export const metadata: Metadata = { title: "Service bays" };

export default async function Page() {
  await requireStaff({ returnTo: "/dashboard/service-bays" });
  return <SectionPage section="serviceBays" />;
}
