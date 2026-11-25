import { expect, test, type Locator, type Page } from "@playwright/test";

import { OWNER_STATE, TECH_STATE } from "./support/auth-state";

/**
 * Phase 1B lifecycle flows not covered by customers-vehicles.spec.ts: edit customer, contact
 * remove / primary changes, archive + restore customer, edit vehicle, keeper assign / end and
 * vehicle archive, plus role checks on those screens. DB mode only, desktop Chromium only.
 *
 * Records are named "E2E Life <run>"; E2E_RUN_ID may be set so a follow-up database check can find
 * exactly the rows this run created.
 */
const DB = process.env.E2E_DATABASE === "1";
const run = (process.env.E2E_RUN_ID ?? Date.now().toString(36).slice(-5)).toUpperCase();
const digits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
const letters = (n: number) =>
  Array.from({ length: n }, () => "ABCDEFGHJKLMNPRSTUVWXYZ"[Math.floor(Math.random() * 23)]).join(
    "",
  );
const phone = () => {
  const d = digits(6);
  return {
    local: `0755 ${d.slice(0, 3)} ${d.slice(3)}`,
    shown: `+255 755 ${d.slice(0, 3)} ${d.slice(3)}`,
  };
};
const p1 = phone();
const p2 = phone();
const p3 = phone();
const owner = `E2E Life ${run}`;
const keeper = `E2E Keeper ${run}`;
const plate = `T${digits(3)}${letters(3)}`;

const urls: Record<string, string> = {};

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
  await page.getByRole("combobox", { name: label }).fill(name);
  await page.getByRole("option", { name: new RegExp(name) }).click();
  await expect(page.getByText(`Selected: ${name}`)).toBeVisible();
}

const contactRow = (page: Page, shown: string): Locator =>
  page.getByRole("listitem").filter({ has: page.getByRole("link", { name: shown }) });

async function addPhone(page: Page, local: string, shown: string) {
  // The header button toggles the form, which stays open after a successful add.
  const toggle = page.getByRole("button", { name: "Add contact" }).first();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  const form = page.locator("form").filter({ has: page.getByLabel("Number or email") });
  await form.getByLabel("Number or email").fill(local);
  await form.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("link", { name: shown })).toBeVisible({ timeout: 15_000 });
}

