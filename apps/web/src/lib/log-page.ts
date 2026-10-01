import "server-only";
import { hasLogFilters, logFiltersToQuery, parseLogFilters } from "@musicjunkie/shared";
import { fetchFilterOptions, fetchLogPage } from "./concerts";
import type { createClient } from "./supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Everything LogView needs for one user's log, from the page's URL search params. */
export async function loadLogView(
  supabase: Supabase,
  userId: string,
  searchParams: Record<string, string | string[] | undefined>,
) {
  const filters = parseLogFilters(searchParams);
  const filtered = hasLogFilters(filters);

  const [page, options, totalLogged, venueName, artistName] = await Promise.all([
    fetchLogPage(supabase, userId, filters),
    fetchFilterOptions(supabase, userId),
    filtered
      ? supabase
          .from("concert_logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .then(({ count }) => count ?? 0)
      : null,
    filters.venueId
      ? supabase
          .from("venues")
          .select("name")
          .eq("id", filters.venueId)
          .maybeSingle()
          .then(({ data }) => data?.name ?? "Venue")
      : null,
    filters.artistId
      ? supabase
          .from("artists")
          .select("name")
          .eq("id", filters.artistId)
          .maybeSingle()
          .then(({ data }) => data?.name ?? "Artist")
      : null,
  ]);

  return {
    userId,
    query: logFiltersToQuery(filters),
    filters,
    initialPage: page,
    totalLogged: totalLogged ?? page.total,
    years: options.years,
    states: options.states,
    venueName,
    artistName,
  };
}
