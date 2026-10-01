import type { Metadata } from "next";
import Link from "next/link";
import { LogCard } from "@/components/concert/log-card";
import { FollowButton } from "@/components/social/follow-button";
import { fetchLogPage } from "@/lib/concerts";
import { loadLogView } from "@/lib/log-page";
import { fetchFollowRequests, signAvatars } from "@/lib/social";
import { LogView } from "../../log-view";
import { firstName, loadProfile } from "./load";
import { FollowRequests, LockedProfile } from "./profile-client";
import { ProfileHeader } from "./profile-header";

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  const { person } = await loadProfile((await params).username);
  return { title: `${person.display_name} (@${person.username}) · Music Junkie` };
}

// A profile. Yours: requests, recent concerts, Edit profile. Someone you can see (public, or
// you're an accepted follower): their log with filters, and stats. Otherwise: locked.
export default async function ProfilePage({ params, searchParams }: PageProps<"/u/[username]">) {
  const { supabase, person } = await loadProfile((await params).username);
  const requests = person.is_self ? await fetchFollowRequests(supabase) : [];
  const avatars = await signAvatars(supabase, [
    person.avatar_url,
    ...requests.map((r) => r.avatar_url),
  ]);
  const avatarSrc = person.avatar_url ? (avatars.get(person.avatar_url) ?? null) : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="-mb-4 flex min-h-11 items-center justify-between">
        <Link
          href="/people"
          className="-ml-1 flex min-h-11 items-center gap-0.5 pr-3 font-semibold"
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            aria-hidden
            className="fill-none stroke-current stroke-2"
          >
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          People
        </Link>
        {person.is_self && (
          <Link
            href="/settings"
            className="flex min-h-11 items-center gap-1.5 font-semibold text-muted hover:text-foreground"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              aria-hidden
              className="fill-none stroke-current stroke-2"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
            Settings
          </Link>
        )}
      </div>

      <ProfileHeader person={person} avatarSrc={avatarSrc} />

      {person.is_self ? (
        <OwnProfile
          userId={person.id}
          requests={requests}
          avatars={Object.fromEntries(avatars)}
          supabase={supabase}
        />
      ) : !person.can_view ? (
        <LockedProfile
          userId={person.id}
          name={person.display_name}
          firstName={firstName(person.display_name)}
          status={person.follow_status}
        />
      ) : (
        <>
          <div className="flex justify-center gap-3">
            <FollowButton
              userId={person.id}
              name={person.display_name}
              status={person.follow_status}
              size="lg"
            />
            <Link
              href={`/u/${person.username}/stats`}
              className="flex h-11 items-center rounded-full border border-surface-raised px-6 font-bold hover:border-foreground"
            >
              Stats
            </Link>
          </div>
          <LogView
            {...await loadLogView(supabase, person.id, await searchParams)}
            basePath={`/u/${person.username}`}
            heading={`${firstName(person.display_name)}’s concerts`}
            headingLevel="h2"
            ownLog={false}
          />
        </>
      )}
    </div>
  );
}

async function OwnProfile({
  userId,
  requests,
  avatars,
  supabase,
}: {
  userId: string;
  requests: Awaited<ReturnType<typeof fetchFollowRequests>>;
  avatars: Record<string, string>;
  supabase: Awaited<ReturnType<typeof loadProfile>>["supabase"];
}) {
  const recent = await fetchLogPage(supabase, userId, {});
  return (
    <>
      <div className="flex justify-center gap-3">
        <Link
          href="/settings"
          className="flex h-11 items-center rounded-full border border-surface-raised px-6 font-bold hover:border-foreground"
        >
          Edit profile
        </Link>
        <Link
          href="/stats"
          className="flex h-11 items-center rounded-full border border-surface-raised px-6 font-bold hover:border-foreground"
        >
          Stats
        </Link>
      </div>
      <FollowRequests requests={requests} avatars={avatars} />
      <section aria-labelledby="recent-h" className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <h2 id="recent-h" className="text-lg font-extrabold">
            Recent concerts
          </h2>
          <Link href="/" className="text-sm font-semibold text-accent hover:text-accent-hover">
            See all
          </Link>
        </div>
        {recent.entries.length === 0 ? (
          <p className="text-muted">No concerts logged yet.</p>
        ) : (
          <ul>
            {recent.entries.slice(0, 3).map((entry) => (
              <li key={entry.log_id}>
                <LogCard entry={entry} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
