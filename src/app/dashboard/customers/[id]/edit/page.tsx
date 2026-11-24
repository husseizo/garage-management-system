import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { PageHeader } from "@/components/layout/page-header";
import { getTranslator } from "@/i18n/server";
import { getCustomerDetail } from "@/modules/customers/service";
import { requirePermission } from "@/server/auth/guards";
import { isAppError } from "@/server/errors/app-error";

import { CustomerForm } from "../../_components/customer-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslator())("customers.editTitle") };
}

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const actor = await requirePermission("customer.update", {
    returnTo: `/dashboard/customers/${id}/edit`,
  });
  const t = await getTranslator();
  const c = await getCustomerDetail(actor, id).catch((e) => {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  if (c.archived) redirect(`/dashboard/customers/${id}`);
  return (
    <div className="space-y-6">
      <PageHeader title={t("customers.editTitle")} description={c.displayName} />
      <CustomerForm
        mode="edit"
        initial={{
          id: c.id,
          updatedAt: c.updatedAt.toISOString(),
          kind: c.kind,
          givenName: c.givenName,
          familyName: c.familyName,
          companyName: c.companyName,
          taxId: c.taxId,
          preferredLanguage: c.preferredLanguage,
          notes: c.notes,
        }}
      />
    </div>
  );
}
