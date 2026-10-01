import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/lib/auth";
import { fetchFeed, signAvatars } from "@/lib/social";
import { FeedList } from "./feed-list";

export const metadata: Metadata = { title: "Feed · Music Junkie" };

// Your activity and that of people you follow (accepted), newest first, 20 at a time.
export default async function FeedPage() {
  const { supabase, profile } = await requireViewer();
  const items = await fetchFeed(supabase);
  const avatars = await signAvatars(
    supabase,
    items.map((i) => i.actor_avatar_url),
  );
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight">Feed</h1>
        <Link
          href="/people"
          aria-label="Find people"
          className="flex size-11 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground"
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            aria-hidden
            className="fill-none stroke-current stroke-2"
          >
            <circle cx="9" cy="8" r="4" />
            <path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" strokeLinecap="round" />
          </svg>
        </Link>
      </div>
      <FeedList
        viewerId={profile.id}
        initialItems={items}
        initialAvatars={Object.fromEntries(avatars)}
        now={new Date().toISOString()}
      />
    </div>
  );
}
