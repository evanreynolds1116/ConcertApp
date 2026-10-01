"use client";

import {
  EARLIEST_YEAR,
  festivalLabel,
  formatCityState,
  formatShowDate,
  US_STATES,
  usToday,
  type SearchResult,
} from "@musicjunkie/shared";
import { useEffect, useRef, useState } from "react";
import { fetchLineup, searchSetlists } from "@/lib/setlist-search";
import { DateTile } from "@/components/concert/date-tile";
import { lineupRow } from "@/components/concert/lineup-editor";
import type { ShowDraft } from "./draft";
import { StepHeader } from "./step-header";

export type SearchState = {
  mode: "concert" | "festival";
  query: string;
  year: string; // "" = any
  month: string;
  state: string;
};
export const initialSearch: SearchState = {
  mode: "concert",
  query: "",
  year: "",
  month: "",
  state: "",
};

type Results =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "done";
      results: SearchResult[];
      nextPage: number | null;
      incomplete: boolean;
      needsState?: boolean;
      loadingMore?: boolean;
    };

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const THIS_YEAR = Number(usToday().slice(0, 4));
const YEARS = Array.from({ length: THIS_YEAR - EARLIEST_YEAR + 1 }, (_, i) =>
  String(THIS_YEAR - i),
);
const DEBOUNCE_MS = 450; // setlist.fm allows ~1-2 requests a second; don't search per keystroke

/** Results for one exact search (query + filters). Kept by the parent across steps. */
export type KeyedResults = { key: string; value: Results } | null;

type SearchStepProps = {
  search: SearchState;
  onSearchChange: (search: SearchState) => void;
  results: KeyedResults;
  onResults: (results: KeyedResults) => void;
  onPicked: (draft: ShowDraft) => void;
  onManual: () => void;
};

