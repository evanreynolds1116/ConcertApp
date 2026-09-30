/**
 * Phase 0 throwaway spike: see how setlist.fm returns real shows before we design the
 * `setlist-search` Edge Function. Findings go in docs/setlistfm-notes.md.
 *
 * Run from anywhere in the repo (needs SETLISTFM_API_KEY in the root .env):
 *   pnpm spike:setlistfm            # all cases
 *   pnpm spike:setlistfm festival   # one case: multi | festival | club | none
 *
 * Raw JSON is written to scripts/.spike-output/ (git-ignored; we don't mirror setlist.fm).
 * The API key is read from the environment and never printed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.setlist.fm/rest/1.0";
const OUT_DIR = join(import.meta.dirname, ".spike-output");
const MIN_GAP_MS = 1000; // rate limits aren't documented; 700ms still drew a 429 in run 1

try {
  process.loadEnvFile(join(import.meta.dirname, "..", ".env"));
} catch {
  // No .env file; fall through to the check below.
}
const apiKey = process.env.SETLISTFM_API_KEY?.trim();
if (!apiKey) {
  console.error(
    "SETLISTFM_API_KEY is not set. Add it to .env at the repo root (see .env.example).",
  );
  process.exit(1);
}

// --- Minimal types for the fields we care about -------------------------------------------

interface City {
  id: string;
  name: string;
  state?: string;
  stateCode?: string;
  country: { code: string; name: string };
}
interface Venue {
  id: string;
  name: string;
  url?: string;
  city?: City;
}
interface SetBlock {
  name?: string;
  encore?: number;
  song?: { name: string; tape?: boolean }[];
}
interface Setlist {
  id: string;
  versionId: string;
  eventDate: string;
  lastUpdated: string;
  url: string;
  info?: string;
  artist: { mbid: string; name: string; url?: string };
  venue: Venue;
  tour?: { name: string };
  // The docs example shows `set` at the top level, but the live API nests it: sets.set.
  sets?: { set: SetBlock[] };
}
type Params = Record<string, string | number | undefined>;

// --- HTTP ---------------------------------------------------------------------------------

let lastRequestAt = 0;
let requestCount = 0;
let rateLimitedCount = 0;

async function get(path: string, params: Params = {}): Promise<{ status: number; body: unknown }> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params))
    if (v !== undefined) url.searchParams.set(k, String(v));

  for (let attempt = 1; ; attempt++) {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    requestCount++;

    const res = await fetch(url, {
      headers: { Accept: "application/json", "x-api-key": apiKey!, "Accept-Language": "en" },
    });
    // Log the path and query only; the key is in a header, never in the URL.
    console.log(`  GET ${url.pathname}${url.search} -> ${res.status}`);

    if (res.status === 429 && attempt < 4) {
      rateLimitedCount++;
      const retryAfter = Number(res.headers.get("retry-after")) || attempt * 2;
      const hdrs = [...res.headers].map(([h, v]) => `${h}=${v}`).join(", ");
      console.log(`  429 rate limited, retrying in ${retryAfter}s. Headers: ${hdrs}`);
      await sleep(retryAfter * 1000);
      continue;
    }
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // non-JSON error body; keep the text
    }
    if (requestCount === 1) {
      // Rate limits aren't documented; see whether the API advertises them in headers.
      const rl = [...res.headers].filter(([h]) => h.includes("ratelimit") || h === "retry-after");
      console.log(
        `  rate-limit headers: ${rl.map(([h, v]) => `${h}=${v}`).join(", ") || "(none)"}`,
      );
    }
    return { status: res.status, body };
  }
}

async function searchSetlists(params: Params, label: string) {
  const { status, body } = await get("/search/setlists", params);
  save(label, { params, status, body });
  const b = body as { setlist?: Setlist[]; total?: number; itemsPerPage?: number };
  return {
    status,
    setlists: b.setlist ?? [],
    total: b.total ?? 0,
    itemsPerPage: b.itemsPerPage ?? 20,
  };
}

/** Every setlist at a venue on a date: the spec's lineup assembly (step 3). Follows pagination. */
async function lineupAt(venueId: string, date: string, label: string): Promise<Setlist[]> {
  const all: Setlist[] = [];
  for (let p = 1; p <= 10; p++) {
    const r = await searchSetlists({ venueId, date, p }, `${label}-lineup-p${p}`);
    all.push(...r.setlists);
    if (all.length >= r.total || r.setlists.length === 0) break;
  }
  return all;
}

