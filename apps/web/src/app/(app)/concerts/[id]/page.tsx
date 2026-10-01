import { formatCityState, formatPrice, formatRating, formatShowDate } from "@musicjunkie/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadConcert(id: string) {
  if (!UUID.test(id)) return null;
  const { supabase, profile } = await requireViewer();
  // RLS decides visibility: someone else's private log simply isn't found.
  const { data } = await supabase
    .from("concert_logs")
    .select(
      "id, user_id, rating_tenths, ticket_price_cents, notes, source, shows!inner(date, festival_name, setlistfm_url, venues!inner(name, city, state)), log_artists(position, artists!inner(name))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const lineup = [...data.log_artists]
    .sort((a, b) => a.position - b.position)
    .map((a) => a.artists.name);
  return {
    log: data,
    show: data.shows,
    venue: data.shows.venues,
    lineup,
    isOwner: data.user_id === profile.id,
  };
}

export async function generateMetadata({ params }: PageProps<"/concerts/[id]">): Promise<Metadata> {
  const concert = await loadConcert((await params).id);
  return {
    title: concert ? `${concert.lineup[0] ?? "Concert"} · Music Junkie` : "Concert · Music Junkie",
  };
}

export default async function ConcertPage({ params }: PageProps<"/concerts/[id]">) {
  const concert = await loadConcert((await params).id);
  if (!concert) notFound();
  const { log, show, venue, lineup, isOwner } = concert;
  const hasDetails = log.ticket_price_cents !== null || log.notes;

  return (
    <article className="mx-auto w-full max-w-xl">
      <section className="-mx-4 bg-hero px-5 pt-3 pb-5.5 sm:mx-0 sm:rounded-xl">
        <Link
          href="/"
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
          Log
        </Link>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-1.5 text-sm font-bold text-hero-muted">{formatShowDate(show.date)}</p>
            {show.festival_name && (
              <p className="mb-1 font-bold text-accent">{show.festival_name}</p>
            )}
            <h1 className="text-4xl leading-tight font-extrabold tracking-tight">{lineup[0]}</h1>
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

      <section aria-labelledby="lineup-h" className="pt-5">
        <h2 id="lineup-h" className="mb-2 text-lg font-extrabold">
          Lineup
        </h2>
        <ol className="flex flex-col">
          {lineup.map((name, i) => (
            <li key={`${i}-${name}`} className="flex h-12 items-center gap-3">
              <span className="w-5 text-sm font-bold text-muted">{i + 1}</span>
              <span className={i === 0 ? "font-bold" : "font-semibold"}>{name}</span>
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

      {log.source === "setlistfm" && (
        <p className="pt-5 text-xs text-subtle">
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
