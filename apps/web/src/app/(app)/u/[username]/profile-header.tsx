import Link from "next/link";
import { Avatar } from "@/components/social/avatar";
import type { ProfileOverview } from "@/lib/social";

/** Avatar, names, privacy badge and (when visible) the Concerts / Followers / Following counts. */
export function ProfileHeader({
  person,
  avatarSrc,
}: {
  person: ProfileOverview;
  avatarSrc: string | null;
}) {
  const base = `/u/${person.username}`;
  return (
    <>
      <section className="flex flex-col items-center gap-2 text-center">
        <Avatar userId={person.id} name={person.display_name} src={avatarSrc} size={88} />
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{person.display_name}</h1>
        <p className="flex flex-wrap items-center justify-center gap-2 text-muted">
          <span>@{person.username}</span>
          {person.is_private && (
            <span className="flex items-center gap-1 rounded-full bg-surface px-2 text-xs font-bold">
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                aria-hidden
                className="fill-none stroke-current stroke-2"
              >
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              Private
            </span>
          )}
          {person.follows_viewer && !person.is_self && (
            <span className="rounded-full bg-surface px-2 text-xs font-bold">Follows you</span>
          )}
        </p>
      </section>
      {person.can_view && (
        <section aria-label="Counts" className="grid grid-cols-3 gap-2 text-center">
          {(
            [
              ["Concerts", person.concerts, person.is_self ? "/" : base],
              ["Followers", person.followers, `${base}/followers`],
              ["Following", person.following, `${base}/following`],
            ] as const
          ).map(([label, count, href]) => (
            <Link
              key={label}
              href={href}
              className="flex flex-col rounded-xl bg-surface py-3 hover:bg-surface-raised"
            >
              <span className="text-2xl font-extrabold">{count ?? 0}</span>
              <span className="text-sm font-semibold text-muted">{label}</span>
            </Link>
          ))}
        </section>
      )}
    </>
  );
}