// --- Output helpers ------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function save(label: string, data: unknown) {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${label}.json`), JSON.stringify(data, null, 2));
}

function songCount(s: Setlist): number {
  return (s.sets?.set ?? []).reduce(
    (n, set) => n + (set.song?.filter((x) => !x.tape).length ?? 0),
    0,
  );
}

function where(v: Venue): string {
  const c = v.city;
  if (!c) return `${v.name} (no city)`;
  return `${v.name} | ${c.name}, ${c.stateCode ?? "?"} (state="${c.state ?? ""}", country=${c.country?.code})`;
}

function printSetlists(list: Setlist[]) {
  if (list.length === 0) {
    console.log("  (no setlists)");
    return;
  }
  for (const s of list) {
    console.log(
      `  - ${s.eventDate} | ${s.artist.name} | songs=${songCount(s)} | venue#${s.venue.id} ${where(s.venue)}` +
        (s.tour?.name ? ` | tour="${s.tour.name}"` : "") +
        (s.info ? ` | info="${s.info.slice(0, 60)}"` : ""),
    );
  }
}

function printLineup(list: Setlist[]) {
  const ordered = [...list].sort((a, b) => songCount(b) - songCount(a));
  console.log(`  Lineup (${ordered.length} setlists), by song count desc:`);
  for (const s of ordered) {
    console.log(
      `    ${String(songCount(s)).padStart(3)} songs  ${s.artist.name}  (mbid ${s.artist.mbid || "none"})`,
    );
  }
  const venues = new Set(list.map((s) => s.venue.id));
  const tours = new Set(list.map((s) => s.tour?.name).filter(Boolean));
  console.log(`  distinct venue ids: ${[...venues].join(", ")}`);
  console.log(`  distinct tour names: ${[...tours].join(" | ") || "(none)"}`);
}

function heading(title: string) {
  console.log(`\n=== ${title} ${"=".repeat(Math.max(0, 70 - title.length))}`);
}

// --- Cases ---------------------------------------------------------------------------------

/** 1. Normal multi-artist show: find an artist's US show, then assemble the lineup at that venue/date. */
async function caseMulti() {
  heading("1. Multi-artist show (boygenius, 2023, US)");
  const r = await searchSetlists(
    { artistName: "boygenius", year: 2023, countryCode: "US" },
    "multi-search",
  );
  console.log(`  total=${r.total} itemsPerPage=${r.itemsPerPage}`);
  printSetlists(r.setlists.slice(0, 5));
  // The newest results are a private event and SNL tapings; pick real concerts (10+ songs).
  for (const pick of r.setlists.filter((s) => songCount(s) >= 10).slice(0, 2)) {
    console.log(`\n  Picked ${pick.artist.name} @ ${where(pick.venue)} on ${pick.eventDate}`);
    const lineup = await lineupAt(pick.venue.id, pick.eventDate, `multi-${pick.eventDate}`);
    printLineup(lineup);
    if (lineup.length > 1) break;
  }
}

