import { expect, test as setup } from "@playwright/test";

import { OWNER_STATE, TECH_STATE } from "./support/auth-state";

/** Saves signed-in sessions for the DEVELOPMENT test owner and technician (DB mode only). */

const accounts = [
  {
    state: OWNER_STATE,
    email: process.env.E2E_STAFF_EMAIL,
    password: process.env.E2E_STAFF_PASSWORD,
  },
  { state: TECH_STATE, email: process.env.E2E_TECH_EMAIL, password: process.env.E2E_TECH_PASSWORD },
];

for (const account of accounts) {
  setup(`sign in ${account.state}`, async ({ page }) => {
    setup.skip(
      process.env.E2E_DATABASE !== "1" || !account.email || !account.password,
      "DB mode only",
    );
    await page.goto("/login");
    await page.getByLabel("Email").fill(account.email!);
    await page.getByLabel("Password").fill(account.password!);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.context().storageState({ path: account.state });
  });
}
