import { expect, test, type Page } from "@playwright/test";

/**
 * Database-backed staff authentication. Runs only with E2E_DATABASE=1 and a test account in
 * `.env.e2e.local` (created with `npm run staff:create` on the DEVELOPMENT branch).
 */
const email = process.env.E2E_STAFF_EMAIL;
const password = process.env.E2E_STAFF_PASSWORD;
const name = process.env.E2E_STAFF_NAME ?? "";

test.skip(
  process.env.E2E_DATABASE !== "1" || !email || !password,
  "Requires E2E_DATABASE=1 and a development test staff account",
);

async function signIn(page: Page, callback = "/dashboard") {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(callback)}`);
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: /sign in/i }).click();
}

test("health endpoint reports a live database", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("ok");
  expect(body.checks.database.status).toBe("ok");
  expect(JSON.stringify(body)).not.toMatch(/postgres|neon\.tech|password/i);
});

test("wrong password is rejected with a generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(`${password}-wrong`);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(/invalid|incorrect/i);
  await expect(page).toHaveURL(/\/login/);
});

test("staff can sign in, open protected sections, and sign out", async ({ page }) => {
  await signIn(page, "/dashboard/settings");
  await expect(page).toHaveURL(/\/dashboard\/settings$/);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();

  await page.goto("/dashboard");
  const firstName = name.split(" ")[0] ?? "";
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`Welcome, ${firstName}`);
  await expect(page.getByText("Connected", { exact: false }).first()).toBeVisible();

  for (const path of ["/dashboard/bookings", "/dashboard/customers", "/dashboard/service-bays"]) {
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();
  await expect(page).not.toHaveURL(/\/dashboard/);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fdashboard/);
});
