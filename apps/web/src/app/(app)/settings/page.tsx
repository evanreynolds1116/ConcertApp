import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth";
import { signAvatars } from "@/lib/social";
import { signOut } from "./actions";
import { PrivacyToggle } from "./privacy-toggle";
import { AvatarEditor, DeleteAccount, ProfileForm } from "./profile-settings";

export const metadata: Metadata = { title: "Settings · Music Junkie" };

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-sm font-bold tracking-wide text-subtle uppercase">
      {children}
    </h2>
  );
}

export default async function SettingsPage() {
  const { supabase, profile } = await requireViewer();
  const avatars = await signAvatars(supabase, [profile.avatar_url]);
  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="text-3xl font-extrabold">Settings</h1>

      <section aria-labelledby="profile-heading" className="mt-8">
        <SectionHeading id="profile-heading">Profile</SectionHeading>
        <div className="mt-3 flex flex-col gap-6 rounded-xl border border-border bg-surface p-4">
          <AvatarEditor
            userId={profile.id}
            name={profile.display_name}
            src={profile.avatar_url ? (avatars.get(profile.avatar_url) ?? null) : null}
            hasAvatar={Boolean(profile.avatar_url)}
          />
          <ProfileForm username={profile.username} displayName={profile.display_name} />
        </div>
      </section>

      <section aria-labelledby="privacy-heading" className="mt-8">
        <SectionHeading id="privacy-heading">Privacy</SectionHeading>
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

      <section aria-labelledby="danger-heading" className="mt-10">
        <SectionHeading id="danger-heading">Delete account</SectionHeading>
        <p className="mt-2 mb-3 text-sm text-muted">
          Removes your profile, concerts, follows and activity for good. Shows other people logged
          stay in their logs.
        </p>
        <DeleteAccount username={profile.username} />
      </section>
    </div>
  );
}
