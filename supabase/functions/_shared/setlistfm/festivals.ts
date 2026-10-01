import type { UsVenue } from "./contract.ts";

// Major US festivals and where setlist.fm files them. setlist.fm has no festival entity:
// festival setlists sit under the grounds' venue, and some festivals file each stage as its
// own venue (Riot Fest, Coachella since 2025). A venue-name search catches all of them.
// Venue IDs were looked up with `pnpm find:festival-venue`; see docs/setlistfm-notes.md.
//
// To add a festival: run the lookup for a recent year, check which venues and dates its
// setlists use, and add an entry. Festivals not listed here still work through a plain
// venue-name search (see search.ts).

export type FestivalSite = {
  /** Years this site was used (inclusive). Omit for open-ended. */
  fromYear?: number;
  toYear?: number;
  /** venueName/cityName/stateCode for search/setlists. Matches every stage at the grounds. */
  search: { venueName: string; cityName: string | null; stateCode: string };
  /** The venue every log of a festival day is saved against, so attendees share one show. */
  grounds: UsVenue;
};

export type Festival = {
  name: string;
  /** Lowercase search terms, besides the name. */
  aliases: string[];
  /** Newest site first. */
  sites: FestivalSite[];
  /** Months the festival can fall in; used to stop paging once we're past them. */
  months: number[];
  /** Whether an ISO date is a festival day, as opposed to another event at the grounds. */
  isFestivalDate: (iso: string) => boolean;
};

function venue(setlistfmId: string | null, name: string, city: string, state: string): UsVenue {
  return { setlistfmId, name, city, state, url: null };
}

const month = (iso: string) => Number(iso.slice(5, 7));
const year = (iso: string) => Number(iso.slice(0, 4));
const inMonths =
  (...months: number[]) =>
  (iso: string) =>
    months.includes(month(iso));

