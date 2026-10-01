import { z } from "zod";

// Concert logging: the save payload, plus formatting for ratings, prices and dates.
// Storage rules (CLAUDE.md): ratings are rating_tenths 0-100, prices are ticket_price_cents
// in USD; null means "not set", and 0.0 / $0 are real values.

export const US_STATES = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["DC", "District of Columbia"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
] as const;
export type UsStateCode = (typeof US_STATES)[number][0];
const STATE_CODES = US_STATES.map(([code]) => code) as [UsStateCode, ...UsStateCode[]];

export const EARLIEST_YEAR = 1960;
export const MAX_PRICE_CENTS = 10_000_000; // $100,000: anything above is a typo

// ---------------------------------------------------------------------------------------------
// Ratings: 0.0-10.0 in 0.1 steps, stored as tenths
// ---------------------------------------------------------------------------------------------

/** 87 -> "8.7", 0 -> "0.0". */
export function formatRating(tenths: number): string {
  return (tenths / 10).toFixed(1);
}

/** "8.7" -> 87. Blank -> null (no rating). Anything else invalid -> undefined. */
export function parseRating(text: string): number | null | undefined {
  const t = text.trim();
  if (t === "") return null;
  if (!/^\d{1,2}(\.\d)?$/.test(t)) return undefined;
  const tenths = Math.round(Number(t) * 10);
  return tenths >= 0 && tenths <= 100 ? tenths : undefined;
}

// ---------------------------------------------------------------------------------------------
// Prices: USD, stored as cents
// ---------------------------------------------------------------------------------------------

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** 8500 -> "$85.00". */
export function formatPrice(cents: number): string {
  return usd.format(cents / 100);
}

/** 124000 -> "$1,240" (for totals, where cents are noise). */
export function formatPriceWhole(cents: number): string {
  return usdWhole.format(Math.round(cents / 100));
}

/** "85", "$85.5", "1,240.99" -> cents. Blank -> null (not set). Anything else -> undefined. */
export function parsePriceToCents(text: string): number | null | undefined {
  const t = text.trim().replace(/^\$/, "").replace(/,/g, "");
  if (t === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return undefined;
  const [whole, frac = ""] = t.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return cents <= MAX_PRICE_CENTS ? cents : undefined;
}

// ---------------------------------------------------------------------------------------------
// Dates: shows are calendar dates (ISO yyyy-mm-dd) with no time zone
// ---------------------------------------------------------------------------------------------

function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** "2026-09-20" -> "Sat, Sep 20, 2026". */
export function formatShowDate(iso: string): string {
  return utc(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "2026-09-20" -> { month: "SEP", day: "20", year: "2026" }, for date tiles. */
export function showDateParts(iso: string): { month: string; day: string; year: string } {
  const d = utc(iso);
  return {
    month: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase(),
    day: String(d.getUTCDate()),
    year: String(d.getUTCFullYear()),
  };
}

/** Today's date in the US (Hawaii, the latest US time zone), as ISO. */
export function usToday(now: Date = new Date()): string {
  return new Date(now.getTime() - 10 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
// The save payload (validated in the web server action, again by log_concert in the database)
// ---------------------------------------------------------------------------------------------

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Enter a date." })
  .refine((iso) => !Number.isNaN(utc(iso).getTime()) && utc(iso).toISOString().startsWith(iso), {
    error: "Enter a real date.",
  })
  .refine((iso) => iso >= `${EARLIEST_YEAR}-01-01`, {
    error: `Shows from ${EARLIEST_YEAR} on only.`,
  })
  .refine((iso) => iso <= usToday(), { error: "Upcoming shows can't be logged yet." });

export const draftArtistSchema = z.object({
  name: z.string().trim().min(1, { error: "Enter the artist's name." }).max(200),
  mbid: z.string().max(64).nullable(),
  setlistfmUrl: z.string().max(500).nullable(),
});
export type DraftArtist = z.infer<typeof draftArtistSchema>;

export const draftVenueSchema = z.object({
  name: z.string().trim().min(1, { error: "Enter the venue." }).max(200),
  city: z.string().trim().min(1, { error: "Enter the city." }).max(100),
  state: z.enum(STATE_CODES, { error: "Pick a state." }),
  setlistfmId: z.string().max(40).nullable(),
});
export type DraftVenue = z.infer<typeof draftVenueSchema>;

export const concertDraftSchema = z.object({
  source: z.enum(["setlistfm", "manual"]),
  date: isoDateSchema,
  venue: draftVenueSchema,
  festivalName: z.string().trim().max(200).nullable(),
  setlistfmUrl: z.string().max(500).nullable(),
  artists: z.array(draftArtistSchema).min(1, { error: "Add at least one artist." }).max(200),
  ratingTenths: z.number().int().min(0).max(100).nullable(),
  ticketPriceCents: z.number().int().min(0).max(MAX_PRICE_CENTS).nullable(),
  notes: z.string().max(5000, { error: "Keep notes to 5,000 characters." }),
});
export type ConcertDraft = z.infer<typeof concertDraftSchema>;

/** The manual-entry form (venue, city, state, date, optional festival name). */
export const manualShowSchema = z.object({
  venueName: draftVenueSchema.shape.name,
  city: draftVenueSchema.shape.city,
  state: draftVenueSchema.shape.state,
  date: isoDateSchema,
  festivalName: z.string().trim().max(200),
});
export type ManualShowInput = z.infer<typeof manualShowSchema>;

/** "Phoebe Bridgers + 2 more". */
export function lineupSummary(artistNames: string[]): string {
  const [first, ...rest] = artistNames;
  if (!first) return "";
  return rest.length ? `${first} + ${rest.length} more` : first;
}
