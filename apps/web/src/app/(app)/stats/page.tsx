import { formatMonthYear, formatPriceWhole, spendCoverage } from "@musicjunkie/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { BarChart } from "@/components/stats/bar-chart";
import { requireViewer } from "@/lib/auth";
import { fetchStats } from "@/lib/concerts";
import { Leaderboards } from "./leaderboards";

export const metadata: Metadata = { title: "Stats · Music Junkie" };

export default async function StatsPage() {
  const { supabase, profile } = await requireViewer();
  const { stats, byYear, leaderboards } = await fetchStats(supabase, profile.id);

  if (stats.concerts === 0) {
    return (
      <div className="mx-auto w-full max-w-xl">
        <h1 className="text-3xl font-extrabold tracking-tight">Your stats</h1>
        <div className="mt-6 rounded-xl border border-border bg-surface p-6 text-center">
          <p className="font-semibold">No stats yet</p>
          <p className="mt-1 text-muted">Log a concert and your numbers start here.</p>
          <Link
            href="/add"
            className="mt-4 inline-flex h-11 items-center rounded-full bg-accent px-5 font-bold text-on-accent hover:bg-accent-hover"
          >
            Add concert
          </Link>
        </div>
      </div>
    );
  }

  const hasSpend = stats.priced_concerts > 0;
  const firstYear = byYear[0]?.year;
  const lastYear = byYear.at(-1)?.year;
  const busiest = byYear.reduce((a, b) => (b.concerts > a.concerts ? b : a), byYear[0]!);
  const priciest = byYear.reduce((a, b) => (b.spent_cents > a.spent_cents ? b : a), byYear[0]!);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-7">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Your stats</h1>
        {stats.first_show && (
          <p className="mt-1 text-sm text-muted">
            All time · since {formatMonthYear(stats.first_show)}
          </p>
        )}
      </header>

      <section aria-label="Totals" className="grid grid-cols-2 gap-2.5">
        <div className="col-span-2 flex items-baseline justify-between rounded-xl bg-accent p-4.5 text-on-accent">
          <span className="font-bold">Concerts</span>
          <span className="text-[52px] leading-none font-extrabold">{stats.concerts}</span>
        </div>
        {(
          [
            ["Artists", stats.artists],
            ["Venues", stats.venues],
            ["Cities", stats.cities],
            ["States", stats.states],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="flex flex-col-reverse gap-1 rounded-xl bg-surface p-4">
            <span className="text-sm font-semibold text-muted">{label}</span>
            <span className="text-[34px] leading-none font-extrabold">{value}</span>
          </div>
        ))}
      </section>

      {hasSpend && (
        <section
          aria-labelledby="money-h"
          className="flex flex-col gap-1.5 rounded-xl bg-hero p-4.5"
        >
          <h2 id="money-h" className="text-sm font-bold text-hero-muted">
            Money spent
          </h2>
          <span className="text-[42px] leading-none font-extrabold">
            {formatPriceWhole(stats.spent_cents)}
          </span>
          <span className="text-sm text-hero-muted">
            across {stats.priced_concerts} of {stats.concerts}{" "}
            {stats.concerts === 1 ? "concert" : "concerts"} with a ticket price
          </span>
        </section>
      )}

      <section aria-labelledby="cpy-h" className="flex flex-col gap-3">
        <h2 id="cpy-h" className="text-xl font-extrabold">
          Concerts per year
        </h2>
        <BarChart
          title="Concerts per year"
          summary={`${firstYear} to ${lastYear}. Busiest year: ${busiest.year}, with ${busiest.concerts}.`}
          columns={["Year", "Concerts"]}
          bars={byYear.map((y) => ({
            key: String(y.year),
            label: String(y.year),
            value: y.concerts,
            valueLabel: String(y.concerts),
            tooltip: `${y.year}: ${y.concerts} ${y.concerts === 1 ? "concert" : "concerts"}`,
          }))}
        />
      </section>

      {hasSpend && (
        <section aria-labelledby="spy-h" className="flex flex-col gap-3">
          <h2 id="spy-h" className="text-xl font-extrabold">
            Spend per year
          </h2>
          <BarChart
            title="Spend per year"
            summary={`${firstYear} to ${lastYear}. Most spent: ${priciest.year}, ${formatPriceWhole(priciest.spent_cents)}.`}
            columns={["Year", "Spent"]}
            bars={byYear.map((y) => ({
              key: String(y.year),
              label: String(y.year),
              value: y.spent_cents,
              valueLabel: formatPriceWhole(y.spent_cents),
              tooltip: `${y.year}: ${spendCoverage(y.spent_cents, y.priced_concerts, y.concerts)}`,
            }))}
          />
          <p className="text-xs text-subtle">Only concerts with a ticket price are counted.</p>
        </section>
      )}

      <Leaderboards boards={leaderboards} />
    </div>
  );
}
