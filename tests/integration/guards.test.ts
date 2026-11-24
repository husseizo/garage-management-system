import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/server/auth/auth", () => ({ auth: () => authMock() }));

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

const { assertStaff, getStaffSession, requireStaff } = await import("@/server/auth/guards");

const session = (role: string) => ({
  user: { id: "stf_1", name: "Sam Advisor", email: "sam@garage.test", role },
});

describe("staff guards (server-side authorization boundary)", () => {
  beforeEach(() => authMock.mockReset());

  it("returns null for anonymous users and for sessions with an invalid role", async () => {
    authMock.mockResolvedValueOnce(null);
    await expect(getStaffSession()).resolves.toBeNull();
    authMock.mockResolvedValueOnce(session("SUPERUSER"));
    await expect(getStaffSession()).resolves.toBeNull();
  });

  it("requireStaff redirects anonymous users to login with the return path", async () => {
    authMock.mockResolvedValue(null);
    await expect(requireStaff({ returnTo: "/dashboard/customers" })).rejects.toMatchObject({
      location: "/login?callbackUrl=%2Fdashboard%2Fcustomers",
    });
  });

  it("requireStaff redirects roles that are not permitted", async () => {
    authMock.mockResolvedValue(session("TECHNICIAN"));
    await expect(requireStaff({ roles: ["OWNER", "MANAGER"] })).rejects.toMatchObject({
      location: "/dashboard?denied=1",
    });
  });

  it("requireStaff returns a narrow staff session when permitted", async () => {
    authMock.mockResolvedValue(session("MANAGER"));
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
    authMock.mockResolvedValueOnce(session("SERVICE_ADVISOR"));
    await expect(assertStaff(["OWNER"])).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });
});