/** Stagecoach runs Friday-Sunday starting on the last Friday of April (into May some years). */
export function stagecoachFriday(y: number): string {
  const d = new Date(Date.UTC(y, 3, 30));
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const EMPIRE_POLO: FestivalSite = {
  search: { venueName: "Empire Polo", cityName: "Indio", stateCode: "CA" },
  grounds: venue("13d39d15", "Empire Polo Club", "Indio", "CA"),
};
const FORT_ADAMS: FestivalSite = {
  search: { venueName: "Fort Adams", cityName: "Newport", stateCode: "RI" },
  grounds: venue("2bd6d89e", "Fort Adams State Park", "Newport", "RI"),
};

export const FESTIVALS: Festival[] = [
  {
    name: "Bonnaroo",
    aliases: ["bonnaroo music and arts festival"],
    sites: [
      {
        search: { venueName: "Great Stage Park", cityName: "Manchester", stateCode: "TN" },
        grounds: venue("2bd6181e", "Great Stage Park", "Manchester", "TN"),
      },
    ],
    months: [6],
    isFestivalDate: inMonths(6),
  },
  {
    name: "Lollapalooza",
    aliases: ["lolla"],
    sites: [
      {
        search: { venueName: "Grant Park", cityName: "Chicago", stateCode: "IL" },
        grounds: venue("53d6cfdd", "Grant Park", "Chicago", "IL"),
      },
    ],
    months: [7, 8],
    isFestivalDate: inMonths(7, 8),
  },
  {
    name: "Coachella",
    aliases: ["coachella valley music and arts festival"],
    sites: [EMPIRE_POLO],
    months: [4],
    // April, before Stagecoach weekend at the same grounds.
    isFestivalDate: (iso) => month(iso) === 4 && iso < stagecoachFriday(year(iso)),
  },
  {
    name: "Stagecoach",
    aliases: ["stagecoach festival", "stagecoach country music festival"],
    sites: [EMPIRE_POLO],
    months: [4, 5],
    isFestivalDate: (iso) => {
      const fri = stagecoachFriday(year(iso));
      return iso >= fri && iso <= addDays(fri, 2);
    },
  },
  {
    name: "Austin City Limits",
    aliases: ["acl", "acl fest", "austin city limits music festival"],
    sites: [
      {
        search: { venueName: "Zilker Park", cityName: "Austin", stateCode: "TX" },
        grounds: venue("33d638ad", "Zilker Park", "Austin", "TX"),
      },
    ],
    months: [10],
    isFestivalDate: inMonths(10),
  },
  {
    name: "Governors Ball",
    aliases: ["gov ball", "governors ball music festival", "the governors ball"],
    sites: [
      {
        fromYear: 2024,
        search: { venueName: "Flushing Meadows Corona Park", cityName: "Queens", stateCode: "NY" },
        grounds: venue("43d2830b", "Flushing Meadows Corona Park", "Queens", "NY"),
      },
      {
        fromYear: 2022,
        toYear: 2023,
        search: { venueName: "Citi Field", cityName: "Queens", stateCode: "NY" },
        grounds: venue("63d1eed3", "Citi Field", "Queens", "NY"),
      },
      {
        toYear: 2021,
        search: { venueName: "Randall's Island Park", cityName: "New York", stateCode: "NY" },
        grounds: venue("33de6099", "Randall's Island Park", "New York", "NY"),
      },
    ],
    months: [5, 6, 9],
    // Early June; late May/early June before 2020; late September in 2021. The other
    // festivals on Randall's Island (Electric Zoo, Panorama) fall outside these dates.
    isFestivalDate: (iso) =>
      month(iso) === 6 ||
      (month(iso) === 5 && Number(iso.slice(8)) >= 25) ||
      (year(iso) === 2021 && month(iso) === 9 && Number(iso.slice(8)) >= 20),
  },
  {
    name: "Newport Folk Festival",
    aliases: ["newport folk"],
    sites: [FORT_ADAMS],
    months: [7],
    isFestivalDate: inMonths(7),
  },
  {
    name: "Newport Jazz Festival",
    aliases: ["newport jazz"],
    sites: [FORT_ADAMS],
    months: [8],
    isFestivalDate: inMonths(8),
  },
  {
    name: "Riot Fest",
    aliases: ["riotfest"],
    sites: [
      {
        fromYear: 2015,
        // Stages are filed as separate venues that change yearly ("Rise Stage", "NOFX World"...).
        search: { venueName: "Douglass Park", cityName: "Chicago", stateCode: "IL" },
        grounds: venue(null, "Douglass Park", "Chicago", "IL"),
      },
    ],
    months: [9],
    isFestivalDate: inMonths(9),
  },
  {
    name: "BottleRock Napa Valley",
    aliases: ["bottlerock", "bottle rock"],
    sites: [
      {
        search: { venueName: "Napa Valley Expo", cityName: "Napa", stateCode: "CA" },
        grounds: venue("3d399cf", "Napa Valley Expo", "Napa", "CA"),
      },
    ],
    months: [5, 9],
    // Memorial Day weekend; moved to September in 2021.
    isFestivalDate: (iso) => month(iso) === 5 || (year(iso) === 2021 && month(iso) === 9),
  },
  {
    name: "Pitchfork Music Festival",
    aliases: ["pitchfork", "pitchfork fest"],
    sites: [
      {
        search: { venueName: "Union Park", cityName: "Chicago", stateCode: "IL" },
        grounds: venue("7bd6c6d8", "Union Park", "Chicago", "IL"),
      },
    ],
    months: [7],
    isFestivalDate: inMonths(7),
  },
  {
    name: "Electric Forest",
    aliases: ["electric forest festival"],
    sites: [
      {
        search: { venueName: "Double JJ", cityName: "Rothbury", stateCode: "MI" },
        grounds: venue("73d67e5d", "Double JJ Ranch", "Rothbury", "MI"),
      },
    ],
    months: [6],
    isFestivalDate: inMonths(6),
  },
];

// A query made only of these (plus years) names no festival in particular.
const GENERIC_WORDS = new Set(["festival", "fest", "music", "and", "arts", "the", "of"]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The listed festival a search term refers to, if any ("gov ball 2024" -> Governors Ball). */
export function findFestival(query: string): Festival | null {
  const q = normalize(query);
  if (!q || q.split(" ").every((word) => GENERIC_WORDS.has(word) || /^\d+$/.test(word)))
    return null;
  for (const festival of FESTIVALS) {
    for (const term of [festival.name, ...festival.aliases].map(normalize)) {
      // Whole-word match in either direction: "bonnaroo 2024", "newport folk", "lolla".
      if (` ${q} `.includes(` ${term} `) || (q.length >= 4 && ` ${term} `.includes(` ${q} `))) {
        return festival;
      }
    }
  }
  return null;
}

/** Where the festival was held in a given year (or most recently). */
export function siteForYear(festival: Festival, y?: number): FestivalSite | null {
  if (y === undefined) return festival.sites[0] ?? null;
  return (
    festival.sites.find((s) => (s.fromYear ?? -Infinity) <= y && y <= (s.toYear ?? Infinity)) ??
    null
  );
}
