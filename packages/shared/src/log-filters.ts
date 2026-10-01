import { EARLIEST_YEAR, US_STATES, usToday } from "./concert";

// Log filters (docs/spec.md, "Log"): artist search plus year, month, state, and the venue and
// city filters that leaderboard rows link to. They combine, and live in the URL.

export type LogFilters = {
  artist?: string;
  /** One exact artist (leaderboard links), unlike `artist`, which matches part of a name. */
  artistId?: string;
  year?: number;
  month?: number;
  state?: string;
  /** Always with `state`: a city is a "City, ST" pair. */
  city?: string;
  venueId?: string;
};

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATE_CODES = new Set<string>(US_STATES.map(([code]) => code));

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function get(params: Params, key: string): string | undefined {
  const v = params instanceof URLSearchParams ? params.get(key) : params[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s?.trim() || undefined;
}

/** URL params -> filters. Anything invalid is dropped rather than erroring. */
export function parseLogFilters(params: Params): LogFilters {
  const filters: LogFilters = {};
  const artist = get(params, "artist");
  if (artist) filters.artist = artist.slice(0, 100);

  const artistId = get(params, "artistId");
  if (artistId && UUID.test(artistId)) filters.artistId = artistId.toLowerCase();

  const year = Number(get(params, "year"));
  if (Number.isInteger(year) && year >= EARLIEST_YEAR && year <= Number(usToday().slice(0, 4)))
    filters.year = year;

  const month = Number(get(params, "month"));
  if (Number.isInteger(month) && month >= 1 && month <= 12) filters.month = month;

  const state = get(params, "state")?.toUpperCase();
  if (state && STATE_CODES.has(state)) filters.state = state;

  const city = get(params, "city");
  if (city && filters.state) filters.city = city.slice(0, 100);

  const venue = get(params, "venue");
  if (venue && UUID.test(venue)) filters.venueId = venue.toLowerCase();

  return filters;
}

/** Filters -> URL query string (no leading "?"), in a stable order. */
export function logFiltersToQuery(filters: LogFilters): string {
  const q = new URLSearchParams();
  if (filters.artist) q.set("artist", filters.artist);
  if (filters.artistId) q.set("artistId", filters.artistId);
  if (filters.year) q.set("year", String(filters.year));
  if (filters.month) q.set("month", String(filters.month));
  if (filters.state) q.set("state", filters.state);
  if (filters.city && filters.state) q.set("city", filters.city);
  if (filters.venueId) q.set("venue", filters.venueId);
  return q.toString();
}

export function hasLogFilters(filters: LogFilters): boolean {
  return Object.values(filters).some((v) => v !== undefined);
}
