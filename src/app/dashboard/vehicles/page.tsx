import { Car, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Pagination } from "@/components/dashboard/pagination";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/i18n/format";
import { getIntlLocale, getTranslator } from "@/i18n/server";
import { can } from "@/modules/staff/permissions";
import { listVehiclesSchema } from "@/modules/vehicles/schemas";
import { listVehicles } from "@/modules/vehicles/service";
import { requirePermission } from "@/server/auth/guards";
import { getGarageSettings } from "@/server/garage";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslator())("vehicles.title") };
}

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("vehicle.read", { returnTo: "/dashboard/vehicles" });
  const raw = await searchParams;
  const params = listVehiclesSchema.parse({
    q: typeof raw.q === "string" ? raw.q : undefined,
    archived: typeof raw.archived === "string" ? raw.archived : undefined,
    page: typeof raw.page === "string" ? raw.page : undefined,
  });
  const [t, intl, garage, data] = await Promise.all([
    getTranslator(),
    getIntlLocale(),
    getGarageSettings(),
    listVehicles(actor, params),
  ]);
  const filtered = params.q || params.archived;
  const hrefFor = (page: number) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.archived) sp.set("archived", "on");
    sp.set("page", String(page));
    return `/dashboard/vehicles?${sp}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("vehicles.title")}
        description={t("vehicles.description")}
        actions={
          can(actor.role, "vehicle.create") ? (
            <Button asChild>
              <Link href="/dashboard/vehicles/new">
                <Plus aria-hidden /> {t("vehicles.new")}
              </Link>
            </Button>
          ) : null
        }
      />
      <form method="get" role="search" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="q" className="text-sm font-medium">
            {t("vehicles.searchLabel")}
          </label>
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={params.q}
            placeholder={t("vehicles.searchPlaceholder")}
            maxLength={100}
          />
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" name="archived" value="on" defaultChecked={params.archived} />
          {t("common.showArchived")}
        </label>
        <Button type="submit" variant="secondary">
          {t("common.search")}
        </Button>
      </form>
      {data.items.length === 0 ? (
        <EmptyState
          icon={Car}
          title={filtered ? t("vehicles.noResults") : t("vehicles.empty")}
          description={filtered ? undefined : t("vehicles.emptyBody")}
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("vehicles.columns.plate")}</TableHead>
                <TableHead>{t("vehicles.columns.vehicle")}</TableHead>
                <TableHead>{t("vehicles.columns.year")}</TableHead>
                <TableHead>{t("vehicles.columns.vin")}</TableHead>
                <TableHead>{t("vehicles.columns.owner")}</TableHead>
                <TableHead>{t("vehicles.columns.created")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono font-medium whitespace-nowrap">
                    <Link href={`/dashboard/vehicles/${v.id}`} className="hover:underline">
                      {v.plate ?? t("vehicles.noPlate")}
                    </Link>{" "}
                    {v.archived ? <Badge variant="outline">{t("common.archived")}</Badge> : null}
                  </TableCell>
                  <TableCell>
                    <Link href={`/dashboard/vehicles/${v.id}`} className="hover:underline">
                      {v.make} {v.model ?? ""}
                    </Link>
                  </TableCell>
                  <TableCell>{v.modelYear ?? t("common.none")}</TableCell>
                  <TableCell className="font-mono text-xs">{v.vin ?? t("common.none")}</TableCell>
                  <TableCell>
                    {v.ownerId ? (
                      <Link href={`/dashboard/customers/${v.ownerId}`} className="hover:underline">
                        {v.ownerName}
                      </Link>
                    ) : (
                      t("common.none")
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(v.createdAt, intl, garage.timezone)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={params.page}
            hasMore={data.hasMore}
            hrefFor={hrefFor}
            labels={{
              previous: t("common.previous"),
              next: t("common.next"),
              page: t("common.page", { page: params.page }),
            }}
          />
        </>
      )}
    </div>
  );
}
