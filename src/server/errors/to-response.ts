import { ZodError } from "zod";

import { AppError, isAppError } from "./app-error";

export interface ErrorBody {
  error: { code: string; message: string; details?: Record<string, string[]>; requestId?: string };
}

/**
 * Convert any thrown value into a safe, public error shape. Unknown errors become a generic 500
 * so stack traces, SQL, and connection strings never reach the client.
 */
export function toPublicError(error: unknown): { status: number; body: ErrorBody } {
  if (isAppError(error)) {
    return {
      status: error.status,
      body: { error: { code: error.code, message: error.publicMessage, details: error.details } },
    };
  }
  if (error instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const key = issue.path.join(".") || "_";
      (details[key] ??= []).push(issue.message);
    }
    return {
      status: 400,
      body: { error: { code: "VALIDATION_FAILED", message: "The request is invalid.", details } },
    };
  }
  return {
    status: 500,
    body: { error: { code: "INTERNAL", message: "Something went wrong. Please try again." } },
  };
}

export { AppError };
