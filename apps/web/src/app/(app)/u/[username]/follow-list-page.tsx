import Link from "next/link";
import { redirect } from "next/navigation";
import { PersonRow } from "@/components/social/person-row";
import { fetchFollowList, signAvatars } from "@/lib/social";
import { loadProfile } from "./load";
import { RemoveFollowerButton } from "./profile-client";

/** Followers or following of a user. Your own followers each get a Remove button. */
export async function FollowListPage({
  username,
  kind,
}: {
  username: string;
  kind: "followers" | "following";
}) {
  const { supabase, person, profile: viewer } = await loadProfile(username);
  // Lists follow can_view on their owner: a private profile you don't follow shows the locked view.
  if (!person.can_view) redirect(`/u/${person.username}`);
  const people = await fetchFollowList(supabase, person.id, kind);
  const avatars = await signAvatars(
    supabase,
    people.map((p) => p.avatar_url),
  );
  const title = kind === "followers" ? "Followers" : "Following";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link
        href={`/u/${person.username}`}
        className="-mb-2 flex min-h-11 items-center gap-0.5 font-semibold"
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
        {person.display_name}
      </Link>
      <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
      {people.length === 0 ? (
        <p className="py-6 text-center text-muted">
          {kind === "followers" ? "No followers yet." : "Not following anyone yet."}
        </p>
      ) : (
        <ul>
          {people.map((p) => (
            <li key={p.id}>
              <PersonRow
                person={p}
                avatarSrc={p.avatar_url ? avatars.get(p.avatar_url) : null}
                // No follow button on your own row when you're on someone's list.
                showFollow={p.id !== viewer.id}
                actions={
                  person.is_self && kind === "followers" ? (
                    <RemoveFollowerButton userId={p.id} name={p.display_name} />
                  ) : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
