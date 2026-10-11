"use client";

import {
  fieldErrorsOf,
  safeNextPath,
  signInSchema,
  signUpSchema,
  type FieldErrors,
} from "@musicjunkie/shared";
import { getBrowserClient } from "@/lib/supabase/client";

// Sign-in and sign-up run in the browser, not as server actions, so Supabase Auth sees each
// person's own IP address and its per-IP rate limits work (SECURITY_AUDIT.md, M5). The session
// lands in cookies the server reads, like before.

export type AuthFormState =
  | {
      error?: string;
      fieldErrors?: FieldErrors;
      values?: Record<string, string>;
      /** Sign-up done; the account needs its email confirmed. */
      checkEmail?: boolean;
    }
  | undefined;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

const TOO_MANY = "Too many attempts. Wait a few minutes and try again.";
const isRateLimited = (code: string | undefined) =>
  code === "over_request_rate_limit" || code === "over_email_send_rate_limit";

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  // Echo back everything except the password so the form keeps what the user typed.
  const values = {
    email: text(formData, "email"),
    username: text(formData, "username"),
    displayName: text(formData, "displayName"),
  };
  const parsed = signUpSchema.safeParse({ ...values, password: text(formData, "password") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const { email, password, username, displayName } = parsed.data;
  const supabase = getBrowserClient();

  const { data: available } = await supabase.rpc("is_username_available", { name: username });
  if (available === false)
    return { fieldErrors: { username: ["That username is taken."] }, values };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, display_name: displayName },
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) {
    if (error.code === "weak_password") {
      return { fieldErrors: { password: [error.message] }, values };
    }
    if (isRateLimited(error.code)) return { error: TOO_MANY, values };
    // Otherwise the profile trigger most likely rejected it: a username taken a moment ago.
    return { error: "We couldn't create your account. Try a different username.", values };
  }
  // With email confirmation on, there's no session yet. Supabase answers the same way whether
  // or not the email already has an account, so this message doesn't reveal which (L1).
  if (!data.session) return { checkEmail: true, values };
  // A full page load (not router.push), so the server renders with the new session cookies.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/");
  return undefined;
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { email: text(formData, "email") };
  const parsed = signInSchema.safeParse({ ...values, password: text(formData, "password") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const { error } = await getBrowserClient().auth.signInWithPassword(parsed.data);
  if (error) {
    const message =
      error.code === "invalid_credentials"
        ? "Email or password is incorrect."
        : error.code === "email_not_confirmed"
          ? "Confirm your email first: open the link we sent you."
          : isRateLimited(error.code)
            ? TOO_MANY
            : "Something went wrong signing in. Please try again.";
    return { error: message, values };
  }
  // A full page load, so the server renders with the new session cookies.
  window.location.assign(safeNextPath(formData.get("next")));
  return undefined;
}
