import type { ConcertDraft, DraftArtist } from "@musicjunkie/shared";

/** A lineup row in the editor. `key` keeps rows stable while they're dragged around. */
export type LineupRow = DraftArtist & { key: string };

/** What the add-concert flow builds up before saving: everything but the details step. */
export type ShowDraft = Omit<
  ConcertDraft,
  "artists" | "ratingTenths" | "ticketPriceCents" | "notes"
> & {
  artists: LineupRow[];
  /** "Day 2" for festival days, shown alongside the festival name. */
  dayLabel: string | null;
};

let nextKey = 0;
export function lineupRow(artist: DraftArtist): LineupRow {
  return { ...artist, key: `row-${nextKey++}` };
}
