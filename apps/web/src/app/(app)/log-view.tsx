"use client";

import {
  formatCityState,
  hasLogFilters,
  logFiltersToQuery,
  MONTH_NAMES,
  type LogFilters,
} from "@musicjunkie/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { LogCard } from "@/components/concert/log-card";
import type { LogPage } from "@/lib/concerts";
import { loadMoreLogs } from "./log-actions";

type LogViewProps = {
  query: string;
  filters: LogFilters;
  initialPage: LogPage;
  totalLogged: number;
  years: number[];
  states: string[];
  venueName: string | null;
};

const SEARCH_DEBOUNCE_MS = 300;

export function LogView({
  query,
  filters,
  initialPage,
  totalLogged,
  years,
  states,
  venueName,
}: LogViewProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [artistText, setArtistText] = useState(filters.artist ?? "");

  const apply = useCallback(
    (next: LogFilters) => {
      const q = logFiltersToQuery(next);
      startTransition(() => router.replace(q ? `/?${q}` : "/", { scroll: false }));
    },
    [router],
  );

  // Artist search updates the URL as you type, debounced.
  useEffect(() => {
    const trimmed = artistText.trim();
    if (trimmed === (filters.artist ?? "")) return;
    const timer = setTimeout(
      () => apply({ ...filters, artist: trimmed || undefined }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [artistText, filters, apply]);

  const filtered = hasLogFilters(filters);
  const chips = activeChips(filters, venueName);
  const withCurrent = <T,>(list: T[], current: T | undefined) =>
    current !== undefined && !list.includes(current) ? [current, ...list] : list;

  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="text-3xl font-extrabold tracking-tight">Your concerts</h1>
      <p className="mt-1 text-sm text-muted" aria-live="polite">
        {filtered
          ? `${initialPage.total} of ${totalLogged} ${totalLogged === 1 ? "show" : "shows"}`
          : `${totalLogged} ${totalLogged === 1 ? "show" : "shows"} logged`}
      </p>

      {totalLogged > 0 && (
        <>
          <div className="mt-4 flex h-12 items-center gap-2.5 rounded-lg bg-surface px-3.5 text-muted">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              aria-hidden
              className="shrink-0 fill-none stroke-current stroke-2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
            </svg>
            <label htmlFor="log-search" className="sr-only">
              Search by artist
            </label>
            <input
              id="log-search"
              type="search"
              autoComplete="off"
              placeholder="Search by artist"
              value={artistText}
              onChange={(e) => setArtistText(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-subtle"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <PillSelect
              label="Year"
              value={filters.year ? String(filters.year) : ""}
              options={withCurrent(years, filters.year).map((y) => [String(y), String(y)])}
              onChange={(v) => apply({ ...filters, year: v ? Number(v) : undefined })}
            />
            <PillSelect
              label="Month"
              value={filters.month ? String(filters.month) : ""}
              options={MONTH_NAMES.map((m, i) => [String(i + 1), m])}
              onChange={(v) => apply({ ...filters, month: v ? Number(v) : undefined })}
            />
            <PillSelect
              label="State"
              value={filters.state ?? ""}
              options={withCurrent(states, filters.state).map((s) => [s, s])}
              // Changing the state drops a city filter, which belongs to the old state.
              onChange={(v) => apply({ ...filters, state: v || undefined, city: undefined })}
            />
          </div>

          {chips.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Active filters">
              {chips.map((chip) => (
                <li key={chip.key}>
                  <button
                    type="button"
                    onClick={() => {
                      if (chip.key === "artist") setArtistText("");
                      apply(chip.remove(filters));
                    }}
                    aria-label={`Remove filter: ${chip.label}`}
                    className="flex h-8 items-center gap-1 rounded-full bg-hero pr-2 pl-3 text-sm font-semibold text-accent hover:bg-surface-raised"
                  >
                    {chip.label}
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      aria-hidden
                      className="fill-none stroke-current stroke-2"
                    >
                      <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                    </svg>
                  </button>
                </li>
              ))}
              {chips.length > 1 && (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setArtistText("");
                      apply({});
                    }}
                    className="flex h-8 items-center px-2 text-sm font-semibold text-muted hover:text-foreground"
                  >
                    Clear all
                  </button>
                </li>
              )}
            </ul>
          )}
        </>
      )}

      <div aria-busy={pending} className={`mt-4 transition-opacity ${pending ? "opacity-50" : ""}`}>
        <LogList
          // A new filter set starts a fresh list (dropping pages loaded for the old one).
          key={query}
          query={query}
          initialPage={initialPage}
          emptyLog={totalLogged === 0}
          onClearFilters={() => {
            setArtistText("");
            apply({});
          }}
        />
      </div>
    </div>
  );
}

type Chip = { key: string; label: string; remove: (f: LogFilters) => LogFilters };

function activeChips(filters: LogFilters, venueName: string | null): Chip[] {
  const chips: Chip[] = [];
  if (filters.artist)
    chips.push({
      key: "artist",
      label: `“${filters.artist}”`,
      remove: (f) => ({ ...f, artist: undefined }),
    });
  if (filters.year)
    chips.push({
      key: "year",
      label: String(filters.year),
      remove: (f) => ({ ...f, year: undefined }),
    });
  if (filters.month) {
    chips.push({
      key: "month",
      label: MONTH_NAMES[filters.month - 1]!,
      remove: (f) => ({ ...f, month: undefined }),
    });
  }
  if (filters.city && filters.state) {
    // A city is a "City, ST" pair: one chip, and removing it removes both.
    chips.push({
      key: "city",
      label: formatCityState(filters.city, filters.state),
      remove: (f) => ({ ...f, city: undefined, state: undefined }),
    });
  } else if (filters.state) {
    chips.push({ key: "state", label: filters.state, remove: (f) => ({ ...f, state: undefined }) });
  }
  if (filters.venueId) {
    chips.push({
      key: "venue",
      label: venueName ?? "Venue",
      remove: (f) => ({ ...f, venueId: undefined }),
    });
  }
  return chips;
}

type PillSelectProps = {
  label: string;
  value: string;
  options: (readonly [string, string])[];
  onChange: (value: string) => void;
};

function PillSelect({ label, value, options, onChange }: PillSelectProps) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-11 rounded-full border bg-background pr-8 pl-4 text-sm font-semibold ${
        value ? "border-accent text-accent" : "border-surface-raised"
      }`}
    >
      <option value="">{value ? `Any ${label.toLowerCase()}` : label}</option>
      {options.map(([v, text]) => (
        <option key={v} value={v}>
          {text}
        </option>
      ))}
    </select>
  );
}

type LogListProps = {
  query: string;
  initialPage: LogPage;
  emptyLog: boolean;
  onClearFilters: () => void;
};

function LogList({ query, initialPage, emptyLog, onClearFilters }: LogListProps) {
  const [entries, setEntries] = useState(initialPage.entries);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = initialPage.total;

  async function loadMore() {
    setLoading(true);
    setError(null);
    try {
      const next = await loadMoreLogs(query, entries.length);
      setEntries((current) => [...current, ...next.entries]);
    } catch {
      setError("Couldn't load more concerts. Try again.");
    } finally {
      setLoading(false);
    }
  }

  if (emptyLog) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <p className="font-semibold">No concerts yet</p>
        <p className="mt-1 text-muted">Log the first show you went to.</p>
        <Link
          href="/add"
          className="mt-4 inline-flex h-11 items-center rounded-full bg-accent px-5 font-bold text-on-accent hover:bg-accent-hover"
        >
          Add concert
        </Link>
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <p className="font-semibold">No concerts match these filters</p>
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-2 font-semibold text-accent hover:text-accent-hover"
        >
          Clear filters
        </button>
      </div>
    );
  }

  return (
    <>
      <ul>
        {entries.map((entry) => (
          <li key={entry.log_id}>
            <LogCard entry={entry} />
          </li>
        ))}
      </ul>
      {entries.length < total && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="mt-3 h-11 w-full rounded-full border border-surface-raised font-bold disabled:opacity-60"
        >
          {loading ? "Loading…" : `Load more (${total - entries.length} left)`}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}
