import type { ConcertDraft } from "@musicjunkie/shared";
import type { LineupRow } from "@/components/concert/lineup-editor";

/** What the add-concert flow builds up before the details step. */
export type ShowDraft = Omit<
  ConcertDraft,
  "artists" | "ratingTenths" | "ticketPriceCents" | "notes"
> & {
  artists: LineupRow[];
};
