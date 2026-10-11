import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Music Junkie" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next, deleted, confirm } = await searchParams;
  return (
    <>
      {deleted === "1" && (
        <p role="status" className="mb-6 rounded-xl bg-surface p-4 text-sm">
          Your account and everything in it has been deleted.
        </p>
      )}
      {confirm === "failed" && (
        <p role="alert" className="mb-6 rounded-xl bg-surface p-4 text-sm">
          That confirmation link didn&apos;t work. It may have expired or been used already. Try
          signing in, or sign up again for a new link.
        </p>
      )}
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
