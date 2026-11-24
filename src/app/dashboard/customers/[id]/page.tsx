import { Car, Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ActionButton } from "@/components/dashboard/action-button";
import { ActivityTimeline } from "@/components/dashboard/activity-timeline";
import { Notice } from "@/components/dashboard/notice";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/i18n/format";
import { getIntlLocale, getTranslator } from "@/i18n/server";
import { getCustomerDetail } from "@/modules/customers/service";
import { can } from "@/modules/staff/permissions";
import { getActivity } from "@/server/activity";
import { requirePermission } from "@/server/auth/guards";
import { isAppError } from "@/server/errors/app-error";
import { getGarageSettings } from "@/server/garage";

import { setArchivedAction } from "../actions";
import { ContactsCard } from "../_components/contacts-card";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslator())("customers.title") };
}

const NOTICES = { created: "customers.created", updated: "customers.updated" } as const;

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const [{ id }, { notice }] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const actor = await requirePermission("customer.read", {
    returnTo: `/dashboard/customers/${id}`,
  });
  const [t, intl, garage] = await Promise.all([
    getTranslator(),
    getIntlLocale(),
    getGarageSettings(),
  ]);
  const c = await getCustomerDetail(actor, id).catch((e) => {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const activity = can(actor.role, "activity.read")
    ? await getActivity(actor, { customerId: id })
    : null;
  const current = c.vehicles.filter((v) => !v.endedAt);
  const previous = c.vehicles.filter((v) => v.endedAt);
  const noticeKey = notice && notice in NOTICES ? NOTICES[notice as keyof typeof NOTICES] : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={c.displayName}
        description={t(`customers.kind.${c.kind}`)}
        actions={
          <>
            {!c.archived && can(actor.role, "customer.update") ? (
              <Button asChild variant="outline">
                <Link href={`/dashboard/customers/${id}/edit`}>
                  <Pencil aria-hidden /> {t("common.edit")}
                </Link>
              </Button>
            ) : null}
            {can(actor.role, "customer.archive") ? (
              <ActionButton
                action={setArchivedAction}
                fields={{ id, archived: c.archived ? "false" : "true" }}
                label={c.archived ? t("common.restore") : t("common.archive")}
                confirmText={c.archived ? undefined : t("customers.archiveConfirm")}
                size="default"
              />
            ) : null}
          </>
        }
      />
      <Notice message={noticeKey ? t(noticeKey) : undefined} />
      {c.archived ? (
        <Alert>
          <AlertDescription>{t("customers.archivedNotice")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("customers.details")}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {c.kind === "COMPANY" ? (
                  <div>
                    <dt className="text-muted-foreground">{t("customers.fields.taxId")}</dt>
                    <dd>{c.taxId ?? t("common.none")}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-muted-foreground">
                    {t("customers.fields.preferredLanguage")}
                  </dt>
                  <dd>{c.preferredLanguage === "en" ? t("locale.en") : t("locale.sw")}</dd>
                </div>
                {c.notes && can(actor.role, "customer.update") ? (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">{t("customers.fields.notes")}</dt>
                    <dd className="whitespace-pre-wrap">{c.notes}</dd>
                  </div>
                ) : null}
                <div className="text-muted-foreground sm:col-span-2">
                  {t("customers.createdBy", {
                    name: c.createdByName,
                    date: formatDate(c.createdAt, intl, garage.timezone),
                  })}
                </div>
              </dl>
            </CardContent>
          </Card>

          <ContactsCard
            customerId={id}
            contacts={c.contacts}
            canManage={can(actor.role, "customer.contacts.manage")}
            isCompany={c.kind === "COMPANY"}
            archived={c.archived}
          />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Car className="size-4" aria-hidden /> {t("customers.vehicles.title")}
              </CardTitle>
              {!c.archived &&
              can(actor.role, "vehicle.create") &&
              can(actor.role, "vehicle.ownership.transfer") ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/dashboard/vehicles/new?ownerId=${id}`}>
                    <Plus aria-hidden /> {t("customers.vehicles.addVehicle")}
                  </Link>
                </Button>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {c.vehicles.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("customers.vehicles.empty")}</p>
              ) : null}
              {[
                { label: t("customers.vehicles.current"), rows: current },
                { label: t("customers.vehicles.previous"), rows: previous },
              ].map((group) =>
                group.rows.length ? (
                  <div key={group.label}>
                    <h3 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                      {group.label}
                    </h3>
                    <ul className="divide-y">
                      {group.rows.map((v) => (
                        <li
                          key={v.ownershipId}
                          className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                        >
                          <Link
                            href={`/dashboard/vehicles/${v.vehicleId}`}
                            className="font-medium hover:underline"
                          >
                            {v.plate ?? t("vehicles.noPlate")} · {v.make} {v.model ?? ""}{" "}
                            {v.modelYear ?? ""}
                          </Link>
                          <span className="text-muted-foreground text-xs">
                            <Badge variant="outline">{t(`customers.vehicles.role${v.role}`)}</Badge>{" "}
                            {formatDate(v.startedAt, intl, garage.timezone)} –{" "}
                            {v.endedAt
                              ? formatDate(v.endedAt, intl, garage.timezone)
                              : t("vehicles.ownership.present")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null,
              )}
            </CardContent>
          </Card>
        </div>
        {activity ? (
          <ActivityTimeline items={activity} t={t} intlLocale={intl} timeZone={garage.timezone} />
        ) : null}
      </div>
    </div>
  );
}
