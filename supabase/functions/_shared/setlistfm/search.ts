import type { ApiSetlist, SetlistFmClient, SetlistQuery } from "./api.ts";
import type {
  ConcertResult,
  FestivalDayResult,
  LineupRequest,
  LineupResponse,
  LineupTarget,
  SearchRequest,
  SearchResponse,
  SetlistSearchRequest,
  UsVenue,
} from "./contract.ts";
import { type Festival, findFestival, siteForYear } from "./festivals.ts";
import {
  buildLineup,
  songCount,
  toApiDate,
  toIsoDate,
  toUsVenue,
  US_STATES,
  usToday,
} from "./util.ts";

// Request budgets. setlist.fm pages hold 20 setlists and allow ~1-2 requests a second.
const MONTH_FILTER_MAX_PAGES = 5; // per concert-results page when filtering by month
const FESTIVAL_MAX_PAGES = 20; // a big festival year is 10-20 pages
const FALLBACK_FESTIVAL_MAX_PAGES = 8; // unlisted festivals: a plain venue search
const LINEUP_MAX_PAGES = 10;
const CONCERT_RESULTS_TARGET = 15; // stop paging once a month-filtered page has this many
const MIN_FESTIVAL_DAY_ARTISTS = 8; // a listed festival's year needs a day at least this big
const SMALL_DAY_FRACTION = 0.2; // listed festivals: hide days under 20% of the busiest day
const MIN_TOUR_STOP_ARTISTS = 5; // touring festivals: fewer tagged sets is a band's own show
const MAX_LINEUP_VENUES = 10; // a touring festival stop's stages

type Ctx = { client: SetlistFmClient; now: number };
type ConcertSearchResponse = Omit<SearchResponse, "results"> & { results: ConcertResult[] };
type FestivalSearchResponse = Omit<SearchResponse, "results"> & { results: FestivalDayResult[] };

// ---------------------------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------------------------

