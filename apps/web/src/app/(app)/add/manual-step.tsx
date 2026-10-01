"use client";

import {
  fieldErrorsOf,
  manualShowSchema,
  US_STATES,
  usToday,
  type FieldErrors,
} from "@musicjunkie/shared";
import { useState } from "react";
import { Field } from "@/components/field";
import type { ShowDraft } from "./draft";
import { StepHeader } from "./step-header";

type ManualStepProps = {
  /** The previous manual entry, when coming back from the lineup step. */
  initial: ShowDraft | null;
  onBack: () => void;
  onContinue: (draft: ShowDraft) => void;
};

/** For shows that aren't on setlist.fm: venue, city, state and date. Artists come next. */
export function ManualStep({ initial, onBack, onContinue }: ManualStepProps) {
  const [errors, setErrors] = useState<FieldErrors>({});

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = manualShowSchema.safeParse({
      venueName: form.get("venueName"),
      city: form.get("city"),
      state: form.get("state"),
      date: form.get("date"),
      festivalName: form.get("festivalName") ?? "",
    });
    if (!parsed.success) {
      setErrors(fieldErrorsOf(parsed.error));
      return;
    }
    const v = parsed.data;
    onContinue({
      source: "manual",
      date: v.date,
      venue: { name: v.venueName, city: v.city, state: v.state, setlistfmId: null },
      festivalName: v.festivalName || null,
      dayLabel: null,
      setlistfmUrl: null,
      artists: [],
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <StepHeader step={1} title="Add it manually" onBack={onBack} />
      <p className="text-muted">Where and when was it? You&apos;ll add the artists next.</p>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field
          label="Venue"
          name="venueName"
          autoComplete="off"
          defaultValue={initial?.venue.name}
          errors={errors.venueName}
        />
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field
            label="City"
            name="city"
            autoComplete="address-level2"
            defaultValue={initial?.venue.city}
            errors={errors.city}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="state" className="text-sm font-semibold">
              State
            </label>
            <select
              id="state"
              name="state"
              defaultValue={initial?.venue.state ?? ""}
              aria-invalid={errors.state ? true : undefined}
              aria-describedby={errors.state ? "state-error" : undefined}
              className="h-12 rounded-xl border border-border bg-surface px-3 text-base aria-invalid:border-danger"
            >
              <option value="" disabled>
                Pick
              </option>
              {US_STATES.map(([code, name]) => (
                <option key={code} value={code}>
                  {code} · {name}
                </option>
              ))}
            </select>
            {errors.state && (
              <p id="state-error" className="text-sm text-danger">
                {errors.state[0]}
              </p>
            )}
          </div>
        </div>
        <DateField defaultValue={initial?.date} errors={errors.date} />
        <Field
          label="Festival name (optional)"
          name="festivalName"
          autoComplete="off"
          defaultValue={initial?.festivalName ?? undefined}
          hint="Only for festivals. Log each day you went as its own concert."
          errors={errors.festivalName}
        />
        <button
          type="submit"
          className="mt-2 h-13 rounded-full bg-accent font-extrabold text-on-accent hover:bg-accent-hover"
        >
          Continue
        </button>
      </form>
    </div>
  );
}

function DateField({ defaultValue, errors }: { defaultValue?: string; errors?: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="date" className="text-sm font-semibold">
        Date
      </label>
      <input
        id="date"
        name="date"
        type="date"
        defaultValue={defaultValue}
        min="1960-01-01"
        max={usToday()}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={errors?.length ? "date-error" : undefined}
        className="h-12 rounded-xl border border-border bg-surface px-4 text-base [color-scheme:dark] aria-invalid:border-danger"
      />
      {errors?.length ? (
        <p id="date-error" className="text-sm text-danger">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}
