"use client";

import { festivalLabel, formatCityState, formatShowDate } from "@musicjunkie/shared";
import { LineupEditor, type LineupRow } from "@/components/concert/lineup-editor";
import type { ShowDraft } from "./draft";
import { StepHeader } from "./step-header";

type LineupStepProps = {
  draft: ShowDraft;
  onBack: () => void;
  onChange: (artists: LineupRow[]) => void;
  onContinue: () => void;
};

export function LineupStep({ draft, onBack, onChange, onContinue }: LineupStepProps) {
  const count = draft.artists.length;
  return (
    <div className="flex flex-col gap-4">
      <StepHeader step={2} title="Edit lineup" onBack={onBack} />

      <div className="flex flex-col gap-0.5 rounded-xl bg-surface px-4 py-3.5">
        {draft.festivalName && (
          <span className="text-sm font-bold text-accent">
            {festivalLabel(draft.festivalName, draft.festivalDayLabel)}
          </span>
        )}
        <span className="font-bold">{draft.venue.name}</span>
        <span className="text-sm text-muted">
          {formatCityState(draft.venue.city, draft.venue.state)} · {formatShowDate(draft.date)}
        </span>
      </div>

      <LineupEditor rows={draft.artists} onChange={onChange} />

      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={onContinue}
          disabled={count === 0}
          className="h-13 w-full rounded-full bg-accent font-extrabold text-on-accent hover:bg-accent-hover disabled:bg-surface-raised disabled:text-subtle"
        >
          {count === 0 ? "Continue" : `Continue · ${count} ${count === 1 ? "artist" : "artists"}`}
        </button>
      </div>
    </div>
  );
}
