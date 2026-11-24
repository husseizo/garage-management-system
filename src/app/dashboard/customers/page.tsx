import type { Metadata } from "next";

import { requireStaff } from "@/server/auth/guards";

import { SectionPage } from "../_components/section-page";

export const metadata: Metadata = { title: "Customers" };

export default async function Page() {
  await requireStaff({ returnTo: "/dashboard/customers" });
  return <SectionPage section="customers" />;
}
