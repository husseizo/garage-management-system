import { NextResponse } from "next/server";

import { auth } from "@/server/auth/auth";
import { decideProxyAccess } from "@/server/auth/redirects";

/**
 * Optimistic authentication gate (ADR 0005). Redirects anonymous visitors away from `/dashboard`
 * before rendering. Pages and data access perform their own server-side checks as well.
 */
export default auth((request) => {
  const decision = decideProxyAccess({
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    isAuthenticated: Boolean(request.auth?.user?.id),
  });
  if (decision.type === "redirect") {
    return NextResponse.redirect(new URL(decision.location, request.nextUrl.origin));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/login"],
};
