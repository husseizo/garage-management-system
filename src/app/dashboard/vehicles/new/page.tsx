import type { Metadata } from "next";
import { z } from "zod";

import { PageHeader } from "@/components/layout/page-header";
import { getTranslator } from "@/i18n/server";
import { getCustomerDetail } from "@/modules/customers/service";
import { can } from "@/modules/staff/permissions";
import { requirePermission } from "@/server/auth/guards";

import { VehicleForm } from "../_components/vehicle-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslator())("vehicles.newTitle") };
}

export default async function NewVehiclePage({
  searchParams,
}: {
  searchParams: Promise<{ ownerId?: string }>;
}) {
  const actor = await requirePermission("vehicle.create", { returnTo: "/dashboard/vehicles/new" });
  const [t, { ownerId }] = await Promise.all([getTranslator(), searchParams]);
  const canSetOwner = can(actor.role, "vehicle.ownership.transfer");
  let owner: { id: string; displayName: string } | null = null;
  if (canSetOwner && ownerId && z.uuid().safeParse(ownerId).success) {
    const c = await getCustomerDetail(actor, ownerId).catch(() => null);
    if (c && !c.archived) owner = { id: c.id, displayName: c.displayName };
  }
  return (
    <div className="space-y-6">
      <PageHeader title={t("vehicles.newTitle")} />
      <VehicleForm mode="create" owner={owner} canSetOwner={canSetOwner} />
    </div>
  );
}
