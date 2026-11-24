import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { getTranslator } from "@/i18n/server";
import { requirePermission } from "@/server/auth/guards";

import { CustomerForm } from "../_components/customer-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslator())("customers.newTitle") };
}

export default async function NewCustomerPage() {
  await requirePermission("customer.create", { returnTo: "/dashboard/customers/new" });
  const t = await getTranslator();
  return (
    <div className="space-y-6">
      <PageHeader title={t("customers.newTitle")} />
      <CustomerForm mode="create" />
    </div>
  );
}
