/**
 * Pure routing rules for authentication. No framework imports, so they are unit-testable and
 * shared by the proxy and server components.
 */
export const LOGIN_PATH = "/login";
export const STAFF_HOME = "/dashboard";

export function isDashboardPath(pathname: string): boolean {
  return pathname === STAFF_HOME || pathname.startsWith(`${STAFF_HOME}/`);
}

/**
 * Accept only same-origin relative paths as post-login destinations, preventing open redirects
 * such as `//evil.example`, `/\evil.example` or absolute URLs.
 */
export function safeCallbackPath(value: unknown, fallback = STAFF_HOME): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  return value;
}

export type ProxyDecision = { type: "next" } | { type: "redirect"; location: string };

/**
 * Optimistic access decision taken in `src/proxy.ts` before rendering. This is a UX layer, not
 * the security boundary — pages and data access re-check the session (ADR 0005).
 */
export function decideProxyAccess(input: {
  pathname: string;
  search: string;
  isAuthenticated: boolean;
}): ProxyDecision {
  const { pathname, search, isAuthenticated } = input;
  if (isDashboardPath(pathname) && !isAuthenticated) {
    const callback = encodeURIComponent(`${pathname}${search}`);
    return { type: "redirect", location: `${LOGIN_PATH}?callbackUrl=${callback}` };
  }
  if (pathname === LOGIN_PATH && isAuthenticated) {
    return { type: "redirect", location: STAFF_HOME };
  }
  return { type: "next" };
}
