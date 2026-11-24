"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";

import type { MessageKey } from "@/i18n/translate";
import { staffSignInSchema } from "@/modules/staff/schemas";
import { signIn, signOut } from "@/server/auth/auth";
import { LOGIN_PATH, safeCallbackPath } from "@/server/auth/redirects";
import { checkRateLimit, RATE_LIMITS } from "@/server/rate-limit";

export interface SignInState {
  error?: MessageKey;
}

/** First hop of X-Forwarded-For (set by the hosting proxy), else a shared bucket. */
async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "unknown";
}

/**
 * Staff sign-in server action. Validates input with Zod before it reaches Auth.js, applies
 * per-email and per-IP rate limits (database-backed, HMAC keys), and maps every failure to a
 * generic message that does not reveal whether the account exists.
 */
export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = staffSignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "auth.invalidInput" };

  try {
    const [byEmail, byIp] = await Promise.all([
      checkRateLimit(RATE_LIMITS.signInPerEmail, parsed.data.email),
      checkRateLimit(RATE_LIMITS.signInPerIp, await clientIp()),
    ]);
    if (!byEmail.allowed || !byIp.allowed) return { error: "auth.rateLimited" };
  } catch {
    return { error: "auth.unavailable" };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: safeCallbackPath(formData.get("callbackUrl")),
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error: error.type === "CredentialsSignin" ? "auth.invalidCredentials" : "auth.unavailable",
      };
    }
    throw error; // includes the NEXT_REDIRECT thrown on success
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: LOGIN_PATH });
}
