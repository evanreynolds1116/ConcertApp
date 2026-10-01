import { showDateParts } from "@musicjunkie/shared";

/** The SEP / 20 / 2026 tile on result and log cards. Decorative: cards say the date in text. */
export function DateTile({ iso }: { iso: string }) {
  const { month, day, year } = showDateParts(iso);
  return (
    <span
      className="flex h-15 w-13 shrink-0 flex-col items-center justify-center rounded-lg bg-surface"
      aria-hidden
    >
      <span className="text-[11px] font-bold tracking-widest text-accent">{month}</span>
      <span className="text-xl leading-tight font-extrabold">{day}</span>
      <span className="text-[11px] text-muted">{year}</span>
    </span>
  );
}
