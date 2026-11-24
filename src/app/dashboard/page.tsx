import { CheckCircle2, CircleDashed, ShieldAlert, XCircle } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslator } from "@/i18n/server";
import type { MessageKey } from "@/i18n/translate";
import { requireStaff } from "@/server/auth/guards";
import { checkDatabase, type DatabaseHealth } from "@/server/db/health";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslator())("nav.items.overview") };
}

const DB_STATUS: Record<
  DatabaseHealth["status"],
  { label: MessageKey; icon: typeof CheckCircle2 }
> = {
  ok: { label: "overview.dbOk", icon: CheckCircle2 },
  unconfigured: { label: "overview.dbUnconfigured", icon: CircleDashed },
  error: { label: "overview.dbError", icon: XCircle },
};

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const [staff, { denied }, database, t] = await Promise.all([
    requireStaff({ returnTo: "/dashboard" }),
    searchParams,
    checkDatabase(),
    getTranslator(),
  ]);
  const db = DB_STATUS[database.status];
  const firstName = staff.name ? staff.name.split(" ")[0] : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title={firstName ? t("overview.welcomeName", { name: firstName }) : t("overview.welcome")}
        description={t("overview.description")}
      />

      {denied ? (
        <Alert variant="destructive">
          <ShieldAlert aria-hidden />
          <AlertTitle>{t("overview.accessDenied")}</AlertTitle>
          <AlertDescription>{t("overview.accessDeniedBody")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>{t("overview.signedInAs")}</CardDescription>
            <CardTitle className="text-base">{staff.name || staff.email}</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary">{t(`roles.${staff.role}`)}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("overview.database")}</CardDescription>
            <CardTitle className="flex items-center gap-2 text-base">
              <db.icon className="size-4" aria-hidden />
              {t(db.label)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {database.status === "ok"
              ? t("overview.dbLatency", { ms: database.latencyMs })
              : t("overview.dbSeeHealth")}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("overview.today")}</CardDescription>
            <CardTitle className="text-base">{t("overview.noData")}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {t("overview.todayBody")}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
