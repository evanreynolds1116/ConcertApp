"use server";

import { requireViewer } from "@/lib/auth";
import { fetchFeed, signAvatars, type FeedItem } from "@/lib/social";

/** The next page of the feed, after the given item (keyset paging). */
export async function loadFeedPage(
  createdAt: string,
  id: string,
): Promise<{ items: FeedItem[]; avatars: Record<string, string> }> {
  const { supabase } = await requireViewer();
  if (Number.isNaN(Date.parse(createdAt)) || !/^[0-9a-f-]{36}$/i.test(id))
    return { items: [], avatars: {} };
  const items = await fetchFeed(supabase, { createdAt, id });
  const avatars = await signAvatars(
    supabase,
    items.map((i) => i.actor_avatar_url),
  );
  return { items, avatars: Object.fromEntries(avatars) };
}
