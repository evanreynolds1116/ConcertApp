"use client";

import { formatPrice, formatRating, parsePriceToCents, parseRating } from "@musicjunkie/shared";
import { useState } from "react";

/** The optional per-log details, as the form holds them (price as typed text). */
export type Details = {
  ratingTenths: number | null;
  price: string;
  notes: string;
};

export const emptyDetails: Details = { ratingTenths: null, price: "", notes: "" };

/** Form values from a saved log. */
export function detailsFromLog(log: {
  rating_tenths: number | null;
  ticket_price_cents: number | null;
  notes: string | null;
}): Details {
  return {
    ratingTenths: log.rating_tenths,
    price:
      log.ticket_price_cents === null
        ? ""
        : formatPrice(log.ticket_price_cents).replace(/^\$/, "").replace(/,/g, ""),
    notes: log.notes ?? "",
  };
}

/**
 * Checks the price, focusing it with a message if it's invalid.
 * Returns cents, null for "not set", or undefined if invalid.
 */
export function readPrice(details: Details, setPriceError: (message: string | null) => void) {
  const cents = parsePriceToCents(details.price);
  if (cents === undefined) {
    setPriceError("Enter a price like 85 or 85.50, or leave it blank.");
    document.getElementById("price")?.focus();
    return undefined;
  }
  setPriceError(null);
  return cents;
}

type DetailsFieldsProps = {
  details: Details;
  onChange: (details: Details) => void;
  priceError: string | null;
};

/** Rating, ticket price and notes: the details step of Add concert, and Edit. */
export function DetailsFields({ details, onChange, priceError }: DetailsFieldsProps) {
  const set = (patch: Partial<Details>) => onChange({ ...details, ...patch });
  return (
    <>
      <RatingSection
        ratingTenths={details.ratingTenths}
        onChange={(ratingTenths) => set({ ratingTenths })}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="price" className="font-bold">
          Ticket price
        </label>
        <div className="flex h-12 items-center gap-1.5 rounded-lg border border-surface-raised bg-surface px-3 focus-within:border-accent has-aria-invalid:border-danger">
          <span className="font-semibold text-muted" aria-hidden>
            $
          </span>
          <input
            id="price"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={details.price}
            onChange={(e) => set({ price: e.target.value })}
            aria-invalid={priceError ? true : undefined}
            aria-describedby={priceError ? "price-hint price-error" : "price-hint"}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-subtle"
          />
          <span className="text-sm text-subtle">USD</span>
        </div>
        <span id="price-hint" className="text-xs text-subtle">
          One ticket, fees included
        </span>
        {priceError && (
          <p id="price-error" className="text-sm text-danger">
            {priceError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notes" className="font-bold">
          Notes
        </label>
        <textarea
          id="notes"
          rows={4}
          maxLength={5000}
          placeholder="Favorite moment, who you went with, the setlist surprise…"
          value={details.notes}
          onChange={(e) => set({ notes: e.target.value })}
          className="resize-none rounded-lg border border-surface-raised bg-surface p-3 text-base leading-snug outline-none placeholder:text-subtle focus:border-accent"
        />
      </div>
    </>
  );
}

function RatingSection({
  ratingTenths,
  onChange,
}: {
  ratingTenths: number | null;
  onChange: (tenths: number | null) => void;
}) {
  // The number box keeps its own text while typing ("8." isn't a rating yet).
  const [typed, setTyped] = useState<string | null>(null);
  const hasRating = ratingTenths !== null;
  return (
    <section aria-labelledby="rating-h" className="flex flex-col gap-2.5 rounded-xl bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 id="rating-h" className="font-bold">
          Rating
        </h2>
        {hasRating && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="min-h-11 px-1 text-sm font-semibold text-muted hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
      {hasRating ? (
        <>
          <div className="flex items-baseline gap-1.5" aria-hidden>
            <span className="text-5xl leading-none font-extrabold text-accent">
              {formatRating(ratingTenths)}
            </span>
            <span className="font-semibold text-muted">/ 10</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={ratingTenths}
              onChange={(e) => {
                setTyped(null);
                onChange(Number(e.target.value));
              }}
              aria-label="Rating, 0 to 10"
              aria-valuetext={`${formatRating(ratingTenths)} out of 10`}
              className="h-11 flex-1 accent-accent"
            />
            <label htmlFor="rating-num" className="sr-only">
              Rating value
            </label>
            <input
              id="rating-num"
              type="text"
              inputMode="decimal"
              value={typed ?? formatRating(ratingTenths)}
              onChange={(e) => {
                setTyped(e.target.value);
                const parsed = parseRating(e.target.value);
                if (typeof parsed === "number") onChange(parsed);
              }}
              onBlur={() => setTyped(null)}
              className="h-11 w-18 rounded-lg border border-surface-raised bg-background px-2 text-center font-bold outline-none focus:border-accent"
            />
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">No rating yet. Ratings go from 0.0 to 10.0.</p>
          <button
            type="button"
            onClick={() => onChange(70)}
            className="h-11 self-start rounded-full border border-accent px-4.5 font-bold text-accent hover:bg-accent hover:text-on-accent"
          >
            Add a rating
          </button>
        </>
      )}
    </section>
  );
}
