"use server";

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