export function SearchStep({
  search,
  onSearchChange,
  results: keyed,
  onResults,
  onPicked,
  onManual,
}: SearchStepProps) {
  const [picking, setPicking] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const latest = useRef(0);

  const set = (patch: Partial<SearchState>) => onSearchChange({ ...search, ...patch });
  const request = {
    mode: search.mode,
    query: search.query.trim(),
    year: search.year ? Number(search.year) : undefined,
    month: search.year && search.month ? Number(search.month) : undefined,
    state: search.state || undefined,
  };
  const requestKey = JSON.stringify(request);
  const tooShort = request.query.length < 2;
  const results: Results = tooShort
    ? { status: "idle" }
    : keyed?.key === requestKey
      ? keyed.value
      : { status: "loading" };
  const haveResultsFor = keyed?.key;

  // Search as the user types, debounced. Responses for an older search are ignored, and a
  // search we already have results for (coming back from the lineup step) isn't repeated.
  useEffect(() => {
    if (haveResultsFor === requestKey) return;
    const req = JSON.parse(requestKey) as typeof request;
    if (req.query.length < 2) return;
    const id = ++latest.current;
    const timer = setTimeout(() => {
      searchSetlists(req)
        .then((r) => {
          if (id === latest.current)
            onResults({ key: requestKey, value: { status: "done", ...r } });
        })
        .catch((e: Error) => {
          if (id === latest.current) {
            onResults({ key: requestKey, value: { status: "error", message: e.message } });
          }
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [requestKey, haveResultsFor, onResults]);

  async function loadMore() {
    if (results.status !== "done" || !results.nextPage) return;
    const key = requestKey;
    onResults({ key, value: { ...results, loadingMore: true } });
    try {
      const more = await searchSetlists({ ...request, page: results.nextPage });
      onResults({
        key,
        value: {
          status: "done",
          results: [...results.results, ...more.results],
          nextPage: more.nextPage,
          incomplete: more.incomplete,
          needsState: more.needsState,
        },
      });
    } catch (e) {
      onResults({ key, value: { ...results, loadingMore: false } });
      setPickError((e as Error).message);
    }
  }

  async function pick(result: SearchResult) {
    setPicking(result.key);
    setPickError(null);
    try {
      const lineup = await fetchLineup({
        target: result.target,
        date: result.date,
        searchedArtistMbid: result.kind === "concert" ? result.artistMbid : null,
      });
      onPicked({
        source: "setlistfm",
        date: result.date,
        venue: {
          name: result.venue.name,
          city: result.venue.city,
          state: result.venue.state as ShowDraft["venue"]["state"],
          setlistfmId: result.venue.setlistfmId,
        },
        festivalName: result.kind === "festival-day" ? result.festivalName : null,
        festivalDayLabel: result.kind === "festival-day" ? result.dayLabel || null : null,
        setlistfmUrl:
          lineup.setlistfmUrl ?? (result.kind === "concert" ? result.setlistfmUrl : null),
        artists: lineup.artists.map((a) =>
          lineupRow({ name: a.name, mbid: a.mbid, setlistfmUrl: a.setlistfmUrl }),
        ),
      });
    } catch (e) {
      setPickError((e as Error).message);
    } finally {
      setPicking(null);
    }
  }

  const isFestival = search.mode === "festival";
  return (
    <div className="flex flex-col gap-4">
      <StepHeader step={1} title="Add a concert" />

      <div
        role="group"
        aria-label="What are you adding?"
        className="grid grid-cols-2 gap-1 rounded-3xl bg-surface p-1"
      >
        {(
          [
            ["concert", "Concert"],
            ["festival", "Festival"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={search.mode === mode}
            onClick={() => set({ mode })}
            className="h-10 rounded-full font-semibold aria-pressed:bg-accent aria-pressed:font-bold aria-pressed:text-on-accent"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex h-12 items-center gap-2.5 rounded-lg bg-surface px-3.5 text-muted">
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
        <label htmlFor="add-search" className="sr-only">
          Search
        </label>
        <input
          id="add-search"
          type="search"
          autoComplete="off"
          autoFocus
          placeholder={isFestival ? "Festival name, e.g. Bonnaroo" : "Artist or venue"}
          value={search.query}
          onChange={(e) => set({ query: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-subtle"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Select
          id="f-month"
          label="Month"
          value={search.year ? search.month : ""}
          disabled={!search.year}
          onChange={(month) => set({ month })}
          options={MONTHS.map((m, i) => [String(i + 1), m])}
          title={search.year ? undefined : "Pick a year first"}
        />
        <Select
          id="f-year"
          label="Year"
          value={search.year}
          onChange={(year) => set({ year, month: year ? search.month : "" })}
          options={YEARS.map((y) => [y, y])}
        />
        <Select
          id="f-state"
          label="State"
          value={search.state}
          onChange={(state) => set({ state })}
          options={US_STATES.map(([code]) => [code, code])}
        />
      </div>

      <section aria-live="polite" aria-busy={results.status === "loading"} className="min-h-24">
        <ResultsView
          results={results}
          isFestival={isFestival}
          picking={picking}
          onPick={pick}
          onLoadMore={loadMore}
        />
        {pickError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {pickError}
          </p>
        )}
      </section>

      <div className="flex flex-col items-center gap-1 border-t border-border pt-4 text-sm">
        <p className="text-muted">
          Can&apos;t find it?{" "}
          <button
            type="button"
            onClick={onManual}
            className="font-semibold text-accent hover:text-accent-hover"
          >
            Add it manually
          </button>
        </p>
        <p className="text-subtle">
          Concert data from{" "}
          <a
            href="https://www.setlist.fm"
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:text-accent-hover"
          >
            setlist.fm
          </a>
        </p>
      </div>
    </div>
  );
}

type SelectProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: (readonly [string, string])[];
  disabled?: boolean;
  title?: string;
};

function Select({ id, label, value, onChange, options, disabled, title }: SelectProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-bold text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        title={title}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-lg border border-surface-raised bg-surface px-2 text-base disabled:opacity-50"
      >
        <option value="">Any</option>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

type ResultsViewProps = {
  results: Results;
  isFestival: boolean;
  picking: string | null;
  onPick: (result: SearchResult) => void;
  onLoadMore: () => void;
};

function ResultsView({ results, isFestival, picking, onPick, onLoadMore }: ResultsViewProps) {
  if (results.status === "idle") {
    return (
      <p className="py-6 text-center text-muted">
        {isFestival ? "Search for a festival to see its days." : "Search for an artist or venue."}
      </p>
    );
  }
  if (results.status === "loading") {
    return (
      <p className="py-6 text-center text-muted">
        {isFestival
          ? "Finding festival days… big festivals can take a few seconds."
          : "Searching setlist.fm…"}
      </p>
    );
  }
  if (results.status === "error") {
    return (
      <p role="alert" className="py-6 text-center text-danger">
        {results.message}
      </p>
    );
  }
  // Touring festivals (Warped Tour) search their older stops one state at a time.
  const pickState = results.needsState && (
    <p className="py-3 text-center text-muted">
      This festival toured a different city every day. Pick a state to find your stop.
    </p>
  );
  if (results.results.length === 0 && pickState) return pickState;
  if (results.results.length === 0) {
    return (
      <p className="py-6 text-center text-muted">
        No shows found. Try fewer filters{isFestival ? ", the venue name" : ""}, or add it manually.
      </p>
    );
  }

  const heading = isFestival
    ? `${results.results.length} ${results.results.length === 1 ? "day" : "days"} · pick the one you attended`
    : `${results.results.length}${results.nextPage ? "+" : ""} ${results.results.length === 1 ? "result" : "results"}`;

  return (
    <>
      <h2 className="pb-1 text-xs font-bold tracking-widest text-muted uppercase">{heading}</h2>
      <ul className="-mx-2">
        {results.results.map((r) => (
          <li key={r.key}>
            <button
              type="button"
              onClick={() => onPick(r)}
              disabled={picking !== null}
              aria-busy={picking === r.key}
              className="flex w-full items-center gap-3.5 rounded-xl px-2 py-2.5 text-left hover:bg-surface disabled:opacity-60 aria-busy:opacity-100"
            >
              <DateTile iso={r.date} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="sr-only">{formatShowDate(r.date)}:</span>
                <span className="truncate font-bold">
                  {r.kind === "festival-day"
                    ? festivalLabel(r.festivalName, r.dayLabel || null)
                    : r.title}
                </span>
                <span className="truncate text-sm text-muted">{r.venue.name}</span>
                <span className="truncate text-sm text-muted">
                  {formatCityState(r.venue.city, r.venue.state)}
                  {r.kind === "festival-day" &&
                    ` · ${r.artistCount} ${r.artistCount === 1 ? "artist" : "artists"}`}
                </span>
              </span>
              {picking === r.key ? (
                <span className="text-sm text-muted">Loading…</span>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  width="20"
                  height="20"
                  aria-hidden
                  className="shrink-0 fill-none stroke-subtle stroke-2"
                >
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </li>
        ))}
      </ul>
      {pickState}
      {results.incomplete && (
        <p className="mt-2 text-sm text-muted">
          setlist.fm had more than we could check. If your day is missing, pick a year or month.
        </p>
      )}
      {results.nextPage && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={results.loadingMore}
          className="mt-3 h-11 w-full rounded-full border border-surface-raised font-bold disabled:opacity-60"
        >
          {results.loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </>
  );
}
