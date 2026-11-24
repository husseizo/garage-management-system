"use client";

import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

/** Label + control + hint + translated errors, wired with aria attributes. */
export function Field({
  id,
  label,
  hint,
  errors,
  optional,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  errors?: string[];
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const t = useT();
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {optional ? (
          <span className="text-muted-foreground font-normal"> ({t("common.optional")})</span>
        ) : null}
      </Label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
      {errors?.length ? (
        <p id={`${id}-error`} className="text-destructive text-xs" role="alert">
          {errors.map((e) => t.dynamic(e, e)).join(" ")}
        </p>
      ) : null}
    </div>
  );
}

/** aria props for a control rendered inside <Field>. */
export function fieldAria(id: string, errors?: string[], hint?: boolean) {
  const describedBy = [hint ? `${id}-hint` : null, errors?.length ? `${id}-error` : null].filter(
    Boolean,
  );
  return {
    id,
    "aria-invalid": errors?.length ? true : undefined,
    "aria-describedby": describedBy.length ? describedBy.join(" ") : undefined,
  } as const;
}

export const selectClass =
  "border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:border-destructive";

export const textareaClass =
  "border-input bg-transparent dark:bg-input/30 min-h-20 w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";
