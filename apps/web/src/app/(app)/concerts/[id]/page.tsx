import {
  festivalLabel,
  formatCityState,
  formatPrice,
  formatRating,
  formatShowDate,
} from "@musicjunkie/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchAlsoHere, type AlsoHerePerson } from "@/lib/concerts";
import { DeleteButton } from "./delete-button";
import { loadConcert } from "./load";

export async function generateMetadata({ params }: PageProps<"/concerts/[id]">): Promise<Metadata> {
  const concert = await loadConcert((await params).id);
  return { title: `${concert?.lineup[0]?.name ?? "Concert"} · Music Junkie` };
}

export default async function ConcertPage({ params }: PageProps<"/concerts/[id]">) {
  const concert = await loadConcert((await params).id);
  if (!concert) notFound();
  const { supabase, log, show, venue, lineup, isOwner, owner } = concert;
  const alsoHere = await fetchAlsoHere(supabase, log.id);
  const headliner = lineup[0]?.name ?? "Concert";
  const hasDetails = log.ticket_price_cents !== null || log.notes;

  return (
    <article className="mx-auto w-full max-w-xl">
      <section className="-mx-4 bg-hero px-5 pt-3 pb-5.5 sm:mx-0 sm:rounded-xl">
        <Link
          href={isOwner ? "/" : `/u/${owner.username}`}
          className="-ml-2 inline-flex min-h-11 items-center gap-0.5 pr-3 font-semibold"
        >
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            aria-hidden
            className="fill-none stroke-current stroke-2"
          >
            <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {isOwner ? "Log" : owner.display_name}
        </Link>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-1.5 text-sm font-bold text-hero-muted">{formatShowDate(show.date)}</p>
            {show.festival_name && (
              <p className="mb-1 font-bold text-accent">
                {festivalLabel(show.festival_name, show.festival_day_label)}
              </p>
            )}
            <h1 className="text-4xl leading-tight font-extrabold tracking-tight">{headliner}</h1>
            <p className="mt-2 font-semibold">{venue.name}</p>
            <p className="mt-0.5 text-sm text-hero-muted">
              {formatCityState(venue.city, venue.state)}
            </p>
          </div>
          {log.rating_tenths !== null && (
            <div
              className="flex size-18 shrink-0 flex-col items-center justify-center rounded-full bg-accent text-on-accent"
              aria-label={`Rated ${formatRating(log.rating_tenths)} out of 10`}
              role="img"
            >
              <span className="text-2xl leading-none font-extrabold">
                {formatRating(log.rating_tenths)}
              </span>
              <span className="text-[11px] font-bold">/ 10</span>
            </div>
          )}
        </div>
      </section>

      {alsoHere.length > 0 && <AlsoHere people={alsoHere} />}

      <section aria-labelledby="lineup-h" className="pt-5">
        <h2 id="lineup-h" className="mb-2 text-lg font-extrabold">
          Lineup
        </h2>
        <ol className="flex flex-col">
          {lineup.map((artist, i) => (
            <li key={artist.id} className="flex h-12 items-center gap-3">
              <span className="w-5 text-sm font-bold text-muted">{i + 1}</span>
              <span className={i === 0 ? "font-bold" : "font-semibold"}>{artist.name}</span>
              {i === 0 && (
                <span className="rounded-full bg-accent px-2 text-[11px] font-bold text-on-accent">
                  Headliner
                </span>
              )}
            </li>
          ))}
        </ol>
      </section>

      {hasDetails && (
        <section aria-labelledby="details-h" className="pt-4">
          <h2 id="details-h" className="mb-2 text-lg font-extrabold">
            {isOwner ? "Your details" : "Details"}
          </h2>
          {log.ticket_price_cents !== null && (
            <div className="flex justify-between border-b border-border py-2.5">
              <span className="text-muted">Ticket price</span>
              <span className="font-bold">{formatPrice(log.ticket_price_cents)}</span>
            </div>
          )}
          {log.notes && (
            <p className="mt-2.5 leading-relaxed whitespace-pre-line text-foreground/90">
              {log.notes}
            </p>
          )}
        </section>
      )}

      {isOwner && (
        <div className="flex gap-2.5 pt-5">
          <Link
            href={`/concerts/${log.id}/edit`}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-surface-raised font-bold hover:border-foreground"
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              aria-hidden
              className="fill-none stroke-current stroke-2"
            >
              <path d="M4 20h4L19 9l-4-4L4 16v4z" strokeLinejoin="round" />
            </svg>
            Edit
          </Link>
          <DeleteButton logId={log.id} title={`${headliner} at ${venue.name}`} />
        </div>
      )}

      {log.source === "setlistfm" && (
        <p className="pt-4 text-xs text-subtle">
          Lineup from{" "}
          <a
            href={show.setlistfm_url ?? "https://www.setlist.fm"}
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:text-accent-hover"
          >
            setlist.fm
          </a>
        </p>
      )}
    </article>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

const AVATAR_COLORS = ["bg-[#3e6b85]", "bg-[#7a5c3e]", "bg-[#5a4a8a]", "bg-[#4a7a5a]"];

/** "Also here": people the viewer follows who logged the same show. */
function AlsoHere({ people }: { people: AlsoHerePerson[] }) {
  const names = people.map((p) => p.display_name);
  const sentence =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
  return (
    <section
      aria-labelledby="also-h"
      className="mt-4 flex items-center gap-3 rounded-xl bg-surface px-3.5 py-3"
    >
      <div className="flex shrink-0" aria-hidden>
        {people.slice(0, 3).map((p, i) => (
          <span
            key={p.user_id}
            className={`flex size-9 items-center justify-center rounded-full border-2 border-surface text-[13px] font-extrabold ${AVATAR_COLORS[i % AVATAR_COLORS.length]} ${i > 0 ? "-ml-2.5" : ""}`}
          >
            {initials(p.display_name)}
          </span>
        ))}
      </div>
      <div className="min-w-0">
        <h2 id="also-h" className="text-xs font-bold tracking-widest text-accent uppercase">
          Also here
        </h2>
        <p className="mt-0.5 text-sm">
          <strong className="font-bold">{sentence}</strong> {people.length === 1 ? "was" : "were"}{" "}
          at this show
        </p>
      </div>
    </section>
  );
}
