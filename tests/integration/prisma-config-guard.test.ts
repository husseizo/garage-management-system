import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

/**
 * Runs the real Prisma CLI with `prisma.config.ts` to prove the guard cannot be skipped by typing
 * `npx prisma …` directly (ADR 0017, G-2). Needs no database: every child process gets a fully
 * controlled environment pointing at an UNREGISTERED placeholder endpoint, so the guard must refuse
 * before any connection is attempted. Values are set (even empty) so `.env` cannot fill them in.
 */
const prismaBin = createRequire(import.meta.url).resolve("prisma/build/index.js");
const PLACEHOLDER = (pooled: boolean) =>
  `postgresql://nobody:placeholder@ep-guard-test-000000${pooled ? "-pooler" : ""}.c-9.eu-central-1.aws.neon.tech/neondb?sslmode=require`;

function prisma(...args: string[]) {
  const r = spawnSync(process.execPath, [prismaBin, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 60_000,
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      CI: "1",
      PRISMA_HIDE_UPDATE_MESSAGE: "1",
      NODE_ENV: "test",
      NEON_BRANCH: "development",
      NEON_BRANCH_ID: "",
      DATABASE_URL: PLACEHOLDER(true),
      DATABASE_URL_UNPOOLED: PLACEHOLDER(false),
      DIRECT_URL: "",
      DB_EXPECTED_BRANCH_ID: "",
      DB_EXPECTED_ENDPOINT_ID: "",
      ALLOW_PRODUCTION_DB_WRITES: "",
      CONFIRM_PRODUCTION_BRANCH_ID: "",
    },
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

describe("prisma.config.ts guard (real CLI, no database)", () => {
  it.each([
    [["migrate", "deploy"], /not a registered target/],
    [["migrate", "resolve", "--applied", "20990101000000_x"], /not a registered target/],
    [["db", "execute", "--stdin"], /not a registered target/],
    [["migrate", "reset", "--force"], /resets are not allowed/],
    [["db", "push", "--accept-data-loss"], /schema pushes are not allowed/],
  ])(
    "refuses `prisma %s` before connecting",
    (args, message) => {
      const { status, out } = prisma(...args);
      expect(status).not.toBe(0);
      expect(out).toMatch(message);
      expect(out).not.toContain("placeholder@");
      // The guard fails while loading the config — Prisma never reaches the datasource.
      expect(out).not.toMatch(/Datasource "db"|P1001|Can't reach database/);
    },
    90_000,
  );

  it("leaves read-only commands working without a database", () => {
    const { status, out } = prisma("validate");
    expect(out).toMatch(/is valid/);
    expect(status).toBe(0);
  }, 90_000);
});
