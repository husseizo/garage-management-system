/**
 * Extract the PostgreSQL error code and constraint name from a Prisma/driver-adapter error.
 * Services map known constraints to i18n validation keys (ADR 0009: constraint names are API).
 */
export interface PgErrorInfo {
  code?: string;
  constraint?: string;
}

export function pgErrorInfo(error: unknown): PgErrorInfo {
  const seen = new Set<unknown>();
  let node: unknown = error;
  while (node && typeof node === "object" && !seen.has(node)) {
    seen.add(node);
    const e = node as {
      code?: unknown;
      originalCode?: unknown;
      constraint?: unknown;
      message?: unknown;
      originalMessage?: unknown;
      meta?: { driverAdapterError?: { cause?: unknown } };
      cause?: unknown;
    };
    const cause = e.meta?.driverAdapterError?.cause as
      | {
          originalCode?: string;
          code?: string;
          constraint?: string;
          originalMessage?: string;
          message?: string;
        }
      | undefined;
    const code =
      cause?.originalCode ??
      cause?.code ??
      (typeof e.originalCode === "string" ? e.originalCode : undefined);
    if (code && /^[0-9A-Z]{5}$/.test(code)) {
      const message = cause?.originalMessage ?? cause?.message ?? "";
      const constraint = cause?.constraint ?? /constraint "([^"]+)"/.exec(message)?.[1];
      return { code, constraint };
    }
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code) && !e.code.startsWith("P")) {
      const constraint =
        typeof e.constraint === "string"
          ? e.constraint
          : /constraint "([^"]+)"/.exec(String(e.message ?? ""))?.[1];
      return { code: e.code, constraint };
    }
    node = e.cause;
  }
  return {};
}
