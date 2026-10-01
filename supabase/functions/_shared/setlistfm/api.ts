// Minimal setlist.fm REST client. Plain TypeScript (no Deno APIs) so it can be unit-tested
// with Vitest. Findings behind these choices: docs/setlistfm-notes.md.

export type ApiCity = {
  id: string;
  name: string;
  state?: string;
  stateCode?: string;
  country?: { code: string; name: string };
};
export type ApiVenue = { id: string; name: string; url?: string; city?: ApiCity };
export type ApiSong = { name: string; tape?: boolean };
export type ApiSetlist = {
  id: string;
  eventDate: string; // dd-MM-yyyy
  url: string;
  artist: { mbid: string; name: string; url?: string };
  venue: ApiVenue;
  sets?: { set?: { song?: ApiSong[] }[] };
};
export type SetlistPage = {
  setlists: ApiSetlist[];
  total: number;
  page: number;
  itemsPerPage: number;
};

export type SetlistQuery = {
  artistName?: string;
  venueName?: string;
  venueId?: string;
  cityName?: string;
  stateCode?: string;
  year?: number;
  date?: string; // dd-MM-yyyy
  p?: number;
};

type Deps = {
  apiKey: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Minimum gap between requests. The limit is undocumented; ~1-2/s works with retries. */
  minGapMs?: number;
  cacheTtlMs?: number;
};

export class SetlistFmError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const API = "https://api.setlist.fm/rest/1.0";

export class SetlistFmClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly minGapMs: number;
  private readonly cacheTtlMs: number;
  private lastRequestAt = 0;
  private queue: Promise<unknown> = Promise.resolve();
  // Short-lived cache of raw pages so paging back and forth or repeating a festival search
  // doesn't refetch. In memory only, never stored: we don't mirror setlist.fm.
  private readonly cache = new Map<string, { at: number; page: SetlistPage }>();
  requestCount = 0;

  constructor(private readonly deps: Deps) {
    this.fetchImpl = deps.fetch ?? fetch;
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = deps.now ?? Date.now;
    this.minGapMs = deps.minGapMs ?? 600;
    this.cacheTtlMs = deps.cacheTtlMs ?? 10 * 60 * 1000;
  }

  /** One page of `search/setlists`, always limited to the US. No match is an empty page. */
  searchSetlists(query: SetlistQuery): Promise<SetlistPage> {
    const params = new URLSearchParams({ countryCode: "US" });
    for (const [k, v] of Object.entries(query))
      if (v !== undefined && v !== "") params.set(k, String(v));
    params.sort();
    const key = params.toString();

    const cached = this.cache.get(key);
    if (cached && this.now() - cached.at < this.cacheTtlMs) return Promise.resolve(cached.page);

    // Requests run one at a time so the pacing holds even when callers fire in parallel.
    const run = this.queue.then(() => this.fetchPage(params));
    this.queue = run.catch(() => undefined);
    return run.then((page) => {
      this.cache.set(key, { at: this.now(), page });
      return page;
    });
  }

  private async fetchPage(params: URLSearchParams): Promise<SetlistPage> {
    const url = `${API}/search/setlists?${params}`;
    for (let attempt = 1; ; attempt++) {
      const wait = this.lastRequestAt + this.minGapMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastRequestAt = this.now();
      this.requestCount++;

      const res = await this.fetchImpl(url, {
        headers: {
          Accept: "application/json",
          "Accept-Language": "en",
          "x-api-key": this.deps.apiKey,
        },
      });
      // setlist.fm answers "no results" with a 404 and an error body.
      if (res.status === 404)
        return { setlists: [], total: 0, page: Number(params.get("p") ?? 1), itemsPerPage: 20 };
      // 429s come from AWS API Gateway with no Retry-After header.
      if (res.status === 429 && attempt < 4) {
        await this.sleep(1500 * attempt);
        continue;
      }
      if (!res.ok) throw new SetlistFmError(`setlist.fm responded ${res.status}`, res.status);

      const body = (await res.json()) as {
        setlist?: ApiSetlist[];
        total?: number;
        page?: number;
        itemsPerPage?: number;
      };
      return {
        setlists: body.setlist ?? [],
        total: body.total ?? 0,
        page: body.page ?? 1,
        itemsPerPage: body.itemsPerPage ?? 20,
      };
    }
  }
}
