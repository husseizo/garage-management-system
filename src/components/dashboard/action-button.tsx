"use client";

import { useActionState } from "react";

import { FormStatus, SubmitButton } from "@/components/forms/form-status";
import type { ActionState } from "@/app/dashboard/_lib/action-state";

/**
 * A one-button form bound to a server action, with optional browser confirmation and inline
 * status. Hidden fields carry ids; the server re-validates everything.
 */
export function ActionButton({
  action,
  fields,
  label,
  confirmText,
  variant = "outline",
  size = "sm",
  showStatus = true,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: string;
  confirmText?: string;
  variant?: "default" | "outline" | "secondary" | "destructive" | "ghost";
  size?: "default" | "sm";
  showStatus?: boolean;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
      className="inline-flex flex-col gap-2"
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant} size={size}>
        {label}
      </SubmitButton>
      {showStatus && state.ok === false ? <FormStatus state={state} /> : null}
    </form>
  );
}
