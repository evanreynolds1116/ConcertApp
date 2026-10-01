"use server";

import { concertDraftSchema } from "@musicjunkie/shared";
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";

export type SaveResult = { error?: string; duplicateLogId?: string };

/** Saves a concert through log_concert (one transaction), then opens it. */
export async function saveConcert(input: unknown): Promise<SaveResult> {
  const parsed = concertDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Some details aren't valid." };
  }
  const d = parsed.data;
  const { supabase } = await requireViewer();

  const { data: logId, error } = await supabase.rpc("log_concert", {
    p_source: d.source,
    p_date: d.date,
    p_venue: d.venue,
    p_artists: d.artists.map(({ name, mbid, setlistfmUrl, setlistUrl }) => ({
      name,
      mbid,
      setlistfmUrl,
      setlistUrl,
    })),
    p_festival_name: d.festivalName ?? undefined,
    p_festival_day_label: d.festivalDayLabel ?? undefined,
    p_setlistfm_url: d.setlistfmUrl ?? undefined,
    p_rating_tenths: d.ratingTenths ?? undefined,
    p_ticket_price_cents: d.ticketPriceCents ?? undefined,
    p_notes: d.notes || undefined,
  });

  if (error) {
    if (error.code === "23505" && error.message === "already_logged" && error.details) {
      return { duplicateLogId: error.details };
    }
    console.error("log_concert failed", error.code, error.message);
    return { error: "Couldn't save this concert. Please try again." };
  }

  redirect(`/concerts/${logId}`);
}
