import { isAppError } from "@/server/errors/app-error";
import { logger } from "@/server/logger";

/**
 * Serializable result of a dashboard server action. All strings are i18n keys; the client
 * translates them. Never contains stack traces or database details.
 */
export interface ActionState {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
  warnings?: string[];
  duplicates?: {
    id: string;
    displayName: string;
    kind: "INDIVIDUAL" | "COMPANY";
    reasons: string[];
  }[];
  /** Echo of submitted values so forms can re-render after a server-side error. */
  values?: Record<string, string>;
}

const CODE_KEYS: Record<string, string> = {
  FORBIDDEN: "errors.forbidden",
  UNAUTHENTICATED: "errors.unauthenticated",
  NOT_FOUND: "errors.notFound",
  CONFLICT: "errors.conflict",
  RATE_LIMITED: "errors.rateLimited",
  VALIDATION_FAILED: "errors.validation",
};

export function toActionState(error: unknown, values?: Record<string, string>): ActionState {
  if (isAppError(error)) {
    const isKey = /^[a-z]+(\.[A-Za-z0-9_]+)+$/.test(error.publicMessage);
    return {
      ok: false,
      message: isKey ? error.publicMessage : (CODE_KEYS[error.code] ?? "common.unknownError"),
      fieldErrors: error.details,
      values,
    };
  }
  logger.error({ event: "dashboard.action.failed", err: error }, "dashboard action failed");
  return { ok: false, message: "common.unknownError", values };
}

/** FormData → plain string record (files ignored). */
export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries())
    if (typeof v === "string" && !k.startsWith("$")) out[k] = v;
  return out;
}

/** Re-throw Next.js control-flow errors (redirect/notFound) so they are not swallowed. */
export function isNextControlFlow(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR"))
  );
}
