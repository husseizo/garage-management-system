import { expect, test } from "@playwright/test";

/** Staff sign-in is rate-limited per email (default 10 per 15 minutes). DB mode only. */
test("repeated failed sign-ins are rate-limited with a generic message", async ({ page }, info) => {
  test.skip(
    process.env.E2E_DATABASE !== "1" || info.project.name !== "chromium",
    "DB mode, chromium only",
  );
  test.setTimeout(120_000);
  const email = `nobody-${Date.now()}@example.test`;
  const attempt = async () => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("definitely-wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toBeVisible();
    return alert;
  };
  for (let i = 1; i <= 10; i++) {
    await expect(await attempt()).toContainText("Incorrect email or password.");
  }
  // The 11th attempt is refused before the password is even checked.
  await expect(await attempt()).toContainText("Too many sign-in attempts");
});
