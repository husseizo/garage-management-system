import { CheckCircle2, CircleDashed, ShieldAlert, XCircle } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/modules/staff/roles";
import { requireStaff } from "@/server/auth/guards";
import { checkDatabase, type DatabaseHealth } from "@/server/db/health";

export const metadata: Metadata = { title: "Overview" };

const DB_STATUS: Record<DatabaseHealth["status"], { label: string; icon: typeof CheckCircle2 }> = {
  ok: { label: "Connected", icon: CheckCircle2 },
  unconfigured: { label: "Not configured", icon: CircleDashed },
  error: { label: "Unreachable", icon: XCircle },
};

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const [staff, { denied }, database] = await Promise.all([
    requireStaff({ returnTo: "/dashboard" }),
    searchParams,
    checkDatabase(),
  ]);
  const db = DB_STATUS[database.status];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome${staff.name ? `, ${staff.name.split(" ")[0]}` : ""}`}
        description="Workshop overview. Operational figures will appear here once bookings and scheduling are live."
      />

      {denied ? (
        <Alert variant="destructive">
          <ShieldAlert aria-hidden />
          <AlertTitle>Access denied</AlertTitle>
          <AlertDescription>Your role does not have access to that page.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Signed in as</CardDescription>
            <CardTitle className="text-base">{staff.name || staff.email}</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="secondary">{ROLE_LABELS[staff.role]}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Database</CardDescription>
            <CardTitle className="flex items-center gap-2 text-base">
              <db.icon className="size-4" aria-hidden />
              {db.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {database.status === "ok"
              ? `Responded in ${database.latencyMs} ms.`
              : "See /api/health for status."}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Today&apos;s workshop</CardDescription>
            <CardTitle className="text-base">No data yet</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Appointments, bay utilisation and pending requests will show here when scheduling is
            enabled.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
