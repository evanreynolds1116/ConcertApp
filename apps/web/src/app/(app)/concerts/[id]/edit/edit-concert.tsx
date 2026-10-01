"use client";

import { festivalLabel, formatCityState, formatShowDate } from "@musicjunkie/shared";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  DetailsFields,
  detailsFromLog,
  readPrice,
  type Details,
} from "@/components/concert/details-fields";
import { LineupEditor, lineupRow, type LineupRow } from "@/components/concert/lineup-editor";
import { updateConcert } from "../actions";

type EditConcertProps = {
  logId: string;
  show: {
    date: string;
    festivalName: string | null;
    festivalDayLabel: string | null;
    venueName: string;
    city: string;
    state: string;
  };
  lineup: { id: string; name: string }[];
  log: { rating_tenths: number | null; ticket_price_cents: number | null; notes: string | null };
};

/** Edit a saved concert: the same lineup and details editors as Add concert. */
export function EditConcert({ logId, show, lineup, log }: EditConcertProps) {
  const [rows, setRows] = useState<LineupRow[]>(() =>
    lineup.map((a) => lineupRow({ name: a.name, mbid: null, setlistfmUrl: null, artistId: a.id })),
  );
  const [details, setDetails] = useState<Details>(() => detailsFromLog(log));
  const [priceError, setPriceError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function save() {
    setError(null);
    const cents = readPrice(details, setPriceError);
    if (cents === undefined) return;
    startSaving(async () => {
      // On success the action redirects back to the concert.
      const result = await updateConcert({
        logId,
        // Artists already on the log go by id; ones added here by name.
        artists: rows.map((r) => (r.artistId ? { artistId: r.artistId } : { name: r.name })),
        ratingTenths: details.ratingTenths,
        ticketPriceCents: cents,
        notes: details.notes.trim(),
      });
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-11 items-center">
        <Link
          href={`/concerts/${logId}`}
          className="-ml-1 flex min-h-11 items-center pr-3 font-semibold"
        >
          Cancel
        </Link>
      </div>
      <h1 className="text-3xl font-extrabold tracking-tight">Edit concert</h1>

      <div className="flex flex-col gap-0.5 rounded-xl bg-surface px-4 py-3.5">
        {show.festivalName && (
          <span className="text-sm font-bold text-accent">
            {festivalLabel(show.festivalName, show.festivalDayLabel)}
          </span>
        )}
        <span className="font-bold">{show.venueName}</span>
        <span className="text-sm text-muted">
          {formatCityState(show.city, show.state)} · {formatShowDate(show.date)}
        </span>
        <span className="mt-1 text-xs text-subtle">
          Venue and date can&apos;t be changed. To fix them, delete this concert and add it again.
        </span>
      </div>

      <section aria-labelledby="edit-lineup-h" className="flex flex-col gap-2">
        <h2 id="edit-lineup-h" className="text-lg font-extrabold">
          Lineup
        </h2>
        <LineupEditor rows={rows} onChange={setRows} />
      </section>

      <section aria-labelledby="edit-details-h" className="flex flex-col gap-4">
        <h2 id="edit-details-h" className="text-lg font-extrabold">
          Details
        </h2>
        <DetailsFields details={details} onChange={setDetails} priceError={priceError} />
      </section>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || rows.length === 0}
          className="h-13 w-full rounded-full bg-accent font-extrabold text-on-accent hover:bg-accent-hover disabled:bg-surface-raised disabled:text-subtle"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
