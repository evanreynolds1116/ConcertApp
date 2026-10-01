import { hasLogFilters, logFiltersToQuery, parseLogFilters } from "@musicjunkie/shared";
import { requireViewer } from "@/lib/auth";
import { fetchFilterOptions, fetchLogPage } from "@/lib/concerts";
import { LogView } from "./log-view";

// The log (home): the viewer's concerts, newest show first, with search and filters in the URL.
export default async function LogPage({ searchParams }: PageProps<"/">) {
  const { supabase, profile } = await requireViewer();
  const filters = parseLogFilters(await searchParams);
  const filtered = hasLogFilters(filters);

  const [page, options, totalLogged, venueName] = await Promise.all([
    fetchLogPage(supabase, profile.id, filters),
    fetchFilterOptions(supabase, profile.id),
    filtered
      ? supabase
          .from("concert_logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
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
  ]);

  const query = logFiltersToQuery(filters);
  return (
    <LogView
      query={query}
      filters={filters}
      initialPage={page}
      totalLogged={totalLogged ?? page.total}
      years={options.years}
      states={options.states}
      venueName={venueName}
    />
  );
}
