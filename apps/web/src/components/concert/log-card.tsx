import {
  festivalLabel,
  formatCityState,
  formatRating,
  formatShowDate,
  supportingActsLine,
} from "@musicjunkie/shared";
import Link from "next/link";
import type { LogEntry } from "@/lib/concerts";
import { DateTile } from "./date-tile";

/** A concert in the log: headliner, up to two supporting acts, where, when, and the rating. */
export function LogCard({ entry }: { entry: LogEntry }) {
  const [headliner, ...rest] = entry.artists;
  const supporting = supportingActsLine(entry.artists);
  const place = formatCityState(entry.city, entry.state);
  return (
    <Link
      href={`/concerts/${entry.log_id}`}
      className="-mx-2 flex items-center gap-3.5 rounded-xl px-2 py-2.5 hover:bg-surface"
    >
      <DateTile iso={entry.show_date} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="sr-only">{formatShowDate(entry.show_date)}:</span>
        <span className="truncate font-bold">{headliner}</span>
        {rest.length > 0 && (
          <span className="truncate text-sm text-foreground/85">{supporting}</span>
        )}
        {entry.festival_name ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 rounded-full border border-accent px-1.75 text-[11px] font-bold text-accent">
              {festivalLabel(entry.festival_name, entry.festival_day_label)}
            </span>
            <span className="truncate text-sm text-muted">{place}</span>
          </span>
        ) : (
          <span className="truncate text-sm text-muted">
            {entry.venue_name} · {place}
          </span>
        )}
      </span>
      {entry.rating_tenths !== null ? (
        <span
          className="flex h-7 min-w-11 items-center justify-center rounded-full bg-hero px-2 text-sm font-bold text-accent"
          aria-label={`Rated ${formatRating(entry.rating_tenths)}`}
        >
          {formatRating(entry.rating_tenths)}
        </span>
      ) : (
        <span className="min-w-11" aria-hidden />
      )}
    </Link>
  );
}
