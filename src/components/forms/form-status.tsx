"use client";

import { AlertCircle, CheckCircle2, TriangleAlert } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

/** Top-of-form status: error message (translated key), success, and non-blocking warnings. */
export function FormStatus({
  state,
  successKey,
}: {
  state: { ok?: boolean; message?: string; warnings?: string[] };
  successKey?: string;
}) {
  const t = useT();
  return (
    <>
      {state.ok === false && state.message ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle aria-hidden />
          <AlertDescription>{t.dynamic(state.message, state.message)}</AlertDescription>
        </Alert>
      ) : null}
      {state.ok && successKey ? (
        <Alert role="status">
          <CheckCircle2 aria-hidden />
          <AlertDescription>{t.dynamic(successKey, successKey)}</AlertDescription>
        </Alert>
      ) : null}
      {state.warnings?.map((w) => (
        <Alert key={w} role="status">
          <TriangleAlert aria-hidden />
          <AlertDescription>{t.dynamic(w, w)}</AlertDescription>
        </Alert>
      ))}
    </>
  );
}

export function SubmitButton({
  children,
  variant,
  size,
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "outline" | "secondary" | "destructive" | "ghost";
  size?: "default" | "sm";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} variant={variant} size={size} className={className}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </Button>
  );
}
