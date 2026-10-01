"use client";

import { useEffect, useRef, useState } from "react";

export type Bar = {
  key: string;
  /** Axis label, e.g. "2024". */
  label: string;
  value: number;
  /** Shown on the bar's cap when there's room, e.g. "$310". */
  valueLabel: string;
  /** Hover text, e.g. "2024: $310 across 4 of 6 concerts". */
  tooltip: string;
};

type BarChartProps = {
  title: string;
  bars: Bar[];
  /** One sentence for screen readers; the table under the chart has every value. */
  summary: string;
  /** Column headers for the table view. */
  columns: [string, string];
};

const PLOT_HEIGHT = 130; // px for the tallest bar; value labels sit above it
const GAP = 2; // px between columns (gap-0.5)
const LABEL_PAD = 4; // px of air a label needs beside its neighbors
// Before the chart has measured itself (server render), assume a phone-width chart fits this many.
const FALLBACK_LABEL_ALL_MAX = 10;

/** Width in px of the widest text, in the chart's font at the given size and weight. */
function widestText(texts: string[], el: HTMLElement, font: string): number {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return Infinity;
  ctx.font = `${font} ${getComputedStyle(el).fontFamily}`;
  return Math.max(0, ...texts.map((t) => ctx.measureText(t).width));
}

/**
 * Measures the plot's column width and whether cap and axis labels fit in it, so labels show
 * whenever there's room rather than at a fixed bar count.
 */
function useLabelFit(bars: Bar[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ caps: boolean; axisEvery: number } | null>(null);
  // A stable key for the effect: the labels, not the bars array (a new array every render).
  const labels = JSON.stringify([bars.map((b) => b.valueLabel), bars.map((b) => b.label)]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const [valueLabels, axisLabels] = JSON.parse(labels) as [string[], string[]];
    const n = Math.max(1, valueLabels.length);
    const capWidth = widestText(valueLabels, el, "700 12px") + LABEL_PAD;
    const axisWidth = widestText(axisLabels, el, "600 11px") + LABEL_PAD;
    const observer = new ResizeObserver(([entry]) => {
      const column = (entry.contentRect.width - GAP * (n - 1)) / n;
      if (column <= 0) return;
      setFit({ caps: capWidth <= column, axisEvery: Math.max(1, Math.ceil(axisWidth / column)) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [labels]);

  return { ref, fit };
}

/**
 * A single-series column chart (one value per year). One color, no legend (the title names
 * the series); thin columns with a 4px rounded top, square at the baseline; value labels on
 * the caps when they fit; a hover tooltip per column; a table view for everyone.
 */
export function BarChart({ title, bars, summary, columns }: BarChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const { ref, fit } = useLabelFit(bars);
  const fallbackAll = bars.length <= FALLBACK_LABEL_ALL_MAX;
  const labelCaps = fit ? fit.caps : fallbackAll;
  // Label every year when there's room; otherwise every Nth, counted back from the latest
  // year so it's always labeled and the spacing stays even.
  const labelEvery = fit ? fit.axisEvery : fallbackAll ? 1 : Math.ceil(bars.length / 8);

  return (
    <figure className="flex flex-col gap-2">
      <div
        ref={ref}
        role="img"
        aria-label={`${title}. ${summary}`}
        className="relative flex h-[170px] items-end gap-0.5 border-b border-surface-raised"
        onPointerLeave={() => setActive(null)}
      >
        {bars.map((bar, i) => {
          const height =
            bar.value === 0 ? 0 : Math.max(2, Math.round((bar.value / max) * PLOT_HEIGHT));
          return (
            <div
              key={bar.key}
              className="relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
              onPointerEnter={() => setActive(i)}
              onPointerDown={() => setActive(i)}
            >
              {labelCaps && (
                <span aria-hidden className="text-xs font-bold text-foreground">
                  {bar.valueLabel}
                </span>
              )}
              <div
                aria-hidden
                className={`w-full max-w-6 rounded-t ${height === 0 ? "h-px bg-surface-raised" : "bg-accent"} ${
                  active === i ? "opacity-80" : ""
                }`}
                style={height === 0 ? undefined : { height }}
              />
              {active === i && (
                <div
                  aria-hidden
                  className={`pointer-events-none absolute bottom-full z-10 mb-1 rounded-lg bg-surface-raised px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap text-foreground shadow-lg ${
                    i < bars.length / 2 ? "left-0" : "right-0"
                  }`}
                >
                  {bar.tooltip}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div aria-hidden className="flex gap-0.5">
        {bars.map((bar, i) => (
          <span
            key={bar.key}
            className="min-w-0 flex-1 text-center text-[11px] font-semibold text-muted"
          >
            {(bars.length - 1 - i) % labelEvery === 0 ? bar.label : ""}
          </span>
        ))}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted hover:text-foreground">
          Show as a table
        </summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr className="text-muted">
              <th scope="col" className="py-1 font-semibold">
                {columns[0]}
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                {columns[1]}
              </th>
            </tr>
          </thead>
          <tbody>
            {bars.map((bar) => (
              <tr key={bar.key} className="border-t border-border">
                <th scope="row" className="py-1 font-semibold">
                  {bar.label}
                </th>
                <td className="py-1 text-right">{bar.tooltip.replace(/^[^:]+:\s*/, "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
