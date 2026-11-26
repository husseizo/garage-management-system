import { describe, expect, it } from "vitest";

import {
  assertWritableTarget,
  isProductionBranchName,
  resolveMigrationUrl,
  UnsafeDatabaseTargetError,
} from "@/server/db/target";

const POOLED =
  "postgresql://u:secret-pw@ep-a-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";
const DIRECT = "postgresql://u:secret-pw@ep-a.eu-central-1.aws.neon.tech/neondb?sslmode=require";

describe("resolveMigrationUrl", () => {
  it("returns an empty string when no direct URL is configured", () => {
    expect(resolveMigrationUrl({})).toBe("");
  });

  it("never falls back to the pooled DATABASE_URL", () => {
    expect(resolveMigrationUrl({ DATABASE_URL: POOLED })).toBe("");
  });

  it("uses DATABASE_URL_UNPOOLED as written by neon env pull", () => {
    expect(resolveMigrationUrl({ DATABASE_URL_UNPOOLED: DIRECT })).toBe(DIRECT);
  });

  it("prefers DIRECT_URL when both are set", () => {
    const other = DIRECT.replace("ep-a.", "ep-b.");
    expect(resolveMigrationUrl({ DIRECT_URL: other, DATABASE_URL_UNPOOLED: DIRECT })).toBe(other);
  });

  it("rejects a pooled host for migrations without echoing the URL", () => {
    try {
      resolveMigrationUrl({ DIRECT_URL: POOLED });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(UnsafeDatabaseTargetError);
      expect(String(error)).not.toContain("secret-pw");
    }
  });
});

describe("assertWritableTarget", () => {
  it("allows a development branch", () => {
    expect(() => assertWritableTarget({ NEON_BRANCH: "development" }, "migrate")).not.toThrow();
  });

  it.each(["production", "Production", " main ", "prod"])("refuses branch %j", (name) => {
    expect(() => assertWritableTarget({ NEON_BRANCH: name }, "migrate")).toThrow(
      UnsafeDatabaseTargetError,
    );
  });

  it("refuses NODE_ENV=production", () => {
    expect(() => assertWritableTarget({ NODE_ENV: "production" }, "migrate")).toThrow(/NODE_ENV/);
  });

  it.each([undefined, "", "   "])("fails closed when NEON_BRANCH is %j", (name) => {
    expect(() => assertWritableTarget({ NEON_BRANCH: name }, "migrate")).toThrow(/not set/);
  });

  it("allows production only with the explicit owner override", () => {
    expect(() =>
      assertWritableTarget(
        { NEON_BRANCH: "production", ALLOW_PRODUCTION_DB_WRITES: "true" },
        "migrate",
      ),
    ).not.toThrow();
    expect(() =>
      assertWritableTarget(
        { NEON_BRANCH: "production", ALLOW_PRODUCTION_DB_WRITES: "1" },
        "migrate",
      ),
    ).toThrow();
  });

  it("detects production branch names", () => {
    expect(isProductionBranchName("development")).toBe(false);
    expect(isProductionBranchName(undefined)).toBe(false);
  });
});
