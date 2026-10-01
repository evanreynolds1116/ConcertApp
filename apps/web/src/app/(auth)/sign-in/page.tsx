import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Music Junkie" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next } = await searchParams;
  return (
    <>
      <h1 className="mb-6 text-3xl font-extrabold">Sign in</h1>
      <SignInForm next={typeof next === "string" ? next : undefined} />
      <p className="mt-6 text-center text-muted">
        New here?{" "}
        <Link href="/sign-up" className="font-semibold text-accent hover:text-accent-hover">
          Create an account
        </Link>
      </p>
    </>
  );
}
