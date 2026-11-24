import type { Metadata } from "next";

import { requireStaff } from "@/server/auth/guards";

import { SectionPage } from "../_components/section-page";

export const metadata: Metadata = { title: "Calendar" };

export default async function Page() {
  await requireStaff({ returnTo: "/dashboard/calendar" });
  return <SectionPage section="calendar" />;
}
