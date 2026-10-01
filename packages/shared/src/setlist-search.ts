// Contract for the `setlist-search` Edge Function (supabase/functions/setlist-search).
// The function keeps its own copy of these types (it can't import from this package when
// deployed); tests/functions checks at compile time that the two stay identical.

/** A US venue as the app stores it. `state` is a USPS code, e.g. "TN". */
export type UsVenue = {
  setlistfmId: string | null;
  name: string;
  city: string;
  state: string;
  url: string | null;
};

/**
 * How to fetch a lineup: every setlist at one venue on a date (a concert), every setlist
 * matching a venue-name search on a date (a festival whose stages are filed as separate
 * venues), or every setlist at a few venues on a date (a touring festival's stop).
 */
export type LineupTarget =
  | { kind: "venue"; venueId: string }
  | { kind: "venue-search"; venueName: string; cityName: string | null; stateCode: string | null }
  | { kind: "venues"; venueIds: string[] };

export type ConcertResult = {
  kind: "concert";
  key: string;
  date: string; // ISO yyyy-mm-dd
  venue: UsVenue;
  /** The artist searched for, or (for a venue search) the artist with the longest set. */
  title: string;
  artistMbid: string | null;
  setlistfmUrl: string;
  target: LineupTarget;
};

export type FestivalDayResult = {
  kind: "festival-day";
  key: string;
  date: string; // ISO yyyy-mm-dd
  /** The festival grounds; every log of this day is saved against this venue. */
  venue: UsVenue;
  festivalName: string;
  /** "Day 2", or "Weekend 2 · Day 1" for festivals that run over two weekends. Empty for a
   * one-day touring festival stop. */
  dayLabel: string;
  artistCount: number;
  target: LineupTarget;
};

export type SearchResult = ConcertResult | FestivalDayResult;

export type SearchRequest = {
  action: "search";
  mode: "concert" | "festival";
  query: string;
  year?: number;
  month?: number; // 1-12; only with a year
  state?: string;
  page?: number; // concert mode; from a previous response's nextPage
};

export type SearchResponse = {
  results: SearchResult[];
  nextPage: number | null;
  /** True when setlist.fm had more than we could fetch; narrow the search to see the rest. */
  incomplete: boolean;
  /** Festival mode: a touring festival whose older stops are searched one state at a time. */
  needsState?: boolean;
};

export type LineupRequest = {
  action: "lineup";
  target: LineupTarget;
  date: string; // ISO yyyy-mm-dd
  /** Put this artist first: the one the user searched for. */
  searchedArtistMbid?: string | null;
};

export type LineupArtist = {
  name: string;
  mbid: string | null;
  /** The artist's setlist.fm page. */
  setlistfmUrl: string | null;
  /** The artist's setlist at this show. */
  setlistUrl: string | null;
  songCount: number;
};

export type LineupResponse = {
  /** In default order: searched artist first, then most songs first, then A-Z. */
  artists: LineupArtist[];
  /** A setlist.fm page for this show, for attribution. */
  setlistfmUrl: string | null;
};

export type SetlistSearchRequest = SearchRequest | LineupRequest;
