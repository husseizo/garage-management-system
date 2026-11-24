import { describe, expect, it } from "vitest";

import { isNavActive, visibleNav } from "@/config/navigation";
import { hashPassword, verifyPassword } from "@/modules/staff/password";
import { hasRole, isStaffRole } from "@/modules/staff/roles";
import { staffSignInSchema } from "@/modules/staff/schemas";

describe("roles", () => {
  it("recognises valid roles only", () => {
    expect(isStaffRole("OWNER")).toBe(true);
    expect(isStaffRole("ADMIN")).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });

  it("allows any role when no restriction is given", () => {
    expect(hasRole("TECHNICIAN")).toBe(true);
    expect(hasRole("TECHNICIAN", ["OWNER", "MANAGER"])).toBe(false);
    expect(hasRole("MANAGER", ["OWNER", "MANAGER"])).toBe(true);
  });
});

describe("navigation", () => {
  const hrefs = (role: Parameters<typeof visibleNav>[0]) =>
    visibleNav(role).flatMap((g) => g.items.map((i) => i.href));

  it("hides settings from non-admin roles", () => {
    expect(hrefs("TECHNICIAN")).not.toContain("/dashboard/settings");
    expect(hrefs("SERVICE_ADVISOR")).not.toContain("/dashboard/settings");
    expect(hrefs("OWNER")).toContain("/dashboard/settings");
  });

  it("matches active sections by prefix but the overview exactly", () => {
    expect(isNavActive("/dashboard", "/dashboard")).toBe(true);
    expect(isNavActive("/dashboard", "/dashboard/bookings")).toBe(false);
    expect(isNavActive("/dashboard/bookings", "/dashboard/bookings/abc")).toBe(true);
  });
});

describe("password hashing", () => {
  it("verifies the correct password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain("correct horse");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong", hash)).resolves.toBe(false);
  });

  it("produces unique salts", async () => {
    expect(await hashPassword("same-password-123")).not.toBe(
      await hashPassword("same-password-123"),
    );
  });

  it("rejects malformed hashes", async () => {
    await expect(verifyPassword("x", "not-a-hash")).resolves.toBe(false);
  });
});

describe("staffSignInSchema", () => {
  it("normalises email", () => {
    expect(staffSignInSchema.parse({ email: "  Ana@Garage.Test ", password: "x" }).email).toBe(
      "ana@garage.test",
    );
  });

  it("rejects missing fields", () => {
    expect(staffSignInSchema.safeParse({ email: "nope", password: "" }).success).toBe(false);
  });
});
