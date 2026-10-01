import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";

/**
 * The signed-in user and their profile, or null. Verifies the session (not just the cookie),
 * so it's safe for authorization decisions. Cached per request.
 */
export const getViewer = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, is_private")
    .eq("id", userId)
    .single();
  return profile ? { supabase, profile } : null;
});

/** Like getViewer, but sends signed-out visitors to the sign-in page. */
export async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) {
    // A session without a profile means the account is gone; clear it rather than looping
    // between here and the proxy (which only checks the token).
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    redirect(data?.claims?.sub ? "/auth/reset-session" : "/sign-in");
  }
  return viewer;
}
