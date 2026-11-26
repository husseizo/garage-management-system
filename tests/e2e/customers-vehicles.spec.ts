import { expect, test, type Page } from "@playwright/test";

import { OWNER_STATE, TECH_STATE } from "./support/auth-state";

/**
 * Phase 1B end-to-end flows against the Neon DEVELOPMENT branch (E2E_DATABASE=1).
 * Records are clearly marked "E2E <run>" test data; they are never presented as real customers.
 * Runs on desktop Chromium only to avoid duplicating data; a mobile smoke test follows.
 */
const DB = process.env.E2E_DATABASE === "1";
const run = Date.now().toString(36).slice(-5).toUpperCase();
const digits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const letters = (n: number) =>
  Array.from({ length: n }, () => "ABCDEFGHJKLMNPRSTUVWXYZ"[Math.floor(Math.random() * 23)]).join(
    "",
  );
const phone6 = digits(6);
const phoneLocal = `0754 ${phone6.slice(0, 3)} ${phone6.slice(3)}`;
const phoneShown = `+255 754 ${phone6.slice(0, 3)} ${phone6.slice(3)}`;
const nameA = `E2E Asha ${run}`;
const nameB = `E2E Baraka ${run}`;
const company = `E2E Kilimo ${run} Ltd`;
const tin = digits(9);
const vin = `E2E${letters(4)}${digits(10)}`; // valid characters; check digit almost certainly off
const plate1 = `E2E${run}`; // unusual format → warning only
const plate2 = `T${digits(3)}${letters(3)}`;

const urls: Record<string, string> = {};

/** Save the customer form; if earlier E2E runs trigger a similar-name warning, confirm it. */
async function saveCustomer(page: Page) {
  await page.getByRole("button", { name: "Save" }).click();
  // Either the customer is saved, or earlier test data triggers a duplicate warning to confirm.
  // Wait for whichever happens (no fixed sleep: saves can be slow on a cold branch).
  const confirm = page.getByLabel("This is a different customer — save anyway");
  const outcome = await Promise.race([
    page.waitForURL(/notice=created/, { timeout: 20_000 }).then(() => "created" as const),
    confirm.waitFor({ state: "visible", timeout: 20_000 }).then(() => "duplicate" as const),
  ]);
  if (outcome === "duplicate") {
    await confirm.check();
    await page.getByRole("button", { name: "Save" }).click();
  }
  await expect(page).toHaveURL(/notice=created/, { timeout: 20_000 });
}

async function pickCustomer(page: Page, label: RegExp | string, name: string) {
  const box = page.getByRole("combobox", { name: label });
  await box.fill(name);
  await page.getByRole("option", { name: new RegExp(name) }).click();
  await expect(page.getByText(`Selected: ${name}`)).toBeVisible();
}

