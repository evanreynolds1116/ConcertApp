"use server";

import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth";
import type { FollowStatus } from "@/lib/social";

// Following (docs/spec.md, "Following"). The rules live in the database: RLS decides who may
// insert/update/delete which follows rows, and a trigger sets a new follow to "accepted"
// (public account) or "pending" (private). These actions just make the calls.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Result = { status?: FollowStatus; error?: string };

function done(result: Result): Result {
  revalidatePath("/", "layout");
  return result;
}

/** Follow someone: accepted right away for public accounts, a request for private ones. */
export async function follow(userId: string): Promise<Result> {
  if (!UUID.test(userId)) return { error: "Unknown person." };
  const { supabase, profile } = await requireViewer();
  const { data, error } = await supabase
    .from("follows")
    .insert({ follower_id: profile.id, followee_id: userId })
    .select("status")
    .single();
  if (error) {
    if (error.code === "23505") return done({ error: "You already follow them or asked to." });
    return { error: "Couldn't follow. Please try again." };
  }
  return done({ status: data.status as FollowStatus });
}

/** Unfollow, or cancel a pending request. */
export async function unfollow(userId: string): Promise<Result> {
  if (!UUID.test(userId)) return { error: "Unknown person." };
  const { supabase, profile } = await requireViewer();
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", profile.id)
    .eq("followee_id", userId);
  if (error) return { error: "Couldn't update. Please try again." };
  return done({ status: "none" });
}

/** Accept a request to follow you. */
export async function acceptRequest(userId: string): Promise<Result> {
  if (!UUID.test(userId)) return { error: "Unknown person." };
  const { supabase, profile } = await requireViewer();
  const { data, error } = await supabase
    .from("follows")
    .update({ status: "accepted" })
    .eq("follower_id", userId)
    .eq("followee_id", profile.id)
    .eq("status", "pending")
    .select("status");
  if (error || !data?.length) return { error: "That request is no longer there." };
  return done({ status: "accepted" });
}

/** Decline a request, or remove someone who follows you. Either way the row is deleted. */
export async function removeFollower(userId: string): Promise<Result> {
  if (!UUID.test(userId)) return { error: "Unknown person." };
  const { supabase, profile } = await requireViewer();
  const { error } = await supabase
    .from("follows")
    .delete()
    .eq("follower_id", userId)
    .eq("followee_id", profile.id);
  if (error) return { error: "Couldn't update. Please try again." };
  return done({ status: "none" });
}
