import { Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Pagination } from "@/components/dashboard/pagination";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { selectClass } from "@/components/forms/field";
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
import { formatDate, formatPhone } from "@/i18n/format";
import { getIntlLocale, getTranslator } from "@/i18n/server";
import { listCustomersSchema } from "@/modules/customers/schemas";
import { listCustomers } from "@/modules/customers/service";
import { can } from "@/modules/staff/permissions";
import { requirePermission } from "@/server/auth/guards";
import { getGarageSettings } from "@/server/garage";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslator())("customers.title") };
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requirePermission("customer.read", { returnTo: "/dashboard/customers" });
  const raw = await searchParams;
  const params = listCustomersSchema.parse({
    q: typeof raw.q === "string" ? raw.q : undefined,
    kind: typeof raw.kind === "string" && raw.kind ? raw.kind : undefined,
    archived: typeof raw.archived === "string" ? raw.archived : undefined,
    page: typeof raw.page === "string" ? raw.page : undefined,
  });
  const [t, intl, garage, data] = await Promise.all([
    getTranslator(),
    getIntlLocale(),
    getGarageSettings(),
    listCustomers(actor, params),
  ]);
  const canCreate = can(actor.role, "customer.create");
  const filtered = params.q || params.kind || params.archived;
  const hrefFor = (page: number) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.kind) sp.set("kind", params.kind);
    if (params.archived) sp.set("archived", "on");
    sp.set("page", String(page));
    return `/dashboard/customers?${sp}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("customers.title")}
        description={t("customers.description")}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/dashboard/customers/new">
                <Plus aria-hidden /> {t("customers.new")}
              </Link>
            </Button>
          ) : null
        }
      />

      <form method="get" role="search" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <label htmlFor="q" className="text-sm font-medium">
            {t("customers.searchLabel")}
          </label>
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={params.q}
            placeholder={t("customers.searchPlaceholder")}
            maxLength={100}
          />
        </div>
        <div className="space-y-1.5 sm:w-44">
          <label htmlFor="kind" className="text-sm font-medium">
            {t("customers.kindFilter")}
          </label>
          <select id="kind" name="kind" defaultValue={params.kind ?? ""} className={selectClass}>
            <option value="">{t("common.all")}</option>
            <option value="INDIVIDUAL">{t("customers.kind.INDIVIDUAL")}</option>
            <option value="COMPANY">{t("customers.kind.COMPANY")}</option>
          </select>
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
          icon={Users}
          title={filtered ? t("customers.noResults") : t("customers.empty")}
          description={filtered ? undefined : t("customers.emptyBody")}
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("customers.columns.name")}</TableHead>
                <TableHead>{t("customers.columns.kind")}</TableHead>
                <TableHead>{t("customers.columns.phone")}</TableHead>
                <TableHead className="text-right">{t("customers.columns.vehicles")}</TableHead>
                <TableHead>{t("customers.columns.created")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link href={`/dashboard/customers/${c.id}`} className="hover:underline">
                      {c.displayName}
                    </Link>{" "}
                    {c.archived ? <Badge variant="outline">{t("common.archived")}</Badge> : null}
                  </TableCell>
                  <TableCell>{t(`customers.kind.${c.kind}`)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {c.primaryPhone ? formatPhone(c.primaryPhone) : t("common.none")}
                  </TableCell>
                  <TableCell className="text-right">{c.vehicleCount}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(c.createdAt, intl, garage.timezone)}
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
