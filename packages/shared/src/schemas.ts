import { z } from "zod";

// Mirrors the database constraints in supabase/migrations (profiles table) and the
// minimum_password_length in supabase/config.toml. The database stays the source of truth.

export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,30}$/;

export const usernameSchema = z
  .string()
  .trim()
  .regex(USERNAME_PATTERN, { error: "Use 3–30 letters, numbers or underscores." });

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, { error: "Enter a display name." })
  .max(50, { error: "Keep it to 50 characters or fewer." });

export const emailSchema = z
  .string()
  .trim()
  .pipe(z.email({ error: "Enter a valid email address." }));

export const passwordSchema = z.string().min(8, { error: "Use at least 8 characters." });

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "Enter your password." }),
});
export type SignInInput = z.infer<typeof signInSchema>;

export type FieldErrors = Partial<Record<string, string[]>>;

/** Per-field messages from a failed parse, for showing next to form inputs. */
export function fieldErrorsOf(error: z.ZodError): FieldErrors {
  return z.flattenError(error).fieldErrors as FieldErrors;
}
