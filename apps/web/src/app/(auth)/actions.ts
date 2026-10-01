"use server";

import { fieldErrorsOf, signInSchema, signUpSchema, type FieldErrors } from "@musicjunkie/shared";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState =
  { error?: string; fieldErrors?: FieldErrors; values?: Record<string, string> } | undefined;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

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
  const supabase = await createClient();

  const { data: available } = await supabase.rpc("is_username_available", { name: username });
  if (available === false)
    return { fieldErrors: { username: ["That username is taken."] }, values };

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username, display_name: displayName } },
  });
  if (error) {
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { fieldErrors: { email: ["An account with this email already exists."] }, values };
    }
    if (error.code === "weak_password") {
      return { fieldErrors: { password: [error.message] }, values };
    }
    // Otherwise the profile trigger most likely rejected it: a username taken a moment ago.
    return { error: "We couldn't create your account. Try a different username.", values };
  }

  redirect("/");
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { email: text(formData, "email") };
  const parsed = signInSchema.safeParse({ ...values, password: text(formData, "password") });
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    const message =
      error.code === "invalid_credentials"
        ? "Email or password is incorrect."
        : "Something went wrong signing in. Please try again.";
    return { error: message, values };
  }

  redirect(safeNextPath(formData.get("next")));
}
