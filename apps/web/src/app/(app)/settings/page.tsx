import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth";
import { signOut } from "./actions";
import { PrivacyToggle } from "./privacy-toggle";

export const metadata: Metadata = { title: "Settings · Music Junkie" };

export default async function SettingsPage() {
  const { profile } = await requireViewer();
  return (
    <>
      <h1 className="text-3xl font-extrabold">Settings</h1>

      <section aria-labelledby="account-heading" className="mt-8">
        <h2 id="account-heading" className="text-sm font-bold tracking-wide text-subtle uppercase">
          Account
        </h2>
        <dl className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
          <div className="flex justify-between gap-4 p-4">
            <dt className="text-muted">Username</dt>
            <dd className="font-semibold">@{profile.username}</dd>
          </div>
          <div className="flex justify-between gap-4 p-4">
            <dt className="text-muted">Display name</dt>
            <dd className="font-semibold">{profile.display_name}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="privacy-heading" className="mt-8">
        <h2 id="privacy-heading" className="text-sm font-bold tracking-wide text-subtle uppercase">
          Privacy
        </h2>
        <div className="mt-3 rounded-xl border border-border bg-surface p-4">
          <PrivacyToggle isPrivate={profile.is_private} />
        </div>
      </section>

      <form action={signOut} className="mt-8">
        <button
          type="submit"
          className="h-12 w-full rounded-full border border-border font-bold transition-colors hover:border-foreground"
        >
          Sign out
        </button>
      </form>
    </>
  );
}