/** 2. One day of a multi-day festival: try every way a festival might be stored. */
async function caseFestival() {
  heading("2. Festival day (Bonnaroo 2024; Lollapalooza 2023 for comparison)");

  console.log("\n  a) Venue search: name=Bonnaroo");
  const v = await get("/search/venues", { name: "Bonnaroo", countryCode: "US" });
  save("festival-venues-bonnaroo", v);
  const venues = ((v.body as { venue?: Venue[] }).venue ?? []) as Venue[];
  for (const x of venues.slice(0, 10)) console.log(`    venue#${x.id} ${where(x)}`);

  console.log("\n  b) Setlist search: venueName=Bonnaroo, year=2024");
  const byVenue = await searchSetlists(
    { venueName: "Bonnaroo", year: 2024, countryCode: "US" },
    "festival-by-venuename",
  );
  console.log(`    total=${byVenue.total}`);
  printSetlists(byVenue.setlists.slice(0, 8));

  console.log("\n  c) Setlist search: tourName=Bonnaroo, year=2024");
  const byTour = await searchSetlists(
    { tourName: "Bonnaroo", year: 2024, countryCode: "US" },
    "festival-by-tourname",
  );
  console.log(`    total=${byTour.total}`);
  printSetlists(byTour.setlists.slice(0, 8));

  console.log("\n  d) Setlist search: artistName=Bonnaroo (festival as an 'artist'?)");
  const byArtist = await searchSetlists(
    { artistName: "Bonnaroo", year: 2024 },
    "festival-by-artistname",
  );
  console.log(`    total=${byArtist.total}`);
  printSetlists(byArtist.setlists.slice(0, 3));

  // Take one festival setlist and pull that whole day by venue id + date.
  const seed = byVenue.setlists[0] ?? byTour.setlists[0];
  if (seed) {
    console.log(`\n  e) Full day: venue#${seed.venue.id} on ${seed.eventDate}`);
    const day = await lineupAt(seed.venue.id, seed.eventDate, `festival-day-${seed.eventDate}`);
    printLineup(day);

    // Are other stages stored as separate venues? Compare the same date by venueName.
    console.log(`\n  f) Same date by venueName (catches per-stage venues): ${seed.eventDate}`);
    const sameDate = await searchSetlists(
      { venueName: "Bonnaroo", date: seed.eventDate, countryCode: "US" },
      `festival-date-by-venuename-${seed.eventDate}`,
    );
    console.log(`    total=${sameDate.total} (vs ${day.length} via venueId)`);
    const ids = new Map<string, string>();
    for (const s of sameDate.setlists) ids.set(s.venue.id, s.venue.name);
    for (const [id, name] of ids) console.log(`    venue#${id} ${name}`);
  }

  // Which festival days exist, and at which venue ids? Walk every page of the year.
  if (byVenue.total > 0) {
    const perDay = new Map<string, number>();
    const pages = Math.ceil(byVenue.total / byVenue.itemsPerPage);
    for (let p = 1; p <= pages; p++) {
      const r = await searchSetlists(
        { venueName: "Bonnaroo", year: 2024, countryCode: "US", p },
        `festival-year-p${p}`,
      );
      for (const s of r.setlists) {
        const key = `${s.eventDate} venue#${s.venue.id} ${s.venue.name}`;
        perDay.set(key, (perDay.get(key) ?? 0) + 1);
      }
    }
    console.log(`\n  g) All Bonnaroo 2024 setlists by date and venue (${pages} pages):`);
    for (const [k, n] of [...perDay].sort()) console.log(`    ${k}: ${n} setlists`);
  }

  // Do the per-stage venues (What Stage, This Tent, ...) hold setlists, and from when?
  console.log("\n  g2) Stage venue 'What Stage' (53dfdf95): most recent setlists");
  const stage = await get("/venue/53dfdf95/setlists", { p: 1 });
  save("festival-stage-what-stage", stage);
  const stageBody = stage.body as { setlist?: Setlist[]; total?: number };
  console.log(`    total=${stageBody.total ?? 0}`);
  printSetlists((stageBody.setlist ?? []).slice(0, 3));

  console.log("\n  h) Comparison: Lollapalooza 2023 by venueName");
  const lolla = await searchSetlists(
    { venueName: "Lollapalooza", year: 2023, countryCode: "US" },
    "festival-lolla",
  );
  console.log(`    total=${lolla.total}`);
  printSetlists(lolla.setlists.slice(0, 6));
  const lollaTour = await searchSetlists(
    { tourName: "Lollapalooza", year: 2023, countryCode: "US" },
    "festival-lolla-tour",
  );
  console.log(`    tourName=Lollapalooza total=${lollaTour.total}`);
  printSetlists(lollaTour.setlists.slice(0, 4));

  console.log("\n  i) Lollapalooza by its real venue: Grant Park, Chicago, 05-08-2023 (Saturday)");
  const gp = await get("/search/venues", {
    name: "Grant Park",
    cityName: "Chicago",
    countryCode: "US",
  });
  save("festival-lolla-venues", gp);
  const gpVenues = ((gp.body as { venue?: Venue[] }).venue ?? []) as Venue[];
  for (const x of gpVenues.slice(0, 5)) console.log(`    venue#${x.id} ${where(x)}`);
  const lollaDay = await searchSetlists(
    { venueName: "Grant Park", cityName: "Chicago", date: "05-08-2023", countryCode: "US" },
    "festival-lolla-day-search",
  );
  console.log(`    total=${lollaDay.total}`);
  const lollaVenue = lollaDay.setlists[0]?.venue;
  if (lollaVenue) printLineup(await lineupAt(lollaVenue.id, "05-08-2023", "festival-lolla-day"));
}

