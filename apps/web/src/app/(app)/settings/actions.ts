"use server";

import { fieldErrorsOf, profileSchema, type FieldErrors } from "@musicjunkie/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function setPrivacy(isPrivate: boolean): Promise<{ error?: string }> {
  if (typeof isPrivate !== "boolean") return { error: "Invalid setting." };
  const { supabase, profile } = await requireViewer();

  // RLS only lets users update their own profile. Going public auto-accepts pending
  // follow requests (a database trigger).
  const { error } = await supabase
    .from("profiles")
    .update({ is_private: isPrivate })
    .eq("id", profile.id);
  if (error) return { error: "Couldn't save your privacy setting. Please try again." };

  revalidatePath("/", "layout");
  return {};
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

export type ProfileFormState =
  | { error?: string; fieldErrors?: FieldErrors; saved?: boolean; values?: Record<string, string> }
  | undefined;

/** Edit username and display name. */
export async function updateProfile(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const values = {
    username: String(formData.get("username") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
  };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrorsOf(parsed.error), values };
  const { supabase, profile } = await requireViewer();

  const { error } = await supabase
    .from("profiles")
    .update({ username: parsed.data.username, display_name: parsed.data.displayName })
    .eq("id", profile.id);
  if (error) {
    // The unique index on username is case-insensitive (citext).
    if (error.code === "23505")
      return { fieldErrors: { username: ["That username is taken."] }, values };
    return { error: "Couldn't save your profile. Please try again.", values };
  }
  revalidatePath("/", "layout");
  return {
    saved: true,
    values: { username: parsed.data.username, displayName: parsed.data.displayName },
  };
}

/**
 * Point the profile at a newly uploaded avatar (or at none), then delete the old file.
 * The upload itself happens in the browser, straight to the private "avatars" bucket, where
 * storage policies only allow writing in the user's own folder.
 */
export async function setAvatar(path: string | null): Promise<{ error?: string }> {
  const { supabase, profile } = await requireViewer();
  if (path !== null && !new RegExp(`^${profile.id}/[A-Za-z0-9_-]{1,64}\.webp$`).test(path)) {
    return { error: "That upload didn't work. Please try again." };
  }
  const old = profile.avatar_url;
  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: path })
    .eq("id", profile.id);
  if (error) return { error: "Couldn't save your photo. Please try again." };
  if (old && old !== path) await supabase.storage.from("avatars").remove([old]);
  revalidatePath("/", "layout");
  return {};
}

/**
 * Delete the account: avatar files first (storage isn't cleaned up by SQL), then the user,
 * which cascades to their profile, logs, follows and feed items. The confirmation must be
 * their username.
 */
export async function deleteAccount(confirmation: string): Promise<{ error?: string }> {
  const { supabase, profile } = await requireViewer();
  if (confirmation.trim().toLowerCase() !== profile.username.toLowerCase()) {
    return { error: "Type your username exactly to confirm." };
  }
  const { data: files } = await supabase.storage.from("avatars").list(profile.id);
  if (files?.length) {
    await supabase.storage.from("avatars").remove(files.map((f) => `${profile.id}/${f.name}`));
  }
  const { error } = await supabase.rpc("delete_account");
  if (error) return { error: "Couldn't delete your account. Please try again." };
  // The user no longer exists; just clear this browser's session cookies.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/sign-in?deleted=1");
}
