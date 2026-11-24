import { Construction } from "lucide-react";

import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";

/**
 * Honest placeholder for modules that are not built yet. Never renders sample or fake records.
 */
export function ModulePlaceholder({
  module,
  plannedCapabilities,
}: {
  module: string;
  plannedCapabilities: string[];
}) {
  return (
    <EmptyState
      icon={Construction}
      title={`${module} is not available yet`}
      description={
        <div className="space-y-4">
          <p>
            This area is part of the foundation build. No records are shown because none exist yet.
          </p>
          <div className="text-left">
            <p className="text-foreground mb-2 text-xs font-medium tracking-wide uppercase">
              Planned
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {plannedCapabilities.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
      }
    >
      <Badge variant="secondary">Coming in a later phase</Badge>
    </EmptyState>
  );
}
