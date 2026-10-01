import type { Metadata } from "next";
import Link from "next/link";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create account · Music Junkie" };

export default function SignUpPage() {
  return (
    <>
      <h1 className="mb-6 text-3xl font-extrabold">Create your account</h1>
      <SignUpForm />
      <p className="mt-6 text-center text-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold text-accent hover:text-accent-hover">
          Sign in
        </Link>
      </p>
    </>
  );
}
