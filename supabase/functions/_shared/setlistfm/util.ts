import type { ApiSetlist, ApiVenue } from "./api.ts";
import type { LineupArtist, UsVenue } from "./contract.ts";

export const US_STATES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
]);

/** setlist.fm's "dd-MM-yyyy" to ISO "yyyy-mm-dd". Returns null for anything malformed. */
export function toIsoDate(eventDate: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(eventDate);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** ISO "yyyy-mm-dd" to setlist.fm's "dd-MM-yyyy". */
export function toApiDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

/** Today's date in the US (Hawaii, the latest US time zone), as ISO. Later shows are upcoming. */
export function usToday(nowMs: number): string {
  return new Date(nowMs - 10 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** A setlist.fm venue as a US venue, or null if it isn't one we can store (non-US, no city). */
export function toUsVenue(venue: ApiVenue): UsVenue | null {
  const city = venue.city;
  if (!city || city.country?.code !== "US" || !city.name) return null;
  const state = city.stateCode?.toUpperCase() ?? "";
  if (!US_STATES.has(state)) return null;
  return {
    setlistfmId: venue.id,
    name: venue.name,
    city: city.name,
    state,
    url: venue.url ?? null,
  };
}

/** Songs actually played: recorded intros and outros ("tape") don't count. */
export function songCount(setlist: ApiSetlist): number {
  let n = 0;
  for (const set of setlist.sets?.set ?? []) for (const song of set.song ?? []) if (!song.tape) n++;
  return n;
}

/**
 * The lineup for one show from all its setlists. One entry per artist: setlist.fm can have two
 * setlists for the same artist on a date (early and late shows), which we treat as one show.
 * Default order: the searched artist, then most songs first, then A-Z (many setlists have no
 * songs entered, and the API's own order isn't billing order).
 */
export function buildLineup(
  setlists: ApiSetlist[],
  searchedArtistMbid?: string | null,
): LineupArtist[] {
  const byArtist = new Map<string, LineupArtist>();
  for (const s of setlists) {
    const key = s.artist.mbid || `name:${s.artist.name.toLowerCase()}`;
    const songs = songCount(s);
    const existing = byArtist.get(key);
    if (!existing) {
      byArtist.set(key, {
        name: s.artist.name,
        mbid: s.artist.mbid || null,
        setlistfmUrl: s.artist.url ?? null,
        songCount: songs,
      });
    } else if (songs > existing.songCount) {
      existing.songCount = songs;
    }
  }
  return [...byArtist.values()].sort((a, b) => {
    const aFirst = searchedArtistMbid != null && a.mbid === searchedArtistMbid;
    const bFirst = searchedArtistMbid != null && b.mbid === searchedArtistMbid;
    if (aFirst !== bFirst) return aFirst ? -1 : 1;
    if (a.songCount !== b.songCount) return b.songCount - a.songCount;
    return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  });
}
