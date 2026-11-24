import { CheckCircle2, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

/** Post-redirect notice (e.g. ?notice=created) and non-blocking warnings (?w=…). */
export function Notice({ message, warnings = [] }: { message?: string; warnings?: string[] }) {
  if (!message && warnings.length === 0) return null;
  return (
    <div className="space-y-2">
      {message ? (
        <Alert role="status">
          <CheckCircle2 aria-hidden />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {warnings.map((w) => (
        <Alert
          key={w}
          role="status"
          className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          <TriangleAlert aria-hidden />
          <AlertDescription className="text-inherit">{w}</AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
