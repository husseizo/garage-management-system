import { NextResponse } from "next/server";

import { checkDatabase } from "@/server/db/health";
import { withErrorHandling } from "@/server/errors/handle-route";

export const dynamic = "force-dynamic";

/**
 * GET /api/health — liveness plus database connectivity.
 * 200 when the app is up and the database is reachable (or not yet configured); 503 when the
 * database is configured but unreachable. Exposes no infrastructure details.
 */
export const GET = withErrorHandling(async () => {
  const database = await checkDatabase();
  const healthy = database.status !== "error";
  return NextResponse.json(
    {
      status: healthy ? (database.status === "ok" ? "ok" : "degraded") : "error",
      checks: { database },
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
});
