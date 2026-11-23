import "server-only";

import { parseServerEnv, type ServerEnv } from "./env-schema";

/**
 * Validated server-side configuration.
 *
 * Importing this module from a Client Component fails the build (`server-only`), so secrets can
 * never be bundled for the browser. Values are parsed once, lazily, on first access.
 */
let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
