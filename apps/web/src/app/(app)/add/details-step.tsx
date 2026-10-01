"use client";

import { formatShowDate, lineupSummary, type ConcertDraft } from "@musicjunkie/shared";
import Link from "next/link";
import { useState, useTransition } from "react";
import { DetailsFields, readPrice, type Details } from "@/components/concert/details-fields";
import { saveConcert } from "./actions";
import type { ShowDraft } from "./draft";
import { StepHeader } from "./step-header";

type DetailsStepProps = {
  draft: ShowDraft;
  details: Details;
  onDetailsChange: (details: Details) => void;
  festivalName: string;
  onFestivalNameChange: (name: string) => void;
  onBack: () => void;
};

export function DetailsStep({
  draft,
  details,
  onDetailsChange,
  festivalName,
  onFestivalNameChange,
  onBack,
}: DetailsStepProps) {
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [duplicateLogId, setDuplicateLogId] = useState<string | null>(null);

  function save() {
    setError(null);
    setDuplicateLogId(null);
    const cents = readPrice(details, setPriceError);
    if (cents === undefined) return;
    const payload: ConcertDraft = {
      source: draft.source,
      date: draft.date,
      venue: draft.venue,
      festivalName: draft.festivalName === null ? null : festivalName.trim() || null,
      festivalDayLabel: draft.festivalDayLabel,
      setlistfmUrl: draft.setlistfmUrl,
      artists: draft.artists.map(({ name, mbid, setlistfmUrl, setlistUrl }) => ({
        name,
        mbid,
        setlistfmUrl,
        setlistUrl,
      })),
      ratingTenths: details.ratingTenths,
      ticketPriceCents: cents,
      notes: details.notes.trim(),
    };
    startSaving(async () => {
      // On success the action redirects to the new concert.
      const result = await saveConcert(payload);
      if (result.duplicateLogId) setDuplicateLogId(result.duplicateLogId);
      else if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <StepHeader step={3} title="Details" onBack={onBack} />
      <p className="text-muted">
        {lineupSummary(draft.artists.map((a) => a.name))} · {draft.venue.name} ·{" "}
        {formatShowDate(draft.date).replace(/^\w+, /, "")}. Everything here is optional.
      </p>

      {draft.festivalName !== null && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="festival-name" className="font-bold">
            Festival
          </label>
          <input
            id="festival-name"
            type="text"
            maxLength={200}
            value={festivalName}
            onChange={(e) => onFestivalNameChange(e.target.value)}
            className="h-12 rounded-lg border border-surface-raised bg-surface px-3 text-base outline-none focus:border-accent"
          />
        </div>
      )}

      <DetailsFields details={details} onChange={onDetailsChange} priceError={priceError} />

      <div role="alert" className="text-sm">
        {error && <p className="text-danger">{error}</p>}
        {duplicateLogId && (
          <p className="rounded-xl bg-surface p-4">
            You already logged this show.{" "}
            <Link
              href={`/concerts/${duplicateLogId}`}
              className="font-bold text-accent hover:text-accent-hover"
            >
              Open your log
            </Link>
          </p>
        )}
      </div>

      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="h-13 w-full rounded-full bg-accent font-extrabold text-on-accent hover:bg-accent-hover disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save concert"}
        </button>
      </div>
    </div>
  );
}
