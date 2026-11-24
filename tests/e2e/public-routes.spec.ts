import { expect, test } from "@playwright/test";

const PUBLIC_ROUTES = [
  { path: "/", heading: /Book your vehicle in/ },
  { path: "/book", heading: "Book a service" },
  { path: "/track", heading: "Track a booking" },
  { path: "/portal", heading: "My vehicles" },
  { path: "/login", heading: "Staff sign in" },
];

for (const { path, heading } of PUBLIC_ROUTES) {
  test(`${path} renders`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  });
}

test("portal shows no customer data without verification", async ({ page }) => {
  await page.goto("/portal");
  await expect(page.getByText("Verified access required")).toBeVisible();
});

test("unknown routes render the not-found page", async ({ page }) => {
  const response = await page.goto("/does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("Page not found")).toBeVisible();
});

test("security headers are set", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["x-powered-by"]).toBeUndefined();
});

test("health endpoint exposes no infrastructure details", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.checks.database.status).toBe(
    process.env.E2E_DATABASE === "1" ? "ok" : "unconfigured",
  );
  expect(JSON.stringify(body)).not.toMatch(/postgres|password|neon\.tech/i);
});
