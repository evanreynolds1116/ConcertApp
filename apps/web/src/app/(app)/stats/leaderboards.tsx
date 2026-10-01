"use client";

import {
  formatCityState,
  logFiltersToQuery,
  US_STATES,
  type LogFilters,
} from "@musicjunkie/shared";
import Link from "next/link";
import { useRef, useState } from "react";
import type { LeaderboardKind, LeaderboardRow } from "@/lib/concerts";

const TABS: { kind: LeaderboardKind; label: string }[] = [
  { kind: "artist", label: "Artists" },
  { kind: "venue", label: "Venues" },
  { kind: "city", label: "Cities" },
  { kind: "state", label: "States" },
];

const STATE_NAMES = new Map<string, string>(US_STATES);
const TOP = 10; // rows shown before "Show all"
const NOUNS: Record<LeaderboardKind, string> = {
  artist: "artists",
  venue: "venues",
  city: "cities",
  state: "states",
};

/** Where a row links: the log, filtered to that artist, venue, city or state. */
function rowFilters(kind: LeaderboardKind, row: LeaderboardRow): LogFilters {
  switch (kind) {
    case "artist":
      return { artistId: row.item_id ?? undefined };
    case "venue":
      return { venueId: row.item_id ?? undefined };
    case "city":
      return { city: row.name, state: row.state ?? undefined };
    case "state":
      return { state: row.state ?? undefined };
  }
}

function rowTitle(kind: LeaderboardKind, row: LeaderboardRow): { name: string; detail?: string } {
  switch (kind) {
    case "venue":
      return {
        name: row.name,
        detail: row.city && row.state ? formatCityState(row.city, row.state) : undefined,
      };
    case "city":
      return { name: formatCityState(row.name, row.state ?? "") };
    case "state":
      return { name: row.name, detail: STATE_NAMES.get(row.name) };
    default:
      return { name: row.name };
  }
}

export function Leaderboards({
  boards,
  logPath,
}: {
  boards: Record<LeaderboardKind, LeaderboardRow[]>;
  logPath: string;
}) {
  const [selected, setSelected] = useState<LeaderboardKind>("artist");
  const [expanded, setExpanded] = useState<LeaderboardKind | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const next =
      e.key === "ArrowRight"
        ? (index + 1) % TABS.length
        : e.key === "ArrowLeft"
          ? (index - 1 + TABS.length) % TABS.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? TABS.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    setSelected(TABS[next]!.kind);
    tabRefs.current[next]?.focus();
  }

  const rows = boards[selected];
  const max = Math.max(1, ...rows.map((r) => r.concerts));
  const showAll = expanded === selected || rows.length <= TOP;
  const shown = showAll ? rows : rows.slice(0, TOP);
  return (
    <section aria-labelledby="lb-h" className="flex flex-col gap-3">
      <h2 id="lb-h" className="text-xl font-extrabold">
        Leaderboards
      </h2>
      <div role="tablist" aria-labelledby="lb-h" className="grid grid-cols-4 gap-1.5">
        {TABS.map((tab, i) => (
          <button
            key={tab.kind}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`lb-tab-${tab.kind}`}
            aria-selected={selected === tab.kind}
            aria-controls="lb-panel"
            tabIndex={selected === tab.kind ? 0 : -1}
            onClick={() => setSelected(tab.kind)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className="h-10 rounded-full bg-surface-raised text-sm font-semibold aria-selected:bg-foreground aria-selected:font-bold aria-selected:text-background"
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="lb-panel" aria-labelledby={`lb-tab-${selected}`}>
        <ol>
          {shown.map((row) => {
            // Ties share a rank: 1, 1, 3.
            const rank = 1 + rows.filter((r) => r.concerts > row.concerts).length;
            const { name, detail } = rowTitle(selected, row);
            const query = logFiltersToQuery(rowFilters(selected, row));
            return (
              <li key={`${row.item_id ?? row.name}|${row.state ?? ""}`}>
                <Link
                  href={`${logPath}?${query}`}
                  className="-mx-2 flex min-h-15 items-center gap-3.5 rounded-xl px-2 hover:bg-surface"
                >
                  <span className="w-6 text-right font-extrabold text-muted">{rank}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="truncate font-bold">{name}</span>
                      {detail && <span className="truncate text-sm text-muted">{detail}</span>}
                    </span>
                    <span aria-hidden className="h-1 rounded-sm bg-surface-raised">
                      <span
                        className="block h-1 rounded-sm bg-accent"
                        style={{ width: `${Math.round((row.concerts / max) * 100)}%` }}
                      />
                    </span>
                  </span>
                  <span className="min-w-7 text-right font-extrabold">
                    {row.concerts}
                    <span className="sr-only"> {row.concerts === 1 ? "concert" : "concerts"}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
        {rows.length > TOP && (
          <button
            type="button"
            onClick={() => setExpanded(showAll ? null : selected)}
            aria-expanded={showAll}
            className="mt-2 h-11 w-full rounded-full border border-surface-raised text-sm font-bold hover:border-foreground"
          >
            {showAll ? `Show top ${TOP}` : `Show all ${rows.length} ${NOUNS[selected]}`}
          </button>
        )}
      </div>
    </section>
  );
}
