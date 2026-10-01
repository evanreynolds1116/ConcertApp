"use client";

import {
  FEED_PAGE_SIZE,
  festivalLabel,
  formatCityState,
  formatRating,
  formatShowDate,
  timeAgo,
} from "@musicjunkie/shared";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/social/avatar";
import type { FeedItem } from "@/lib/social";
import { loadFeedPage } from "./actions";

type FeedListProps = {
  viewerId: string;
  initialItems: FeedItem[];
  initialAvatars: Record<string, string>;
  /** Server render time, so relative times match between server and browser. */
  now: string;
};

export function FeedList({ viewerId, initialItems, initialAvatars, now }: FeedListProps) {
  const [items, setItems] = useState(initialItems);
  const [avatars, setAvatars] = useState(initialAvatars);
  const [hasMore, setHasMore] = useState(initialItems.length === FEED_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const nowDate = new Date(now);

  async function loadMore() {
    const last = items.at(-1);
    if (!last || loading) return;
    setLoading(true);
    setError(null);
    try {
      const next = await loadFeedPage(last.created_at, last.id);
      setItems((current) => [...current, ...next.items]);
      setAvatars((current) => ({ ...current, ...next.avatars }));
      setHasMore(next.items.length === FEED_PAGE_SIZE);
    } catch {
      setError("Couldn't load more. Try again.");
    } finally {
      setLoading(false);
    }
  }

  // Infinite scroll: load the next page as the end of the list comes into view.
  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  });
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMoreRef.current();
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore]);

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 text-center">
        <p className="font-semibold">Nothing here yet</p>
        <p className="mt-1 text-muted">Log a concert or follow people to fill your feed.</p>
        <Link
          href="/people"
          className="mt-3 inline-block font-semibold text-accent hover:text-accent-hover"
        >
          Find people
        </Link>
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id} className="border-b border-border py-3.5 last:border-b-0">
            <FeedEntry
              item={item}
              viewerId={viewerId}
              avatarSrc={item.actor_avatar_url ? avatars[item.actor_avatar_url] : null}
              now={nowDate}
            />
          </li>
        ))}
      </ul>
      {hasMore && (
        <div ref={sentinel} className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="h-11 rounded-full border border-surface-raised px-6 font-bold disabled:opacity-60"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}
    </>
  );
}

function FeedEntry({
  item,
  viewerId,
  avatarSrc,
  now,
}: {
  item: FeedItem;
  viewerId: string;
  avatarSrc: string | null | undefined;
  now: Date;
}) {
  const isMe = item.actor_id === viewerId;
  const actor = (
    <Link href={`/u/${item.actor_username}`} className="font-bold hover:underline">
      {isMe ? "You" : item.actor_display_name}
    </Link>
  );
  const when = (
    <time dateTime={item.created_at} className="text-muted">
      {" "}
      · {timeAgo(item.created_at, now)}
    </time>
  );

  return (
    <div className="flex gap-3">
      <Link href={`/u/${item.actor_username}`} tabIndex={-1} aria-hidden>
        <Avatar userId={item.actor_id} name={item.actor_display_name} src={avatarSrc} size={40} />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {item.type === "follow_started" ? (
          <p>
            {actor} started following{" "}
            {item.target_id === viewerId ? (
              <strong className="font-bold">you</strong>
            ) : (
              <Link href={`/u/${item.target_username}`} className="font-bold hover:underline">
                {item.target_display_name}
              </Link>
            )}
            {when}
          </p>
        ) : (
          <>
            <p>
              {actor} logged {item.festival_name ? "a festival day" : "a concert"}
              {when}
            </p>
            <Link
              href={`/concerts/${item.log_id}`}
              className="flex items-center gap-3 rounded-xl bg-surface px-3.5 py-3 hover:bg-surface-raised"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-bold">
                  {item.festival_name
                    ? festivalLabel(item.festival_name, item.festival_day_label)
                    : item.headliner}
                </span>
                <span className="truncate text-sm text-muted">
                  {item.venue_name} · {formatCityState(item.city ?? "", item.state ?? "")}
                </span>
                <span className="text-sm text-muted">
                  {item.show_date && formatShowDate(item.show_date)}
                  {item.festival_name && item.artist_count
                    ? ` · ${item.artist_count} ${item.artist_count === 1 ? "artist" : "artists"}`
                    : ""}
                </span>
              </span>
              {item.rating_tenths !== null && (
                <span
                  className="flex h-7 min-w-11 items-center justify-center rounded-full bg-hero px-2 text-sm font-bold text-accent"
                  aria-label={`Rated ${formatRating(item.rating_tenths)}`}
                >
                  {formatRating(item.rating_tenths)}
                </span>
              )}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