test.describe("lifecycle flows (owner)", () => {
  test.describe.configure({ mode: "serial" });
  test.use({ storageState: DB ? OWNER_STATE : { cookies: [], origins: [] } });
  test.skip(!DB, "DB mode only");
  test.beforeEach(({ browserName: _browser }, info) => {
    test.skip(info.project.name !== "chromium", "chromium only");
  });

  test("setup: owner and keeper customers", async ({ page }) => {
    await page.goto("/dashboard/customers/new");
    await page.getByLabel("First name").fill(owner);
    await page.getByLabel("Last name").fill("Before");
    await page.getByLabel("Phone").fill(p1.local);
    await saveCustomer(page);
    urls.owner = page.url().split("?")[0]!;

    await page.goto("/dashboard/customers/new");
    await page.getByLabel("First name").fill(keeper);
    await saveCustomer(page);
    urls.keeper = page.url().split("?")[0]!;
  });

  test("edits customer information", async ({ page }) => {
    await page.goto(`${urls.owner}/edit`);
    await page.getByLabel("Last name").fill("After");
    await page.getByLabel("Internal notes").fill(`Edited by lifecycle run ${run}`);
    await page.getByLabel("Preferred language").selectOption("en");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/notice=updated/);
    await expect(page.getByText("Customer updated.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${owner} After`);
    await expect(page.getByText(`Edited by lifecycle run ${run}`)).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Activity" }).getByText("Customer details updated"),
    ).toBeVisible();
  });

  test("changes the primary contact and removes contacts", async ({ page }) => {
    await page.goto(urls.owner!);
    await expect(contactRow(page, p1.shown).getByText("Primary", { exact: true })).toBeVisible();

    await addPhone(page, p2.local, p2.shown);
    await contactRow(page, p2.shown).getByRole("button", { name: "Make primary" }).click();
    await expect(contactRow(page, p2.shown).getByText("Primary", { exact: true })).toBeVisible();
    await expect(contactRow(page, p1.shown).getByText("Primary", { exact: true })).toHaveCount(0);

    // Remove a non-primary contact.
    await contactRow(page, p1.shown).getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("link", { name: p1.shown })).toHaveCount(0);

    // Removing the primary contact promotes the remaining phone.
    await addPhone(page, p3.local, p3.shown);
    await contactRow(page, p2.shown).getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("link", { name: p2.shown })).toHaveCount(0);
    await expect(contactRow(page, p3.shown).getByText("Primary", { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("link", { name: /^\+255 / })).toHaveCount(1);
  });

  test("setup: vehicle owned by the customer", async ({ page }) => {
    await page.goto("/dashboard/vehicles/new");
    await page.getByLabel("Registration number").fill(plate);
    await page.getByLabel("Make").fill("Toyota");
    await page.getByLabel("Model").fill("Probox");
    await pickCustomer(page, "Owner", `${owner} After`);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page).toHaveURL(/\/dashboard\/vehicles\/[0-9a-f-]{36}\?notice=created/);
    urls.vehicle = page.url().split("?")[0]!;
  });

  test("edits vehicle information", async ({ page }) => {
    await page.goto(`${urls.vehicle}/edit`);
    await page.getByLabel("Colour").fill("Silver");
    await page.getByLabel("Year").fill("2015");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/notice=updated/);
    await expect(page.getByText("Vehicle updated.")).toBeVisible();
    await expect(page.getByText("Silver", { exact: true })).toBeVisible();
    await expect(page.getByText("2015", { exact: true })).toBeVisible();
  });

  test("assigns a keeper and ends the keeper relationship", async ({ page }) => {
    await page.goto(urls.vehicle!);
    await page.getByRole("button", { name: "Add keeper" }).click();
    await pickCustomer(page, "Keeper (regular driver)", keeper);
    await page.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText("Keeper added.")).toBeVisible();

    const history = page
      .getByText("Ownership history")
      .locator("xpath=ancestor::*[@data-slot='card'][1]");
    const keeperRow = history.getByRole("listitem").filter({ hasText: keeper });
    await expect(keeperRow.getByText("Keeper", { exact: true })).toBeVisible();
    await expect(keeperRow.getByText("Present")).toBeVisible();

    await keeperRow.getByRole("button", { name: "End" }).click();
    await expect(keeperRow.getByText("Present")).toHaveCount(0);
    await expect(keeperRow.getByRole("button", { name: "End" })).toHaveCount(0);
    // The owner period is untouched.
    await expect(
      history
        .getByRole("listitem")
        .filter({ hasText: `${owner} After` })
        .getByText("Present"),
    ).toBeVisible();
  });

  test("technician cannot edit, archive or manage these records", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: TECH_STATE });
    const page = await ctx.newPage();
    await page.goto(urls.vehicle!);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(plate);
    for (const name of ["Edit", "Archive", "Add keeper", "Transfer ownership"]) {
      await expect(
        page.getByRole("link", { name }).or(page.getByRole("button", { name })),
      ).toHaveCount(0);
    }
    await page.goto(`${urls.vehicle}/edit`);
    await expect(page).toHaveURL(/\/dashboard\?denied=1/);

    await page.goto(urls.owner!);
    for (const name of ["Archive", "Make primary", "Remove", "Add contact"]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }
    await expect(page.getByText("Contact details are hidden for your role.")).toBeVisible();
    await page.goto(`${urls.owner}/edit`);
    await expect(page).toHaveURL(/\/dashboard\?denied=1/);
    await ctx.close();
  });

  test("archives the vehicle: plate and ownership periods are closed", async ({ page }) => {
    await page.goto(urls.vehicle!);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("This vehicle is archived.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Change registration" })).toHaveCount(0);
    await expect(page.getByText("Present")).toHaveCount(0);

    await page.goto(urls.owner!);
    await expect(page.getByText("Previously owned")).toBeVisible();
  });

  test("archives and restores the customer", async ({ page }) => {
    await page.goto(urls.owner!);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("This customer is archived.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add contact" })).toHaveCount(0);

    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByText("This customer is archived.")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Edit" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Activity" }).getByText(/Customer restored/),
    ).toBeVisible();
  });
});
