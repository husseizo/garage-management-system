import { describe, expect, it } from "vitest";

import { decideProxyAccess, isDashboardPath, safeCallbackPath } from "@/server/auth/redirects";

describe("isDashboardPath", () => {
  it.each([
    ["/dashboard", true],
    ["/dashboard/bookings", true],
    ["/dashboard/settings/staff", true],
    ["/dashboards", false],
    ["/", false],
    ["/portal", false],
  ])("%s → %s", (path, expected) => expect(isDashboardPath(path)).toBe(expected));
});

describe("safeCallbackPath", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeCallbackPath("/dashboard/calendar?week=2")).toBe("/dashboard/calendar?week=2");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "",
    42,
    null,
  ])("rejects %s", (value) => expect(safeCallbackPath(value)).toBe("/dashboard"));
});

describe("decideProxyAccess", () => {
  it("redirects anonymous dashboard requests to login with a callback", () => {
    expect(
      decideProxyAccess({
        pathname: "/dashboard/bookings",
        search: "?s=1",
        isAuthenticated: false,
      }),
    ).toEqual({ type: "redirect", location: "/login?callbackUrl=%2Fdashboard%2Fbookings%3Fs%3D1" });
  });

  it("lets authenticated staff through", () => {
    expect(
      decideProxyAccess({ pathname: "/dashboard", search: "", isAuthenticated: true }),
    ).toEqual({
      type: "next",
    });
  });

  it("sends signed-in staff from /login to the dashboard", () => {
    expect(decideProxyAccess({ pathname: "/login", search: "", isAuthenticated: true })).toEqual({
      type: "redirect",
      location: "/dashboard",
    });
  });

  it("does not gate public routes", () => {
    for (const pathname of ["/", "/book", "/track", "/portal"]) {
      expect(decideProxyAccess({ pathname, search: "", isAuthenticated: false })).toEqual({
        type: "next",
      });
    }
  });
});
