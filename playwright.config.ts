import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

/**
 * E2E_DATABASE=1 runs the suite against the Neon DEVELOPMENT branch configured in `.env`, and
 * loads the local-only test staff account from `.env.e2e.local` (both git-ignored). Without it the
 * suite needs no database and the signed-in tests are skipped.
 */
const withDatabase = process.env.E2E_DATABASE === "1";
if (withDatabase) {
  loadEnv({ path: ".env", quiet: true });
  loadEnv({ path: ".env.e2e.local", quiet: true });
  if (/^(production|prod|main)$/i.test(process.env.NEON_BRANCH ?? "")) {
    throw new Error("E2E_DATABASE=1 refuses to run against a production Neon branch.");
  }
}

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * End-to-end tests run against a production build (`next build && next start`) so they exercise
 * the same proxy, headers and rendering as a deployment.
 */
export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    // Signs in the test owner and technician once and saves their sessions (DB mode only).
    { name: "auth-setup", testMatch: /auth\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["auth-setup"] },
    { name: "mobile", use: { ...devices["Pixel 7"] }, dependencies: ["auth-setup"] },
  ],
  webServer: {
    command: `npm run start -- --port ${PORT} --hostname 127.0.0.1`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-only-secret-not-for-production-use-0000",
      AUTH_TRUST_HOST: "true",
      NODE_ENV: "production",
      DATABASE_URL: withDatabase ? (process.env.DATABASE_URL ?? "") : "",
      DIRECT_URL: "",
      DATABASE_URL_UNPOOLED: "",
      NEON_BRANCH: withDatabase ? (process.env.NEON_BRANCH ?? "") : "",
      // All E2E traffic comes from 127.0.0.1, so the per-IP limit is raised; the per-email limit
      // keeps its production default and is exercised by tests/e2e/rate-limit.spec.ts.
      AUTH_RATE_LIMIT_PER_IP: "10000",
    },
  },
});
