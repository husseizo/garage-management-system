import { expect, test, type Page } from "@playwright/test";

import { setStaffState } from "./support/staff-db";

/**
 * S-1 / ADR 0016 Step 1: deactivation and role changes take effect on the NEXT request, without
 * waiting for the session token to expire. Uses a dedicated ephemeral account (E2E_REVOKE_*,
 * created by CI on ci-testing) so the shared owner/technician sessions are not affected.
 * DB mode, desktop Chromium, serial.
 */
const email = process.env.E2E_REVOKE_EMAIL;
const password = process.env.E2E_REVOKE_PASSWORD;

test.describe("session revocation (S-1 step 1)", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: { cookies: [], origins: [] } });
  test.skip(
    process.env.E2E_DATABASE !== "1" || !email || !password,
    "Requires E2E_DATABASE=1 and the E2E_REVOKE_* test account",
  );
  test.beforeEach(({ browserName: _browser }, info) => {
    test.skip(info.project.name !== "chromium", "chromium only");
  });
  test.afterAll(async () => {
    // Leave the account usable for the next run whatever happened.
    if (process.env.E2E_DATABASE === "1" && email) {
      await setStaffState(email, { active: true, role: "MANAGER" });
    }
  });

  async function signIn(page: Page) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password").fill(password!);
    await page.getByRole("button", { name: /sign in/i }).click();
  }

  test("a role change applies on the next request", async ({ page }) => {
    await setStaffState(email!, { active: true, role: "MANAGER" });
    await signIn(page);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/dashboard/customers/new");
    await expect(page).toHaveURL(/\/dashboard\/customers\/new$/);
    await expect(page.getByLabel("First name")).toBeVisible();

    // Downgrade while signed in: the same cookie no longer opens a MANAGER-only screen.
    await setStaffState(email!, { role: "TECHNICIAN" });
    await page.goto("/dashboard/customers/new");
    await expect(page).toHaveURL(/\/dashboard\?denied=1/);
  });

  test("deactivation ends the session on the next request", async ({ page }) => {
    await setStaffState(email!, { active: true, role: "MANAGER" });
    await signIn(page);
    await expect(page).toHaveURL(/\/dashboard$/);

    await setStaffState(email!, { active: false });
    await page.goto("/dashboard/customers");
    // Cookie cleared via /session-ended, no redirect loop, clear message.
    await expect(page).toHaveURL(/\/login\?ended=1$/);
    await expect(page.getByRole("status")).toContainText("Your session has ended");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fdashboard$/);

    // A deactivated account cannot sign in again.
    await signIn(page);
    await expect(page.locator("main").getByRole("alert")).toContainText(/incorrect/i);

    // Reactivated: a NEW sign-in is required, and works.
    await setStaffState(email!, { active: true });
    await signIn(page);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("/session-ended does not sign out a valid session", async ({ page }) => {
    await setStaffState(email!, { active: true, role: "MANAGER" });
    await signIn(page);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/session-ended");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/dashboard/customers");
    await expect(page).toHaveURL(/\/dashboard\/customers$/);
  });
});
