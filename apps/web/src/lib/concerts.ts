import "server-only";
import type { LogFilters } from "@musicjunkie/shared";
import type { createClient } from "./supabase/server";

// Typed access to the log functions in supabase/migrations (user_log, log_filter_options,
// also_here, update_log). The generated types mark every function result column as non-null
// and every argument as required non-null; these types say what the SQL actually returns.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const LOG_PAGE_SIZE = 20;

export type LogEntry = {
  log_id: string;
  show_date: string;
  festival_name: string | null;
  festival_day_label: string | null;
  venue_id: string;
  venue_name: string;
  city: string;
  state: string;
  rating_tenths: number | null;
  artists: string[];
  total_count: number;
};

export type LogPage = { entries: LogEntry[]; total: number };

/** One page of a user's log, newest show first. RLS hides logs the viewer can't see. */
export async function fetchLogPage(
  supabase: Supabase,
  userId: string,
  filters: LogFilters,
  offset = 0,
): Promise<LogPage> {
  const { data, error } = await supabase.rpc("user_log", {
    p_user_id: userId,
    p_artist: filters.artist,
    p_artist_id: filters.artistId,
    p_year: filters.year,
    p_month: filters.month,
    p_state: filters.state,
    p_city: filters.city,
    p_venue_id: filters.venueId,
    p_limit: LOG_PAGE_SIZE,
    p_offset: offset,
  });
  if (error) throw new Error(`user_log failed: ${error.message}`);
  const entries = (data ?? []) as unknown as LogEntry[];
  return { entries, total: entries[0]?.total_count ?? 0 };
}

export type UserStats = {
  concerts: number;
  artists: number;
  venues: number;
  cities: number;
  states: number;
  spent_cents: number;
  priced_concerts: number;
  first_show: string | null;
};

export type YearStats = {
  year: number;
  concerts: number;
  spent_cents: number;
  priced_concerts: number;
};

export type LeaderboardKind = "artist" | "venue" | "city" | "state";
export type LeaderboardRow = {
  item_id: string | null;
  name: string;
  city: string | null;
  state: string | null;
  concerts: number;
};

/** The Stats screen's data. RLS applies: someone else's private stats come back empty. */
export async function fetchStats(supabase: Supabase, userId: string) {
  const kinds: LeaderboardKind[] = ["artist", "venue", "city", "state"];
  const [stats, byYear, ...boards] = await Promise.all([
    supabase.rpc("user_stats", { p_user_id: userId }).single(),
    supabase.rpc("stats_by_year", { p_user_id: userId }),
    ...kinds.map((kind) => supabase.rpc("leaderboard", { p_user_id: userId, p_kind: kind })),
  ]);
  for (const r of [stats, byYear, ...boards]) {
    if (r.error) throw new Error(`stats failed: ${r.error.message}`);
  }
  return {
    stats: stats.data as unknown as UserStats,
    byYear: (byYear.data ?? []) as YearStats[],
    leaderboards: Object.fromEntries(
      kinds.map((kind, i) => [kind, (boards[i]!.data ?? []) as LeaderboardRow[]]),
    ) as Record<LeaderboardKind, LeaderboardRow[]>,
  };
}

export async function fetchFilterOptions(supabase: Supabase, userId: string) {
  const { data } = await supabase.rpc("log_filter_options", { p_user_id: userId }).single();
  return { years: data?.years ?? [], states: data?.states ?? [] };
}

export type AlsoHerePerson = {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export async function fetchAlsoHere(supabase: Supabase, logId: string): Promise<AlsoHerePerson[]> {
  const { data } = await supabase.rpc("also_here", { p_log_id: logId });
  return (data ?? []) as AlsoHerePerson[];
}

/** Replaces a log's lineup and details. null clears rating and price. */
export function updateLog(
  supabase: Supabase,
  args: {
    logId: string;
    artists: ({ artistId: string } | { name: string })[];
    ratingTenths: number | null;
    ticketPriceCents: number | null;
    notes: string;
  },
) {
  return supabase.rpc("update_log", {
    p_log_id: args.logId,
    p_artists: args.artists,
    // The generated types don't allow null here, but the function treats null as "clear".
    p_rating_tenths: args.ratingTenths as number,
    p_ticket_price_cents: args.ticketPriceCents as number,
    p_notes: args.notes,
  });
}
