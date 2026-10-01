/**
 * Finds the setlist.fm venue IDs a festival is filed under, for the festival list in
 * supabase/functions/_shared/festivals.ts. setlist.fm has no festival entity: festival
 * setlists sit under the venue of the grounds (see docs/setlistfm-notes.md).
 *
 *   pnpm find:festival-venue "Zilker Park" Austin 2023
 *
 * Prints every venue ID with setlists in that place and year, with the busiest dates, so
 * festival days (dozens of setlists) stand out from one-off concerts. Needs
 * SETLISTFM_API_KEY in the root .env. The key is never printed.
 */
import { join } from "node:path";

const API = "https://api.setlist.fm/rest/1.0";

try {
  process.loadEnvFile(join(import.meta.dirname, "..", ".env"));
} catch {
  // No .env; checked below.
}
const apiKey = process.env.SETLISTFM_API_KEY?.trim();
if (!apiKey) {
  console.error("SETLISTFM_API_KEY is not set. Add it to .env at the repo root.");
  process.exit(1);
}

const [venueName, cityName, year, maxPagesArg] = process.argv.slice(2);
if (!venueName || !year) {
  console.error(
    'Usage: pnpm find:festival-venue "<venue name>" [city] <year> [max pages, default 3]',
  );
  process.exit(1);
}
const maxPages = Number(maxPagesArg ?? 3);

interface Setlist {
  eventDate: string;
  artist: { name: string };
  venue: { id: string; name: string; city?: { name: string; stateCode?: string } };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function page(p: number): Promise<{ setlists: Setlist[]; total: number }> {
  const url = new URL(`${API}/search/setlists`);
  url.searchParams.set("venueName", venueName!);
  if (cityName) url.searchParams.set("cityName", cityName);
  url.searchParams.set("year", year!);
  url.searchParams.set("countryCode", "US");
  url.searchParams.set("p", String(p));
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json", "x-api-key": apiKey! } });
    if (res.status === 429) {
      await sleep(2000 * attempt);
      continue;
    }
    if (res.status === 404) return { setlists: [], total: 0 };
    if (!res.ok) throw new Error(`setlist.fm ${res.status} for ${url.pathname}${url.search}`);
    const body = (await res.json()) as { setlist?: Setlist[]; total?: number };
    return { setlists: body.setlist ?? [], total: body.total ?? 0 };
  }
  throw new Error("Rate limited too many times");
}

const byVenue = new Map<string, { label: string; dates: Map<string, number> }>();
let total = 0;
for (let p = 1; p <= maxPages; p++) {
  if (p > 1) await sleep(1000);
  const r = await page(p);
  total = r.total;
  for (const s of r.setlists) {
    const v = byVenue.get(s.venue.id) ?? {
      label: `${s.venue.name} (${s.venue.city?.name ?? "?"}, ${s.venue.city?.stateCode ?? "?"})`,
      dates: new Map<string, number>(),
    };
    v.dates.set(s.eventDate, (v.dates.get(s.eventDate) ?? 0) + 1);
    byVenue.set(s.venue.id, v);
  }
  if (p * 20 >= r.total) break;
}

console.log(`"${venueName}"${cityName ? ` in ${cityName}` : ""}, ${year}: ${total} setlists`);
if (byVenue.size === 0) console.log("  nothing found");
for (const [id, v] of byVenue) {
  const busiest = [...v.dates].sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(`  ${id}  ${v.label}`);
  console.log(`    busiest dates: ${busiest.map(([d, n]) => `${d} (${n})`).join(", ")}`);
}
