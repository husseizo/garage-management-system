/**
 * Application error taxonomy. Errors carry a stable `code` and an HTTP status, and a public
 * message that is safe to show to users. Internal details belong in `cause`, which is logged
 * server-side and never serialised to clients.
 */
export type AppErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL";

const STATUS: Record<AppErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly status: number;
  readonly details?: Record<string, string[]>;

  constructor(
    readonly code: AppErrorCode,
    readonly publicMessage: string,
    options: { cause?: unknown; details?: Record<string, string[]> } = {},
  ) {
    super(publicMessage, { cause: options.cause });
    this.name = "AppError";
    this.status = STATUS[code];
    this.details = options.details;
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
