import { z } from "zod";

export const staffSignInSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Enter a valid email address")),
  password: z.string().min(1, "Enter your password").max(200),
});

export type StaffSignInInput = z.infer<typeof staffSignInSchema>;

/** Minimum password policy for staff accounts (enforced when accounts are created). */
export const staffPasswordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(200, "Use at most 200 characters");
