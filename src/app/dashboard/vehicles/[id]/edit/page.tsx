import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { PageHeader } from "@/components/layout/page-header";
import { getTranslator } from "@/i18n/server";
import { getVehicleDetail } from "@/modules/vehicles/service";
import { requirePermission } from "@/server/auth/guards";
import { isAppError } from "@/server/errors/app-error";

import { VehicleForm } from "../../_components/vehicle-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslator())("vehicles.editTitle") };
}

export default async function EditVehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const actor = await requirePermission("vehicle.update", {
    returnTo: `/dashboard/vehicles/${id}/edit`,
  });
  const t = await getTranslator();
  const v = await getVehicleDetail(actor, id).catch((e) => {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  if (v.archived) redirect(`/dashboard/vehicles/${id}`);
  return (
    <div className="space-y-6">
      <PageHeader title={t("vehicles.editTitle")} description={`${v.make} ${v.model ?? ""}`} />
      <VehicleForm
        mode="edit"
        initial={{
          id: v.id,
          updatedAt: v.updatedAt.toISOString(),
          vin: v.vinRaw,
          chassisNumber: v.chassisNumber,
          make: v.make,
          model: v.model,
          modelYear: v.modelYear,
          fuelType: v.fuelType,
          colour: v.colour,
          engineNumber: v.engineNumber,
        }}
      />
    </div>
  );
}
