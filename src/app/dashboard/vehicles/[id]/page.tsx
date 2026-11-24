import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ActionButton } from "@/components/dashboard/action-button";
import { ActivityTimeline } from "@/components/dashboard/activity-timeline";
import { Notice } from "@/components/dashboard/notice";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/i18n/format";
import { getIntlLocale, getTranslator } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translate";
import { can } from "@/modules/staff/permissions";
import { getVehicleDetail } from "@/modules/vehicles/service";
import { getActivity } from "@/server/activity";
import { requirePermission } from "@/server/auth/guards";
import { isAppError } from "@/server/errors/app-error";
import { getGarageSettings } from "@/server/garage";

import { archiveVehicleAction } from "../actions";
import { OwnershipPanel, RegistrationPanel } from "../_components/history-panels";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslator())("vehicles.title") };
}

const NOTICES: Record<string, MessageKey> = {
  created: "vehicles.created",
  updated: "vehicles.updated",
};
const WARNINGS: Record<string, MessageKey> = {
  vinCheckDigit: "vehicles.vinWarnings.checkDigit",
  plateUnusualFormat: "vehicles.plateWarnings.unusualFormat",
};

export default async function VehiclePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; w?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const actor = await requirePermission("vehicle.read", { returnTo: `/dashboard/vehicles/${id}` });
  const [t, intl, garage] = await Promise.all([
    getTranslator(),
    getIntlLocale(),
    getGarageSettings(),
  ]);
  const v = await getVehicleDetail(actor, id).catch((e) => {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const activity = can(actor.role, "activity.read")
    ? await getActivity(actor, { vehicleId: id })
    : null;
  const currentPlate = v.registrations.find((r) => !r.validTo)?.plate;
  const warnings = (sp.w ?? "")
    .split(",")
    .filter((w) => w in WARNINGS)
    .map((w) => t(WARNINGS[w]!));
  const fuel = v.fuelType ? t(`vehicles.fuel.${v.fuelType}`) : null;
  const rows: [string, string | number | null][] = [
    [t("vehicles.fields.vin"), v.vin],
    [t("vehicles.fields.chassisNumber"), v.chassisNumber],
    [t("vehicles.fields.modelYear"), v.modelYear],
    [t("vehicles.fields.fuelType"), fuel],
    [t("vehicles.fields.colour"), v.colour],
    [t("vehicles.fields.engineNumber"), v.engineNumber],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${currentPlate ?? t("vehicles.noPlate")} · ${v.make} ${v.model ?? ""}`}
        actions={
          <>
            {!v.archived && can(actor.role, "vehicle.update") ? (
              <Button asChild variant="outline">
                <Link href={`/dashboard/vehicles/${id}/edit`}>
                  <Pencil aria-hidden /> {t("common.edit")}
                </Link>
              </Button>
            ) : null}
            {!v.archived && can(actor.role, "vehicle.archive") ? (
              <ActionButton
                action={archiveVehicleAction}
                fields={{ id }}
                label={t("common.archive")}
                confirmText={t("vehicles.archiveConfirm")}
                size="default"
              />
            ) : null}
          </>
        }
      />
      <Notice
        message={sp.notice && NOTICES[sp.notice] ? t(NOTICES[sp.notice]!) : undefined}
        warnings={warnings}
      />
      {v.archived ? (
        <Alert>
          <AlertDescription>{t("vehicles.archivedNotice")}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("vehicles.details")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {rows.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className={label === t("vehicles.fields.vin") ? "font-mono" : undefined}>
                      {value ?? t("common.none")}
                    </dd>
                  </div>
                ))}
                <div className="text-muted-foreground sm:col-span-2">
                  {t("customers.createdBy", {
                    name: v.createdByName,
                    date: formatDate(v.createdAt, intl, garage.timezone),
                  })}
                </div>
              </dl>
            </CardContent>
          </Card>
          <RegistrationPanel
            vehicleId={id}
            timeZone={garage.timezone}
            canChange={!v.archived && can(actor.role, "vehicle.registration.change")}
            registrations={v.registrations.map((r) => ({
              id: r.id,
              plate: r.plate,
              validFrom: r.validFrom.toISOString(),
              validTo: r.validTo?.toISOString() ?? null,
            }))}
          />
          <OwnershipPanel
            vehicleId={id}
            timeZone={garage.timezone}
            canTransfer={!v.archived && can(actor.role, "vehicle.ownership.transfer")}
            ownerships={v.ownerships.map((o) => ({
              id: o.id,
              role: o.role,
              customerId: o.customerId,
              customerName: o.customerName,
              startedAt: o.startedAt.toISOString(),
              endedAt: o.endedAt?.toISOString() ?? null,
              source: o.source,
            }))}
          />
        </div>
        {activity ? (
          <ActivityTimeline items={activity} t={t} intlLocale={intl} timeZone={garage.timezone} />
        ) : null}
      </div>
    </div>
  );
}
