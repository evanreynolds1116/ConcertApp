"use client";

import { useState } from "react";
import { emptyDetails, type Details } from "@/components/concert/details-fields";
import { DetailsStep } from "./details-step";
import type { ShowDraft } from "./draft";
import { LineupStep } from "./lineup-step";
import { ManualStep } from "./manual-step";
import { initialSearch, SearchStep, type KeyedResults, type SearchState } from "./search-step";

type Step = "search" | "manual" | "lineup" | "details";

/** The add-concert flow: search (or manual entry) -> lineup -> details -> save. */
export function AddConcert() {
  const [step, setStep] = useState<Step>("search");
  const [search, setSearch] = useState<SearchState>(initialSearch);
  const [results, setResults] = useState<KeyedResults>(null);
  const [draft, setDraft] = useState<ShowDraft | null>(null);
  const [details, setDetails] = useState<Details>(emptyDetails);
  const [festivalName, setFestivalName] = useState("");

  function go(next: Step) {
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  function startDraft(next: ShowDraft) {
    setDraft(next);
    setDetails(emptyDetails);
    setFestivalName(next.festivalName ?? "");
    go("lineup");
  }

  if (step === "manual") {
    return (
      <ManualStep
        initial={draft?.source === "manual" ? draft : null}
        onBack={() => go("search")}
        onContinue={(next) =>
          startDraft(draft?.source === "manual" ? { ...next, artists: draft.artists } : next)
        }
      />
    );
  }
  if (step === "lineup" && draft) {
    return (
      <LineupStep
        draft={draft}
        onBack={() => go(draft.source === "manual" ? "manual" : "search")}
        onChange={(artists) => setDraft({ ...draft, artists })}
        onContinue={() => go("details")}
      />
    );
  }
  if (step === "details" && draft) {
    return (
      <DetailsStep
        draft={draft}
        details={details}
        onDetailsChange={setDetails}
        festivalName={festivalName}
        onFestivalNameChange={setFestivalName}
        onBack={() => go("lineup")}
      />
    );
  }
  return (
    <SearchStep
      search={search}
      onSearchChange={setSearch}
      results={results}
      onResults={setResults}
      onPicked={startDraft}
      onManual={() => go("manual")}
    />
  );
}
