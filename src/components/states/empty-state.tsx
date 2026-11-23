import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center",
        className,
      )}
    >
      {Icon ? (
        <span className="bg-muted text-muted-foreground grid size-12 place-items-center rounded-full">
          <Icon className="size-6" aria-hidden />
        </span>
      ) : null}
      <h2 className="text-base font-semibold">{title}</h2>
      {description ? (
        <div className="text-muted-foreground max-w-md text-sm">{description}</div>
      ) : null}
      {children ? <div className="mt-2 flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}
