import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireViewer } from "@/lib/auth";
import { fetchProfile } from "@/lib/social";

/** A profile by username (404 if there's no such user). Cached per request. */
export const loadProfile = cache(async (username: string) => {
  const viewer = await requireViewer();
  const profile = await fetchProfile(viewer.supabase, decodeURIComponent(username));
  if (!profile) notFound();
  return { ...viewer, person: profile };
});

export function firstName(displayName: string): string {
  return displayName.split(/\s+/)[0] ?? displayName;
}