export class BadRequest extends Error {}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function optionalInt(value: unknown, name: string, min: number, max: number): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new BadRequest(`${name} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

function requiredText(value: unknown, name: string, maxLength = 200): string {
  if (typeof value !== "string" || !value.trim()) throw new BadRequest(`${name} is required`);
  if (value.length > maxLength) throw new BadRequest(`${name} is too long`);
  return value.trim();
}

/** Validates an untrusted request body. Throws BadRequest with a readable message. */
export function parseRequest(body: unknown, nowMs: number): SetlistSearchRequest {
  if (typeof body !== "object" || body === null) throw new BadRequest("Expected a JSON object");
  const b = body as Record<string, unknown>;

  if (b.action === "search") {
    if (b.mode !== "concert" && b.mode !== "festival")
      throw new BadRequest("mode must be concert or festival");
    const query = requiredText(b.query, "query", 100);
    if (query.length < 2) throw new BadRequest("query must be at least 2 characters");
    const thisYear = Number(usToday(nowMs).slice(0, 4));
    const year = optionalInt(b.year, "year", 1960, thisYear);
    const month = optionalInt(b.month, "month", 1, 12);
    if (month !== undefined && year === undefined) throw new BadRequest("month needs a year");
    let state: string | undefined;
    if (b.state !== undefined && b.state !== null && b.state !== "") {
      if (typeof b.state !== "string" || !US_STATES.has(b.state.toUpperCase())) {
        throw new BadRequest("state must be a US state code");
      }
      state = b.state.toUpperCase();
    }
    const page = optionalInt(b.page, "page", 1, 500);
    return { action: "search", mode: b.mode, query, year, month, state, page };
  }

  if (b.action === "lineup") {
    if (typeof b.date !== "string" || !ISO_DATE.test(b.date))
      throw new BadRequest("date must be yyyy-mm-dd");
    const t = b.target as Record<string, unknown> | undefined;
    let target: LineupTarget;
    if (t?.kind === "venue") {
      target = { kind: "venue", venueId: requiredText(t.venueId, "target.venueId", 40) };
    } else if (t?.kind === "venue-search") {
      const stateCode =
        t.stateCode == null ? null : requiredText(t.stateCode, "target.stateCode", 2);
      target = {
        kind: "venue-search",
        venueName: requiredText(t.venueName, "target.venueName"),
        cityName: t.cityName == null ? null : requiredText(t.cityName, "target.cityName"),
        stateCode,
      };
    } else if (t?.kind === "venues") {
      const ids = t.venueIds;
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_LINEUP_VENUES)
        throw new BadRequest(`target.venueIds must list 1 to ${MAX_LINEUP_VENUES} venues`);
      target = {
        kind: "venues",
        venueIds: ids.map((id) => requiredText(id, "target.venueIds", 40)),
      };
    } else {
      throw new BadRequest("target must be a venue, a venue search or a list of venues");
    }
    const mbid = b.searchedArtistMbid;
    if (mbid != null && (typeof mbid !== "string" || mbid.length > 64))
      throw new BadRequest("bad searchedArtistMbid");
    return {
      action: "lineup",
      target,
      date: b.date,
      searchedArtistMbid: (mbid as string | null | undefined) ?? null,
    };
  }

  throw new BadRequest("action must be search or lineup");
}

// ---------------------------------------------------------------------------------------------
// Concert search: by artist name, falling back to venue name
// ---------------------------------------------------------------------------------------------

export async function searchConcerts(ctx: Ctx, req: SearchRequest): Promise<ConcertSearchResponse> {
  const base: SetlistQuery = { year: req.year, stateCode: req.state };

  // Artist first. If no artist matches, treat the query as a venue. The first page is cached,
  // so repeating this check when the user loads more results costs nothing.
  const probe = await ctx.client.searchSetlists({ ...base, artistName: req.query, p: 1 });
  const byArtist = probe.total > 0;
  const query: SetlistQuery = byArtist
    ? { ...base, artistName: req.query }
    : { ...base, venueName: req.query };

  const today = usToday(ctx.now);
  const monthPrefix = req.month ? `${req.year}-${String(req.month).padStart(2, "0")}` : null;
  const collected: ApiSetlist[] = [];
  let page = req.page ?? 1;
  let nextPage: number | null = null;

  for (let fetched = 0; ; fetched++) {
    const r = await ctx.client.searchSetlists({ ...query, p: page });
    const hasMore = page * r.itemsPerPage < r.total;
    let pastMonth = false;
    for (const s of r.setlists) {
      const iso = toIsoDate(s.eventDate);
      if (!iso || iso > today) continue;
      if (monthPrefix) {
        if (iso.slice(0, 7) > monthPrefix) continue; // later in the year; results are newest first
        if (iso.slice(0, 7) < monthPrefix) {
          pastMonth = true;
          continue;
        }
      }
      collected.push(s);
    }
    if (!hasMore || pastMonth) break;
    // Without a month filter, one setlist.fm page is one page of results.
    if (
      !monthPrefix ||
      collected.length >= CONCERT_RESULTS_TARGET ||
      fetched + 1 >= MONTH_FILTER_MAX_PAGES
    ) {
      nextPage = page + 1;
      break;
    }
    page++;
  }

  return { results: groupConcerts(collected, byArtist), nextPage, incomplete: false };
}

/** One result per show (venue + date). */
function groupConcerts(setlists: ApiSetlist[], byArtist: boolean): ConcertResult[] {
  const groups = new Map<string, { venue: UsVenue; iso: string; setlists: ApiSetlist[] }>();
  for (const s of setlists) {
    const iso = toIsoDate(s.eventDate);
    const venue = toUsVenue(s.venue);
    if (!iso || !venue) continue;
    const key = `${s.venue.id}|${iso}`;
    const group = groups.get(key) ?? { venue, iso, setlists: [] };
    group.setlists.push(s);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, g]) => {
    // Artist search: every setlist here is the searched artist. Venue search: lead with the
    // longest set, which is usually the headliner.
    const lead = byArtist
      ? g.setlists[0]!
      : [...g.setlists].sort((a, b) => songCount(b) - songCount(a))[0]!;
    return {
      kind: "concert",
      key,
      date: g.iso,
      venue: g.venue,
      title: lead.artist.name,
      artistMbid: byArtist ? lead.artist.mbid || null : null,
      setlistfmUrl: lead.url,
      target: { kind: "venue", venueId: lead.venue.id },
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Festival search: one result per festival day
// ---------------------------------------------------------------------------------------------

export async function searchFestivalDays(
  ctx: Ctx,
  req: SearchRequest,
): Promise<FestivalSearchResponse> {
  const festival = findFestival(req.query);
  if (festival?.touring) return searchTourStops(ctx, req, festival, festival.touring);
  const site = festival ? siteForYear(festival, req.year) : null;
  if (festival && !site) return { results: [], nextPage: null, incomplete: false }; // e.g. Riot Fest before 2015
  if (site && req.state && site.grounds.state !== req.state)
    return { results: [], nextPage: null, incomplete: false };

  // Listed festivals: every stage at the grounds counts as one day. Otherwise: a venue-name
  // search, one result per venue per day, named after what the user typed.
  const query: SetlistQuery = site
    ? { ...site.search, cityName: site.search.cityName ?? undefined, year: req.year }
    : { venueName: req.query, stateCode: req.state, year: req.year };
  const isFestivalDate = festival?.isFestivalDate ?? (() => true);
  const maxPages = festival ? FESTIVAL_MAX_PAGES : FALLBACK_FESTIVAL_MAX_PAGES;
  const earliestMonth = festival ? Math.min(...festival.months) : 1;
  const today = usToday(ctx.now);

  type Day = { iso: string; venue: UsVenue; artists: Set<string> };
  const daysByYear = new Map<number, Map<string, Day>>();
  // A listed festival's year counts once its biggest day looks like a festival. Grounds also
  // host small events, and setlist.fm may not have this year's edition yet.
  const isRealEdition = (y: number) =>
    !festival ||
    Math.max(0, ...[...(daysByYear.get(y)?.values() ?? [])].map((d) => d.artists.size)) >=
      MIN_FESTIVAL_DAY_ARTISTS;
  // Without a year: the most recent real edition. Results come newest first.
  let windowYear: number | undefined = req.year;
  let incomplete = true;

  for (let p = 1; p <= maxPages; p++) {
    const r = await ctx.client.searchSetlists({ ...query, p });
    let reachedEnd = false;
    for (const s of r.setlists) {
      const iso = toIsoDate(s.eventDate);
      const venue = toUsVenue(s.venue);
      if (!iso || !venue || iso > today) continue;
      if (req.month && Number(iso.slice(5, 7)) !== req.month) continue;
      if (!isFestivalDate(iso)) continue;
      const y = Number(iso.slice(0, 4));
      windowYear ??= y;
      if (y < windowYear) {
        if (req.year || isRealEdition(windowYear)) {
          reachedEnd = true;
          continue;
        }
        windowYear = y; // that year was too thin; try the one before
      }
      const days = daysByYear.get(y) ?? new Map<string, Day>();
      const key = site ? iso : `${venue.setlistfmId}|${iso}`;
      const day = days.get(key) ?? {
        iso,
        venue: site ? { ...site.grounds } : venue,
        artists: new Set<string>(),
      };
      if (site && s.venue.id === site.grounds.setlistfmId && s.venue.url)
        day.venue.url = s.venue.url;
      day.artists.add(s.artist.mbid || s.artist.name.toLowerCase());
      days.set(key, day);
      daysByYear.set(y, days);
    }
    // Stop once we're before this year's festival window (if it's the edition we'll show).
    const oldest = r.setlists
      .map((s) => toIsoDate(s.eventDate))
      .filter(Boolean)
      .sort()[0];
    const windowStart = `${windowYear}-${String(earliestMonth).padStart(2, "0")}-01`;
    if (windowYear && oldest && oldest < windowStart && (req.year || isRealEdition(windowYear)))
      reachedEnd = true;
    if (reachedEnd || p * r.itemsPerPage >= r.total) {
      incomplete = false;
      break;
    }
  }

  // Show the chosen edition, or the most recent real one if we ran out of pages.
  let shownYear = windowYear;
  if (!req.year && shownYear !== undefined && !isRealEdition(shownYear)) {
    shownYear = [...daysByYear.keys()].sort((a, b) => b - a).find(isRealEdition) ?? shownYear;
  }
  let days = [...(shownYear !== undefined ? (daysByYear.get(shownYear)?.values() ?? []) : [])];
  if (festival) {
    // Drop pre-parties and side events: days far smaller than the festival's busiest day.
    const biggest = Math.max(0, ...days.map((d) => d.artists.size));
    days = days.filter((d) => d.artists.size >= SMALL_DAY_FRACTION * biggest);
  }

  const festivalName = festival?.name ?? req.query;
  const results: FestivalDayResult[] = [];
  // Number days per venue, in date order. Runs of consecutive dates are one weekend.
  const byVenue = new Map<string, Day[]>();
  for (const day of days) {
    const k = day.venue.setlistfmId ?? day.venue.name;
    byVenue.set(k, [...(byVenue.get(k) ?? []), day]);
  }
  for (const venueDays of byVenue.values()) {
    venueDays.sort((a, b) => a.iso.localeCompare(b.iso));
    const runs: Day[][] = [];
    for (const day of venueDays) {
      const run = runs.at(-1);
      const prev = run?.at(-1);
      if (run && prev && daysBetween(prev.iso, day.iso) <= 1) run.push(day);
      else runs.push([day]);
    }
    runs.forEach((run, r) =>
      run.forEach((day, d) => {
        const target: LineupTarget = site
          ? {
              kind: "venue-search",
              venueName: site.search.venueName,
              cityName: site.search.cityName,
              stateCode: site.search.stateCode,
            }
          : { kind: "venue", venueId: day.venue.setlistfmId! };
        results.push({
          kind: "festival-day",
          key: `${day.venue.setlistfmId ?? day.venue.name}|${day.iso}`,
          date: day.iso,
          venue: day.venue,
          festivalName,
          dayLabel: runs.length > 1 ? `Weekend ${r + 1} · Day ${d + 1}` : `Day ${d + 1}`,
          artistCount: day.artists.size,
          target,
        });
      }),
    );
  }
  results.sort((a, b) => a.date.localeCompare(b.date) || a.venue.name.localeCompare(b.venue.name));
  return { results, nextPage: null, incomplete };
}

// ---------------------------------------------------------------------------------------------
// Touring festivals: one result per stop
// ---------------------------------------------------------------------------------------------

async function searchTourStops(
  ctx: Ctx,
  req: SearchRequest,
  festival: Festival,
  touring: NonNullable<Festival["touring"]>,
): Promise<FestivalSearchResponse> {
  const today = usToday(ctx.now);
  const yearOf = (iso: string) => Number(iso.slice(0, 4));
  const inMonth = (iso: string) => !req.month || Number(iso.slice(5, 7)) === req.month;
  const results: FestivalDayResult[] = [];

  // Stops listed by venue: the year asked for, every year in the state asked for, or else the
  // latest year with a stop.
  const listed = touring.stops.filter((s) => s.from <= today);
  const latestYear = Math.max(...listed.map((s) => yearOf(s.from)));
  const stops = listed.filter(
    (s) =>
      (req.year ? yearOf(s.from) === req.year : req.state || yearOf(s.from) === latestYear) &&
      (!req.state || s.site.grounds.state === req.state),
  );
  for (const { from, to, site } of stops) {
    const days = isoRange(from, to);
    for (const [i, iso] of days.entries()) {
      if (iso > today || !inMonth(iso)) continue;
      const page = await ctx.client.searchSetlists({
        ...site.search,
        cityName: site.search.cityName ?? undefined,
        date: toApiDate(iso),
      });
      if (page.total === 0) continue;
      const url = page.setlists.find((s) => s.venue.id === site.grounds.setlistfmId)?.venue.url;
      results.push({
        kind: "festival-day",
        key: `${site.grounds.setlistfmId}|${iso}`,
        date: iso,
        venue: { ...site.grounds, url: url ?? null },
        festivalName: festival.name,
        dayLabel: days.length > 1 ? `Day ${i + 1}` : "",
        artistCount: page.total,
        target: {
          kind: "venue-search",
          venueName: site.search.venueName,
          cityName: site.search.cityName,
          stateCode: site.search.stateCode,
        },
      });
    }
  }

  // Tagged years: every set tagged with the tour in the state, grouped into stops by city and
  // date (stages can be filed as separate venues). Too many pages without a state.
  const [firstTagYear, lastTagYear] = touring.tagYears;
  const wantsTagYears = !req.year || (req.year >= firstTagYear && req.year <= lastTagYear);
  let incomplete = false;
  if (wantsTagYears && req.state) {
    type Stop = {
      iso: string;
      artists: Set<string>;
      venues: Map<string, { venue: UsVenue; sets: number }>;
    };
    const byStop = new Map<string, Stop>();
    incomplete = true;
    for (let p = 1; p <= FESTIVAL_MAX_PAGES; p++) {
      const r = await ctx.client.searchSetlists({
        tourName: touring.tourName,
        stateCode: req.state,
        year: req.year,
        p,
      });
      for (const s of r.setlists) {
        const iso = toIsoDate(s.eventDate);
        const venue = toUsVenue(s.venue);
        if (!iso || !venue?.setlistfmId || iso > today || !inMonth(iso)) continue;
        if (yearOf(iso) < firstTagYear || yearOf(iso) > lastTagYear) continue;
        if (!festival.isFestivalDate(iso)) continue;
        const key = `${venue.city}|${venue.state}|${iso}`;
        const stop = byStop.get(key) ?? { iso, artists: new Set<string>(), venues: new Map() };
        stop.artists.add(s.artist.mbid || s.artist.name.toLowerCase());
        const v = stop.venues.get(venue.setlistfmId) ?? { venue, sets: 0 };
        v.sets++;
        stop.venues.set(venue.setlistfmId, v);
        byStop.set(key, stop);
      }
      if (p * r.itemsPerPage >= r.total) {
        incomplete = false;
        break;
      }
    }
    for (const stop of byStop.values()) {
      if (stop.artists.size < MIN_TOUR_STOP_ARTISTS) continue;
      // Saved against the stage with the most sets, so everyone at the stop shares one show.
      const venues = [...stop.venues.values()].sort((a, b) => b.sets - a.sets);
      const grounds = venues[0]!.venue;
      results.push({
        kind: "festival-day",
        key: `${grounds.setlistfmId}|${stop.iso}`,
        date: stop.iso,
        venue: grounds,
        festivalName: festival.name,
        dayLabel: "",
        artistCount: stop.artists.size,
        target: {
          kind: "venues",
          venueIds: venues.slice(0, MAX_LINEUP_VENUES).map((v) => v.venue.setlistfmId!),
        },
      });
    }
  }

  // A year's stops in tour order; across years, the latest first.
  results.sort((a, b) => (req.year ? 1 : -1) * a.date.localeCompare(b.date));
  return { results, nextPage: null, incomplete, needsState: wantsTagYears && !req.state };
}

/** Every ISO date from `from` to `to`, inclusive. */
function isoRange(from: string, to: string): string[] {
  const days = [from];
  while (days.at(-1)! < to) {
    const d = new Date(`${days.at(-1)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

// ---------------------------------------------------------------------------------------------
// Lineup: every setlist for the show, as one ordered list of artists
// ---------------------------------------------------------------------------------------------

export async function getLineup(ctx: Ctx, req: LineupRequest): Promise<LineupResponse> {
  const t = req.target;
  const queries: SetlistQuery[] =
    t.kind === "venue"
      ? [{ venueId: t.venueId }]
      : t.kind === "venues"
        ? t.venueIds.map((venueId) => ({ venueId }))
        : [
            {
              venueName: t.venueName,
              cityName: t.cityName ?? undefined,
              stateCode: t.stateCode ?? undefined,
            },
          ];
  const setlists: ApiSetlist[] = [];
  for (const query of queries) {
    for (let p = 1; p <= LINEUP_MAX_PAGES; p++) {
      const r = await ctx.client.searchSetlists({ ...query, date: toApiDate(req.date), p });
      setlists.push(...r.setlists);
      if (p * r.itemsPerPage >= r.total || r.setlists.length === 0) break;
    }
  }
  const artists = buildLineup(setlists, req.searchedArtistMbid);
  const lead = artists[0];
  const leadSetlist = lead
    ? setlists.find((s) => (s.artist.mbid || null) === lead.mbid && s.artist.name === lead.name)
    : undefined;
  return { artists, setlistfmUrl: leadSetlist?.url ?? null };
}

/** Runs a validated request. */
export function handle(
  ctx: Ctx,
  req: SetlistSearchRequest,
): Promise<SearchResponse | LineupResponse> {
  if (req.action === "lineup") return getLineup(ctx, req);
  return req.mode === "festival" ? searchFestivalDays(ctx, req) : searchConcerts(ctx, req);
}
