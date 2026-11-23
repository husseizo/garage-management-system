"use server";

import { AuthError } from "next-auth";

import { staffSignInSchema } from "@/modules/staff/schemas";
import { signIn, signOut } from "@/server/auth/auth";
import { LOGIN_PATH, safeCallbackPath } from "@/server/auth/redirects";

export interface SignInState {
  error?: string;
}

/**
 * Staff sign-in server action. Validates input with Zod before it reaches Auth.js, and maps every
 * failure to a generic message that does not reveal whether the account exists.
 */
export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = staffSignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email address and password." };
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
        error:
          error.type === "CredentialsSignin"
            ? "Incorrect email or password."
            : "Sign-in is unavailable right now. Please try again later.",
      };
    }
    throw error; // includes the NEXT_REDIRECT thrown on success
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: LOGIN_PATH });
}
