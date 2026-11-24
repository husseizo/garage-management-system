import "server-only";

import pino, { type DestinationStream, type Logger } from "pino";

/**
 * Structured JSON logger for server code.
 *
 * Sensitive fields are redacted by path so that accidental logging of credentials, tokens or
 * personal data does not leak into log storage. Add paths here as new sensitive fields appear.
 */
export const REDACT_PATHS = [
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "secret",
  "authorization",
  "cookie",
  "email",
  "phone",
  "*.password",
  "*.passwordHash",
  "*.token",
  "*.secret",
  "*.authorization",
  "*.cookie",
  "*.email",
  "*.phone",
  "req.headers.authorization",
  "req.headers.cookie",
  "databaseUrl",
  "DATABASE_URL",
  "DIRECT_URL",
];

export function createLogger(
  options: { level?: string; destination?: DestinationStream } = {},
): Logger {
  return pino(
    {
      level: options.level ?? process.env.LOG_LEVEL ?? "info",
      base: { service: "gms" },
      redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    options.destination,
  );
}

export const logger = createLogger();