/** 3. Small club show: find a Nashville club through venue search, then assemble a recent night. */
async function caseClub() {
  heading("3. Small club show (The Basement East, Nashville, TN)");
  const v = await get("/search/venues", {
    name: "Basement East",
    cityName: "Nashville",
    countryCode: "US",
  });
  save("club-venues", v);
  const venues = ((v.body as { venue?: Venue[] }).venue ?? []) as Venue[];
  for (const x of venues.slice(0, 5)) console.log(`    venue#${x.id} ${where(x)}`);
  const venue = venues[0];
  if (!venue) return;

  const { status, body } = await get(`/venue/${venue.id}/setlists`, { p: 1 });
  save("club-venue-setlists", { status, body });
  const recent = ((body as { setlist?: Setlist[] }).setlist ?? []) as Setlist[];
  console.log(`  Most recent setlists at venue#${venue.id} (venue endpoint):`);
  printSetlists(recent.slice(0, 6));

  // Assemble the night with the most setlists (a headliner plus opener, ideally).
  const perDate = new Map<string, number>();
  for (const s of recent) perDate.set(s.eventDate, (perDate.get(s.eventDate) ?? 0) + 1);
  const [date] = [...perDate].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (date) {
    console.log(`\n  Lineup for ${date}:`);
    printLineup(await lineupAt(venue.id, date, `club-${date}`));
  }
}

/** 4. A search that should return nothing: what does "no results" look like? */
async function caseNone() {
  heading("4. No results");
  const a = await searchSetlists(
    { artistName: "Zzyzx Quuxington and the Nonexistents", countryCode: "US", year: 2019 },
    "none-artist",
  );
  console.log(`  status=${a.status} total=${a.total} setlists=${a.setlists.length}`);
  const b = await searchSetlists(
    { artistName: "boygenius", year: 1975, countryCode: "US" },
    "none-real-artist-wrong-year",
  );
  console.log(`  real artist, wrong year: status=${b.status} total=${b.total}`);
  const c = await get("/search/venues", { name: "Qwxzv Hall", countryCode: "US" });
  save("none-venue", c);
  console.log(`  venue search: status=${c.status}`);
}

// --- Main ----------------------------------------------------------------------------------

const cases: Record<string, () => Promise<void>> = {
  multi: caseMulti,
  festival: caseFestival,
  club: caseClub,
  none: caseNone,
};

const only = process.argv[2];
if (only && !cases[only]) {
  console.error(`Unknown case "${only}". Use one of: ${Object.keys(cases).join(", ")}`);
  process.exit(1);
}

for (const [name, run] of Object.entries(cases)) {
  if (only && name !== only) continue;
  try {
    await run();
  } catch (err) {
    console.error(`  case "${name}" failed:`, err instanceof Error ? err.message : err);
  }
}
console.log(
  `\nDone. ${requestCount} requests (${rateLimitedCount} rate limited). Raw JSON in scripts/.spike-output/`,
);
