"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

/** The People search box: updates ?q= as you type (debounced); the page renders the results. */
export function PeopleSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [text, setText] = useState(initialQuery);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === initialQuery) return;
    const timer = setTimeout(() => {
      startTransition(() =>
        router.replace(trimmed ? `/people?q=${encodeURIComponent(trimmed)}` : "/people", {
          scroll: false,
        }),
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [text, initialQuery, router]);

  return (
    <div className="flex h-12 items-center gap-2.5 rounded-lg bg-surface px-3.5 text-muted">
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        aria-hidden
        className="shrink-0 fill-none stroke-current stroke-2"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
      </svg>
      <label htmlFor="people-search" className="sr-only">
        Search people
      </label>
      <input
        id="people-search"
        type="search"
        autoComplete="off"
        autoFocus
        placeholder="Username or name"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-busy={pending}
        className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-subtle"
      />
    </div>
  );
}
