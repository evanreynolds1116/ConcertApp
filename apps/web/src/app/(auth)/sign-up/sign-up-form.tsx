"use client";

import { useActionState } from "react";
import { Field } from "@/components/field";
import { SubmitButton } from "@/components/submit-button";
import { signUp } from "../auth-client";

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, undefined);
  if (state?.checkEmail) {
    return (
      <div role="status" className="rounded-xl bg-surface p-4">
        <p className="font-bold">Check your email</p>
        <p className="mt-1 text-sm text-muted">
          If {state.values?.email} can be used for a new account, we&apos;ve sent it a link to
          finish signing up.
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state?.values?.email}
        errors={state?.fieldErrors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters."
        errors={state?.fieldErrors?.password}
      />
      <Field
        label="Username"
        name="username"
        autoComplete="username"
        hint="3–30 letters, numbers or underscores. People find you by this."
        defaultValue={state?.values?.username}
        errors={state?.fieldErrors?.username}
      />
      <Field
        label="Display name"
        name="displayName"
        autoComplete="name"
        defaultValue={state?.values?.displayName}
        errors={state?.fieldErrors?.displayName}
      />
      <p className="text-sm text-muted">
        New accounts are private: only people you approve can see your concerts. You can change this
        in Settings.
      </p>
      <p role="alert" className="min-h-5 text-sm text-danger">
        {state?.error}
      </p>
      <SubmitButton pending={pending} pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
