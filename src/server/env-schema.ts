import { z } from "zod";

/**
 * Schema for server-side environment variables. Kept free of `server-only` so it can be unit
 * tested directly; application code must import `env()` from `@/server/env` instead.
 *
 * Optional values are features that degrade gracefully when not yet configured (e.g. the database
 * before Neon credentials are supplied). Required values fail fast at startup.
 */
const optionalUrl = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .pipe(z.url({ protocol: /^postgres(ql)?$/ }).optional())
  .optional();

export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    /** Pooled Neon connection string used by the application at runtime. */
    DATABASE_URL: optionalUrl,
    /** Direct (unpooled) Neon connection string used by Prisma migrations (legacy name). */
    DIRECT_URL: optionalUrl,
    /** Direct (unpooled) Neon connection string as written by `neon env pull`. */
    DATABASE_URL_UNPOOLED: optionalUrl,
    /** Neon branch the connection strings belong to (written by `neon env pull`). */
    NEON_BRANCH: z.string().trim().optional(),

    /** Auth.js secret used to encrypt session tokens. Generate with `npx auth secret`. */
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters").optional(),
    AUTH_URL: z.url().optional(),
    AUTH_TRUST_HOST: z
      .enum(["true", "false"])
      .optional()
      .transform((v) => v === "true"),

    /** Staff sign-in attempts allowed per 15 minutes, per email and per client IP. */
    AUTH_RATE_LIMIT_PER_EMAIL: z.coerce.number().int().min(1).max(1000).default(10),
    AUTH_RATE_LIMIT_PER_IP: z.coerce.number().int().min(1).max(100000).default(50),

    /** Set by Next.js; secrets are not needed while compiling, only when serving requests. */
    NEXT_PHASE: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (
      val.NODE_ENV === "production" &&
      val.NEXT_PHASE !== "phase-production-build" &&
      !val.AUTH_SECRET
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_SECRET"],
        message: "AUTH_SECRET is required in production",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: { path: string; message: string }[]) {
    // Only variable names and rule messages — never values — appear in the error.
    super(
      `Invalid environment configuration:\n${issues.map((i) => `  - ${i.path}: ${i.message}`).join("\n")}`,
    );
    this.name = "EnvValidationError";
  }
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((i) => ({ path: i.path.join(".") || "(root)", message: i.message })),
    );
  }
  return result.data;
}
