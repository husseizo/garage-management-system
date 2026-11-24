import { expect, test } from "@playwright/test";

const DASHBOARD_ROUTES = [
  "/dashboard",
  "/dashboard/bookings",
  "/dashboard/calendar",
  "/dashboard/customers",
  "/dashboard/vehicles",
  "/dashboard/technicians",
  "/dashboard/service-bays",
  "/dashboard/reminders",
  "/dashboard/settings",
  "/dashboard/customers/new",
  "/dashboard/customers/018f0000-0000-7000-8000-000000000000",
  "/dashboard/vehicles/new",
  "/dashboard/vehicles/018f0000-0000-7000-8000-000000000000",
  "/dashboard/search",
];

for (const path of DASHBOARD_ROUTES) {
  test(`${path} rejects unauthenticated access`, async ({ request, page }) => {
    // HTTP layer: redirect, never a 200 with dashboard content.
    const res = await request.get(path, { maxRedirects: 0 });
    expect([302, 303, 307, 308]).toContain(res.status());
    const location = res.headers()["location"] ?? "";
    expect(location).toContain(`/login?callbackUrl=${encodeURIComponent(path)}`);

    // Browser: lands on the sign-in page.
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?callbackUrl=/);
    await expect(page.getByText("Staff sign in").first()).toBeVisible();
  });
}

test("forged session cookie is rejected", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  await context.addCookies([
    { name: "authjs.session-token", value: "forged.token.value", url: baseURL! },
  ]);
  const page = await context.newPage();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await context.close();
});

test("sign-in with invalid credentials shows a generic error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@garage.test");
  await page.getByLabel("Password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    /Incorrect email or password|unavailable/,
  );
  await expect(page).toHaveURL(/\/login/);
});

test("open-redirect callback is neutralised", async ({ page }) => {
  await page.goto("/login?callbackUrl=https://evil.example");
  const hidden = page.locator('input[name="callbackUrl"]');
  await expect(hidden).toHaveValue("/dashboard");
});
