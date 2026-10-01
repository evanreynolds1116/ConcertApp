import "server-only";
import { cache } from "react";
import { requireViewer } from "@/lib/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A concert log with its show, venue and ordered lineup, or null if it doesn't exist or the
 * viewer can't see it (RLS: someone else's private log simply isn't found). Cached per request.
 */
export const loadConcert = cache(async (id: string) => {
  if (!UUID.test(id)) return null;
  const { supabase, profile } = await requireViewer();
  const { data } = await supabase
    .from("concert_logs")
    .select(
      "id, user_id, rating_tenths, ticket_price_cents, notes, source, profiles!inner(username, display_name), shows!inner(date, festival_name, festival_day_label, setlistfm_url, venues!inner(name, city, state)), log_artists(position, setlistfm_url, artists!inner(id, name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const lineup = [...data.log_artists]
    .sort((a, b) => a.position - b.position)
    .map((a) => ({ id: a.artists.id, name: a.artists.name, setlistUrl: a.setlistfm_url }));
  return {
    supabase,
    log: data,
    show: data.shows,
    venue: data.shows.venues,
    lineup,
    isOwner: data.user_id === profile.id,
    owner: data.profiles,
  };
});