test.describe("customers and vehicles (owner)", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: DB ? OWNER_STATE : { cookies: [], origins: [] } });
  test.skip(!DB, "DB mode only");
  test.beforeEach(({ browserName: _browser }, info) => {
    test.skip(info.project.name !== "chromium", "chromium only");
  });

  test("creates an individual customer; local phone is stored as E.164", async ({ page }) => {
    await page.goto("/dashboard/customers/new");
    await page.getByLabel("First name").fill(nameA);
    await page.getByLabel("Last name").fill("Test");
    await page.getByLabel("Phone").fill(phoneLocal);
    await saveCustomer(page);
    await expect(page).toHaveURL(/\/dashboard\/customers\/[0-9a-f-]{36}\?notice=created/);
    urls.a = page.url().split("?")[0]!;
    await expect(page.getByText("Customer created.")).toBeVisible();
    await expect(page.getByRole("link", { name: phoneShown })).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Activity" }).getByText("Customer created"),
    ).toBeVisible();
  });

  test("warns about a possible duplicate (shared phone) and saves after confirmation", async ({
    page,
  }) => {
    await page.goto("/dashboard/customers/new");
    await page.getByLabel("First name").fill(nameB);
    await page.getByLabel("Phone").fill(phoneShown);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Possible duplicate customers")).toBeVisible();
    await expect(page.getByRole("link", { name: `${nameA} Test` })).toBeVisible();
    await page.getByLabel("This is a different customer — save anyway").check();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/notice=created/);
    urls.b = page.url().split("?")[0]!;
    await expect(
      page.getByText("This number is also recorded for 1 other customer(s)."),
    ).toBeVisible();
  });

  test("creates a company customer with an optional TIN", async ({ page }) => {
    await page.goto("/dashboard/customers/new");
    await page.getByLabel("Company").check();
    await page.getByLabel("Company name").fill(company);
    await page.getByLabel(/TIN/).fill(`${tin.slice(0, 3)}-${tin.slice(3, 6)}-${tin.slice(6)}`);
    await saveCustomer(page);
    urls.company = page.url().split("?")[0]!;
    await expect(page.getByText(tin, { exact: true })).toBeVisible();
  });

  test("rejects an invalid VIN, then registers the vehicle with warnings and an owner", async ({
    page,
  }) => {
    await page.goto("/dashboard/vehicles/new");
    await page.getByLabel("Registration number").fill(plate1);
    await page.getByLabel("VIN").fill("1M8GDM9AXKP04278O");
    await page.getByLabel("Make").fill("Toyota");
    await page.getByLabel("Model").fill("Hilux");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(/never contains I, O or Q/)).toBeVisible();

    await page.getByLabel("VIN").fill(vin);
    await pickCustomer(page, "Owner", `${nameA} Test`);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/dashboard\/vehicles\/[0-9a-f-]{36}\?notice=created/);
    urls.vehicle = page.url().split("?")[0]!;
    await expect(page.getByText("Vehicle created.")).toBeVisible();
    await expect(page.getByText(/does not match the usual Tanzanian format/)).toBeVisible();
    await expect(page.getByRole("link", { name: `${nameA} Test` })).toBeVisible();
  });

  test("a duplicate VIN is rejected", async ({ page }) => {
    await page.goto("/dashboard/vehicles/new");
    await page.getByLabel("VIN").fill(vin);
    await page.getByLabel("Make").fill("Toyota");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Another vehicle already has this VIN.")).toBeVisible();
  });

  test("changing the registration keeps the history", async ({ page }) => {
    await page.goto(urls.vehicle!);
    await page.getByRole("button", { name: "Change registration" }).click();
    await page.getByLabel("Registration number").fill(plate2);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Registration updated.")).toBeVisible();
    await expect(page.getByText(plate1, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(plate2);
  });

  test("ownership transfer records history without double owners", async ({ page }) => {
    await page.goto(urls.vehicle!);
    await page.getByRole("button", { name: "Transfer ownership" }).click();
    await pickCustomer(page, "New owner", nameB);
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Ownership transferred.")).toBeVisible();
    await page.reload();
    const history = page
      .getByText("Ownership history")
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    await expect(history.getByRole("link", { name: nameB })).toBeVisible();
    await expect(history.getByRole("link", { name: `${nameA} Test` })).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Activity" }).getByText("Ownership transferred"),
    ).toBeVisible();

    await page.goto(urls.a!);
    await expect(page.getByText("Previously owned")).toBeVisible();
    await page.goto(urls.b!);
    await expect(page.getByText("Current", { exact: true })).toBeVisible();
  });

  test("a stale transfer form is rejected (no unauthorised or concurrent overwrite)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ storageState: OWNER_STATE });
    const p1 = await ctx.newPage();
    const p2 = await ctx.newPage();
    await p1.goto(urls.vehicle!);
    await p2.goto(urls.vehicle!);
    for (const p of [p1, p2]) await p.getByRole("button", { name: "Transfer ownership" }).click();
    await pickCustomer(p1, "New owner", company);
    await p1.getByRole("button", { name: "Confirm" }).click();
    await expect(p1.getByText("Ownership transferred.")).toBeVisible();
    await pickCustomer(p2, "New owner", `${nameA} Test`);
    await p2.getByRole("button", { name: "Confirm" }).click();
    await expect(
      p2.getByText(/Another ownership change was recorded at the same time/),
    ).toBeVisible();
    await ctx.close();
  });

  test("global search finds vehicles by plate and customers by local phone format", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page
      .getByRole("searchbox", { name: "Search customers and vehicles" })
      .fill(plate2.toLowerCase());
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/dashboard\/search\?q=/);
    await expect(page.getByRole("link", { name: plate2 })).toBeVisible();
    await page.goto(`/dashboard/search?q=${encodeURIComponent(phoneLocal)}`);
    await expect(page.getByRole("link", { name: `${nameA} Test` })).toBeVisible();
    await expect(page.getByRole("link", { name: nameB })).toBeVisible();
  });

  test("switches the dashboard to Kiswahili and back to English", async ({ page }) => {
    await page.goto("/dashboard/customers");
    await page.getByRole("button", { name: "Kiswahili" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Wateja" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Magari" }).first()).toBeVisible();
    await page.getByRole("button", { name: "English" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Customers" })).toBeVisible();
  });

  test("owners can archive a customer without active vehicles", async ({ page }) => {
    await page.goto(urls.a!);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("This customer is archived.")).toBeVisible();
  });
});

test.describe("technician restrictions", () => {
  test.use({ storageState: DB ? TECH_STATE : { cookies: [], origins: [] } });
  test.skip(!DB, "DB mode only");
  test.beforeEach(({ browserName: _browser }, info) => {
    test.skip(info.project.name !== "chromium", "chromium only");
  });

  test("sees names but no phone numbers, and cannot create or transfer", async ({ page }) => {
    await page.goto("/dashboard/customers");
    await expect(page.getByRole("heading", { level: 1, name: "Customers" })).toBeVisible();
    await expect(page.getByRole("link", { name: "New customer" })).toHaveCount(0);
    await expect(page.getByText(/^\+255 /)).toHaveCount(0);

    await page.goto("/dashboard/customers/new");
    await expect(page).toHaveURL(/\/dashboard\?denied=1/);

    await page.goto("/dashboard/vehicles");
    const first = page.locator("tbody a").first();
    if (await first.count()) {
      await first.click();
      await expect(page.getByRole("button", { name: "Transfer ownership" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Change registration" })).toHaveCount(0);
      await expect(page.getByRole("list", { name: "Activity" })).toHaveCount(0);
    }
  });

  test("phone search does not reveal customers to a technician", async ({ page }) => {
    await page.goto(`/dashboard/search?q=${encodeURIComponent(phoneLocal)}`);
    await expect(page.getByRole("link", { name: nameB })).toHaveCount(0);
  });
});

test.describe("mobile smoke", () => {
  test.use({ storageState: DB ? OWNER_STATE : { cookies: [], origins: [] } });
  test.skip(!DB, "DB mode only");
  test.beforeEach(({ browserName: _browser }, info) => {
    test.skip(info.project.name !== "mobile", "mobile only");
  });

  test("customer and vehicle lists render on a phone", async ({ page }) => {
    await page.goto("/dashboard/customers");
    await expect(page.getByRole("heading", { level: 1, name: "Customers" })).toBeVisible();
    await page.goto("/dashboard/vehicles");
    await expect(page.getByRole("heading", { level: 1, name: "Vehicles" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  });
});
