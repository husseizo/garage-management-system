import type { z } from "zod";

import { AppError } from "./errors/app-error";

/**
 * Standard input-validation entry point for server actions and route handlers. All external input
 * (form data, JSON bodies, search params) must pass through a Zod schema before use.
 */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      (details[key] ??= []).push(issue.message);
    }
    throw new AppError("VALIDATION_FAILED", "Please check the highlighted fields.", { details });
  }
  return result.data;
}
