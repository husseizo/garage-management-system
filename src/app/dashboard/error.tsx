"use client";

import { ErrorState } from "@/components/states/error-state";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState reset={reset} digest={error.digest} />;
}
