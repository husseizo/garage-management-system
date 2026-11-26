import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/server/auth/auth", () => ({ auth: () => authMock() }));

const findUnique = vi.fn();
let dbConfigured = true;
vi.mock("@/server/db/client", () => ({
  isDatabaseConfigured: () => dbConfigured,
  getDb: () => ({ staffUser: { findUnique } }),
}));

class RedirectSignal extends Error {
  constructor(readonly location: string) {
    super(`REDIRECT ${location}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new RedirectSignal(location);
  },
}));

const { assertPermission, assertStaff, getStaffSession, requireStaff } =
  await import("@/server/auth/guards");

/** What the cookie says (signed in as OWNER at the time). */
const token = (id = "stf_1", role = "OWNER") => ({
  user: { id, name: "Token Name", email: "token@garage.test", role },
});
/** What `staff_users` says now. */
const row = (over: Partial<{ role: string; active: boolean; name: string }> = {}) => ({
  id: "stf_1",
  name: "Sam Advisor",
  email: "sam@garage.test",
  role: "MANAGER",
  active: true,
  ...over,
});

describe("staff guards (server-side authorization boundary)", () => {
  beforeEach(() => {
    authMock.mockReset();
    findUnique.mockReset();
    dbConfigured = true;
  });

  it("returns null for anonymous users without touching the database", async () => {
    authMock.mockResolvedValueOnce(null);
    await expect(getStaffSession()).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("takes role, name and email from the database, not from the token (S-1)", async () => {
    authMock.mockResolvedValue(token("stf_1", "OWNER"));
    findUnique.mockResolvedValue(row({ role: "TECHNICIAN" }));
    await expect(getStaffSession()).resolves.toEqual({
      id: "stf_1",
      name: "Sam Advisor",
      email: "sam@garage.test",
      role: "TECHNICIAN",
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "stf_1" },
      select: { id: true, name: true, email: true, role: true, active: true },
    });
    // A downgraded role loses OWNER-only access on the very next request.
    await expect(assertStaff(["OWNER"])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(assertPermission("customer.create")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each([
    ["a deactivated staff member", row({ active: false })],
    ["a deleted staff member", null],
    ["an invalid role in the database", row({ role: "SUPERUSER" })],
  ])("ends the session of %s", async (_, dbRow) => {
    authMock.mockResolvedValue(token());
    findUnique.mockResolvedValue(dbRow);
    await expect(getStaffSession()).resolves.toBeNull();
    await expect(assertStaff()).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    // Pages send the still-present cookie to /session-ended, not /login (no redirect loop).
    await expect(requireStaff({ returnTo: "/dashboard/customers" })).rejects.toMatchObject({
      location: "/session-ended",
    });
  });

  it("fails closed when the database lookup fails (never falls back to the token)", async () => {
    authMock.mockResolvedValue(token());
    findUnique.mockRejectedValue(new Error("connection reset"));
    await expect(getStaffSession()).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      status: 503,
    });
    await expect(assertStaff()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    await expect(requireStaff()).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });

  it("treats a cookie as no longer valid when no database is configured", async () => {
    dbConfigured = false;
    authMock.mockResolvedValue(token());
    await expect(getStaffSession()).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("ignores a token without a staff id", async () => {
    authMock.mockResolvedValue({ user: { role: "OWNER" } });
    await expect(getStaffSession()).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("requireStaff redirects anonymous users to login with the return path", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireStaff({ returnTo: "/dashboard/customers" })).rejects.toMatchObject({
      location: "/login?callbackUrl=%2Fdashboard%2Fcustomers",
    });
  });

  it("requireStaff redirects roles that are not permitted", async () => {
    authMock.mockResolvedValue(token());
    findUnique.mockResolvedValue(row({ role: "TECHNICIAN" }));
    await expect(requireStaff({ roles: ["OWNER", "MANAGER"] })).rejects.toMatchObject({
      location: "/dashboard?denied=1",
    });
  });

  it("requireStaff returns a narrow staff session when permitted", async () => {
    authMock.mockResolvedValue(token());
    findUnique.mockResolvedValue(row());
    await expect(requireStaff({ roles: ["OWNER", "MANAGER"] })).resolves.toEqual({
      id: "stf_1",
      name: "Sam Advisor",
      email: "sam@garage.test",
      role: "MANAGER",
    });
  });

  it("assertStaff throws typed 401 / 403 errors for the data layer", async () => {
    authMock.mockResolvedValueOnce(null);
    await expect(assertStaff()).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    authMock.mockResolvedValueOnce(token());
    findUnique.mockResolvedValueOnce(row({ role: "SERVICE_ADVISOR" }));
    await expect(assertStaff(["OWNER"])).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});
