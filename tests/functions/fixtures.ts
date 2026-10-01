import type {
  ApiSetlist,
  SetlistFmClient,
  SetlistPage,
  SetlistQuery,
} from "../../supabase/functions/_shared/setlistfm/api.ts";

let nextId = 1;

/** A setlist as setlist.fm returns it. `date` is ISO for readability; stored as dd-MM-yyyy. */
export function setlist(opts: {
  artist: string;
  mbid?: string;
  venueId?: string;
  venue?: string;
  city?: string;
  state?: string;
  country?: string;
  date: string;
  songs?: number;
  tapes?: number;
  tour?: string;
}): ApiSetlist {
  const [y, m, d] = opts.date.split("-");
  const id = String(nextId++);
  return {
    id,
    eventDate: `${d}-${m}-${y}`,
    url: `https://www.setlist.fm/setlist/${id}.html`,
    artist: {
      mbid: opts.mbid ?? `mbid-${opts.artist}`,
      name: opts.artist,
      url: `https://www.setlist.fm/setlists/${id}.html`,
    },
    venue: {
      id: opts.venueId ?? "v1",
      name: opts.venue ?? "Ryman Auditorium",
      url: `https://www.setlist.fm/venue/${opts.venueId ?? "v1"}.html`,
      city: {
        id: "c1",
        name: opts.city ?? "Nashville",
        stateCode: opts.state ?? "TN",
        state: "Somewhere",
        country: { code: opts.country ?? "US", name: "United States" },
      },
    },
    ...(opts.tour ? { tour: { name: opts.tour } } : {}),
    sets: {
      set: [
        {
          song: [
            ...Array.from({ length: opts.tapes ?? 0 }, (_, i) => ({
              name: `Intro ${i}`,
              tape: true,
            })),
            ...Array.from({ length: opts.songs ?? 0 }, (_, i) => ({ name: `Song ${i}` })),
          ],
        },
      ],
    },
  };
}

/**
 * A fake setlist.fm client over a list of setlists. Applies the filters our code uses,
 * sorts newest first and pages by 20, like the real API. Records every query.
 */
export function fakeClient(all: ApiSetlist[]) {
  const queries: SetlistQuery[] = [];
  const iso = (s: ApiSetlist) => s.eventDate.split("-").reverse().join("-");
  const client = {
    searchSetlists: async (q: SetlistQuery): Promise<SetlistPage> => {
      queries.push(q);
      const matches = all
        .filter(
          (s) => !q.artistName || s.artist.name.toLowerCase().includes(q.artistName.toLowerCase()),
        )
        .filter(
          (s) => !q.venueName || s.venue.name.toLowerCase().includes(q.venueName.toLowerCase()),
        )
        .filter((s) => !q.venueId || s.venue.id === q.venueId)
        .filter(
          (s) => !q.tourName || !!s.tour?.name.toLowerCase().includes(q.tourName.toLowerCase()),
        )
        .filter((s) => !q.cityName || s.venue.city?.name === q.cityName)
        .filter((s) => !q.stateCode || s.venue.city?.stateCode === q.stateCode)
        .filter((s) => !q.year || iso(s).startsWith(String(q.year)))
        .filter((s) => !q.date || s.eventDate === q.date)
        .sort((a, b) => iso(b).localeCompare(iso(a)));
      const p = q.p ?? 1;
      return {
        setlists: matches.slice((p - 1) * 20, p * 20),
        total: matches.length,
        page: p,
        itemsPerPage: 20,
      };
    },
  };
  return { client: client as unknown as SetlistFmClient, queries };
}

/** Fixed "now" for tests: 2026-09-30, midday US time. */
export const NOW = Date.parse("2026-09-30T20:00:00Z");
