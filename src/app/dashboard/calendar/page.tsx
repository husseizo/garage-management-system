import type { Metadata } from "next";

import { requireStaff } from "@/server/auth/guards";

import { SectionPage, sectionTitle } from "../_components/section-page";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await sectionTitle("calendar") };
}

export default async function Page() {
  await requireStaff({ returnTo: "/dashboard/calendar" });
  return <SectionPage section="calendar" />;
}
