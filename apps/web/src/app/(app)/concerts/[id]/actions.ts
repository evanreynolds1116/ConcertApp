"use server";

import { editLogSchema } from "@musicjunkie/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { updateLog } from "@/lib/concerts";

/** Saves an edited lineup and details (update_log: one transaction, owner only). */
export async function updateConcert(input: unknown): Promise<{ error?: string }> {
  const parsed = editLogSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Some details aren't valid." };
  const { supabase } = await requireViewer();

  const { error } = await updateLog(supabase, parsed.data);
  if (error) {
    if (error.code === "P0002") return { error: "This concert no longer exists." };
    console.error("update_log failed", error.code, error.message);
    return { error: "Couldn't save your changes. Please try again." };
  }
  revalidatePath("/", "layout");
  redirect(`/concerts/${parsed.data.logId}`);
}

/** Deletes one of the viewer's logs. Its feed item goes with it (cascade). */
export async function deleteConcert(logId: string): Promise<{ error?: string }> {
  const { supabase, profile } = await requireViewer();
  // RLS only lets owners delete; the user_id check just makes "not yours" an explicit miss.
  const { data, error } = await supabase
    .from("concert_logs")
    .delete()
    .eq("id", logId)
    .eq("user_id", profile.id)
    .select("id");
  if (error || !data?.length) return { error: "Couldn't delete this concert. Please try again." };
  revalidatePath("/", "layout");
  redirect("/");
}
