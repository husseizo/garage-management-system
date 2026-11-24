import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPhone } from "@/i18n/format";
import { getTranslator } from "@/i18n/server";
import { listCustomers } from "@/modules/customers/service";
import { can } from "@/modules/staff/permissions";
import { listVehicles } from "@/modules/vehicles/service";
import { requireStaff } from "@/server/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslator())("search.title") };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const actor = await requireStaff({ returnTo: "/dashboard/search" });
  const [t, sp] = await Promise.all([getTranslator(), searchParams]);
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 100);
  const ready = q.length >= 2;
  const [customers, vehicles] = ready
    ? await Promise.all([
        can(actor.role, "customer.read")
          ? listCustomers(actor, { q, archived: false, page: 1 })
          : null,
        can(actor.role, "vehicle.read")
          ? listVehicles(actor, { q, archived: false, page: 1 })
          : null,
      ])
    : [null, null];

  return (
    <div className="space-y-6">
      <PageHeader
        title={ready ? t("search.resultsFor", { q }) : t("search.title")}
        description={t("search.description")}
      />
      {!ready ? <p className="text-muted-foreground text-sm">{t("search.tooShort")}</p> : null}
      {ready ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {customers ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("search.customers")}</CardTitle>
              </CardHeader>
              <CardContent>
                {customers.items.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("search.none")}</p>
                ) : (
                  <ul className="divide-y">
                    {customers.items.slice(0, 10).map((c) => (
                      <li key={c.id} className="flex justify-between gap-2 py-2 text-sm">
                        <Link
                          href={`/dashboard/customers/${c.id}`}
                          className="font-medium hover:underline"
                        >
                          {c.displayName}
                        </Link>
                        <span className="text-muted-foreground">
                          {t(`customers.kind.${c.kind}`)}
                          {c.primaryPhone ? ` · ${formatPhone(c.primaryPhone)}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
          {vehicles ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("search.vehicles")}</CardTitle>
              </CardHeader>
              <CardContent>
                {vehicles.items.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{t("search.none")}</p>
                ) : (
                  <ul className="divide-y">
                    {vehicles.items.slice(0, 10).map((v) => (
                      <li key={v.id} className="flex justify-between gap-2 py-2 text-sm">
                        <Link
                          href={`/dashboard/vehicles/${v.id}`}
                          className="font-mono font-medium hover:underline"
                        >
                          {v.plate ?? t("vehicles.noPlate")}
                        </Link>
                        <span className="text-muted-foreground">
                          {v.make} {v.model ?? ""}
                          {v.ownerName ? ` · ${v.ownerName}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
