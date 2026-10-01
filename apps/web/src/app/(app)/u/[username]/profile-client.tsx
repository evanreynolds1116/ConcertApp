"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/social/avatar";
import { FollowButton } from "@/components/social/follow-button";
import type { FollowStatus, Person } from "@/lib/social";
import { acceptRequest, removeFollower } from "../../social-actions";

/** "This account is private" with a Follow / Requested button; the message follows the button. */
export function LockedProfile({
  userId,
  name,
  firstName,
  status: initial,
}: {
  userId: string;
  name: string;
  firstName: string;
  status: FollowStatus;
}) {
  const [status, setStatus] = useState(initial);
  return (
    <>
      <div className="flex justify-center">
        <FollowButton userId={userId} name={name} status={status} onChange={setStatus} size="lg" />
      </div>
      <section className="mt-6 flex flex-col items-center gap-2 rounded-xl bg-surface px-6 py-8 text-center">
        <svg
          viewBox="0 0 24 24"
          width="32"
          height="32"
          aria-hidden
          className="fill-none stroke-muted stroke-2"
        >
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        <h2 className="text-lg font-extrabold">This account is private</h2>
        <p className="text-muted" aria-live="polite">
          {status === "pending"
            ? `Request sent. You’ll see ${firstName}’s concerts, stats and activity once they accept.`
            : `Follow ${firstName} to see their concerts, stats and activity. They’ll need to accept your request.`}
        </p>
      </section>
    </>
  );
}

/** Your pending follow requests, with Accept and Decline. */
export function FollowRequests({
  requests,
  avatars,
}: {
  requests: Person[];
  avatars: Record<string, string>;
}) {
  const [remaining, setRemaining] = useState(requests);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (remaining.length === 0) return null;

  function act(person: Person, accept: boolean) {
    setError(null);
    startTransition(async () => {
      const result = accept ? await acceptRequest(person.id) : await removeFollower(person.id);
      if (result.error) setError(result.error);
      else setRemaining((list) => list.filter((p) => p.id !== person.id));
    });
  }

  return (
    <section aria-labelledby="req-h" className="flex flex-col gap-1">
      <h2 id="req-h" className="flex items-center gap-2 text-lg font-extrabold">
        Follow requests
        <span className="rounded-full bg-accent px-2 text-sm font-bold text-on-accent">
          {remaining.length}
        </span>
      </h2>
      <ul>
        {remaining.map((person) => (
          <li key={person.id} className="flex items-center gap-3 py-2">
            <Link href={`/u/${person.username}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar
                userId={person.id}
                name={person.display_name}
                src={person.avatar_url ? avatars[person.avatar_url] : null}
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-bold">{person.display_name}</span>
                <span className="truncate text-sm text-muted">@{person.username}</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => act(person, true)}
              disabled={pending}
              className="h-9 rounded-full bg-accent px-4 text-sm font-bold text-on-accent hover:bg-accent-hover disabled:opacity-60"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => act(person, false)}
              disabled={pending}
              aria-label={`Decline ${person.display_name}`}
              className="flex size-9 items-center justify-center rounded-full text-muted hover:bg-surface-raised hover:text-foreground disabled:opacity-60"
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                aria-hidden
                className="fill-none stroke-current stroke-2"
              >
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

/** "Remove" on your own followers list. */
export function RemoveFollowerButton({ userId, name }: { userId: string; name: string }) {
  const [removed, setRemoved] = useState(false);
  const [pending, startTransition] = useTransition();
  if (removed) return <span className="text-sm text-muted">Removed</span>;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await removeFollower(userId);
          if (!result.error) setRemoved(true);
        })
      }
      aria-label={`Remove ${name} from your followers`}
      className="h-9 rounded-full border border-surface-raised px-4 text-sm font-bold hover:border-danger hover:text-danger disabled:opacity-60"
    >
      Remove
    </button>
  );
}
