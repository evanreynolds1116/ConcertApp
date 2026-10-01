import "server-only";
import { FEED_PAGE_SIZE } from "@musicjunkie/shared";
import type { createClient } from "./supabase/server";

// Typed access to the social functions (supabase/migrations/*_social.sql). As in concerts.ts,
// the generated types don't know which columns can be null, so these types say so.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type FollowStatus = "none" | "pending" | "accepted";

export type Person = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  is_private?: boolean;
  follow_status?: FollowStatus;
};

export type ProfileOverview = Person & {
  is_private: boolean;
  is_self: boolean;
  can_view: boolean;
  follow_status: FollowStatus;
  follows_viewer: boolean;
  concerts: number | null;
  followers: number | null;
  following: number | null;
};

export type FeedItem = {
  id: string;
  created_at: string;
  type: "concert_logged" | "follow_started";
  actor_id: string;
  actor_username: string;
  actor_display_name: string;
  actor_avatar_url: string | null;
  target_id: string | null;
  target_username: string | null;
  target_display_name: string | null;
  log_id: string | null;
  show_date: string | null;
  festival_name: string | null;
  festival_day_label: string | null;
  venue_name: string | null;
  city: string | null;
  state: string | null;
  headliner: string | null;
  artist_count: number | null;
  rating_tenths: number | null;
};

const AVATAR_LINK_SECONDS = 60 * 60;

/**
 * Signed links for avatars in the private "avatars" bucket, keyed by storage path. One request
 * for the whole page. Links last an hour; pages re-sign on every render.
 */
export async function signAvatars(
  supabase: Supabase,
  paths: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (unique.length === 0) return new Map();
  const { data } = await supabase.storage
    .from("avatars")
    .createSignedUrls(unique, AVATAR_LINK_SECONDS);
  const urls = new Map<string, string>();
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

export async function searchPeople(supabase: Supabase, query: string): Promise<Person[]> {
  const { data, error } = await supabase.rpc("search_people", { p_query: query });
  if (error) throw new Error(`search_people failed: ${error.message}`);
  return (data ?? []) as Person[];
}

export async function fetchProfile(
  supabase: Supabase,
  username: string,
): Promise<ProfileOverview | null> {
  const { data } = await supabase.rpc("profile_overview", { p_username: username }).maybeSingle();
  return (data as ProfileOverview | null) ?? null;
}

export async function fetchFollowList(
  supabase: Supabase,
  userId: string,
  kind: "followers" | "following",
): Promise<Person[]> {
  const { data, error } = await supabase.rpc("follow_list", { p_user_id: userId, p_kind: kind });
  if (error) throw new Error(`follow_list failed: ${error.message}`);
  return (data ?? []) as Person[];
}

export async function fetchFollowRequests(supabase: Supabase): Promise<Person[]> {
  const { data } = await supabase.rpc("follow_requests");
  return (data ?? []) as Person[];
}

export async function fetchFeed(
  supabase: Supabase,
  cursor?: { createdAt: string; id: string },
): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc("feed", {
    p_before_created_at: cursor?.createdAt,
    p_before_id: cursor?.id,
    p_limit: FEED_PAGE_SIZE,
  });
  if (error) throw new Error(`feed failed: ${error.message}`);
  return (data ?? []) as unknown as FeedItem[];
}
