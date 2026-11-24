import type { Metadata } from "next";

import { requireStaff } from "@/server/auth/guards";

import { SectionPage } from "../_components/section-page";

export const metadata: Metadata = { title: "Reminders" };

export default async function Page() {
  await requireStaff({ returnTo: "/dashboard/reminders" });
  return <SectionPage section="reminders" />;
}
