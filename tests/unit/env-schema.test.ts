import { describe, expect, it } from "vitest";

import { EnvValidationError, parseServerEnv } from "@/server/env-schema";

describe("parseServerEnv", () => {
  it("applies defaults and treats empty database URLs as unconfigured", () => {
    const env = parseServerEnv({ NODE_ENV: "development", DATABASE_URL: "", DIRECT_URL: "" });
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.DIRECT_URL).toBeUndefined();
    expect(env.AUTH_TRUST_HOST).toBe(false);
  });

  it("accepts a postgres connection string", () => {
    const env = parseServerEnv({
      DATABASE_URL: "postgresql://u:p@ep-x-pooler.eu-central-1.aws.neon.tech/db?sslmode=require",
    });
    expect(env.DATABASE_URL).toMatch(/^postgresql:/);
  });

  it("rejects a non-postgres database URL", () => {
    expect(() => parseServerEnv({ DATABASE_URL: "mysql://u:p@host/db" })).toThrow(
      EnvValidationError,
    );
  });

  it("requires AUTH_SECRET in production", () => {
    expect(() => parseServerEnv({ NODE_ENV: "production" })).toThrow(/AUTH_SECRET/);
  });

  it("rejects short secrets", () => {
    expect(() => parseServerEnv({ AUTH_SECRET: "short" })).toThrow(/at least 32/);
  });

  it("never includes variable values in the error message", () => {
    const secretish = "mysql://admin:SuperSecretPassword@host/db";
    try {
      parseServerEnv({ DATABASE_URL: secretish });
      expect.unreachable();
    } catch (error) {
      expect(String((error as Error).message)).not.toContain("SuperSecretPassword");
    }
  });
});
