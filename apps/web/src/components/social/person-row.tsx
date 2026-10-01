import Link from "next/link";
import type { Person } from "@/lib/social";
import { Avatar } from "./avatar";
import { FollowButton } from "./follow-button";

type PersonRowProps = {
  person: Person;
  avatarSrc?: string | null;
  /** Hide the follow button (e.g. on your own row). */
  showFollow?: boolean;
  /** Extra controls on the right, e.g. "Remove" on your followers list. */
  actions?: React.ReactNode;
};

/** A person in a list: avatar, name, @username (with a lock for private accounts), follow button. */
export function PersonRow({ person, avatarSrc, showFollow = true, actions }: PersonRowProps) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Link
        href={`/u/${person.username}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl hover:opacity-90"
      >
        <Avatar userId={person.id} name={person.display_name} src={avatarSrc} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-bold">{person.display_name}</span>
          <span className="flex items-center gap-1 truncate text-sm text-muted">
            @{person.username}
            {person.is_private && (
              <>
                <svg
                  viewBox="0 0 24 24"
                  width="13"
                  height="13"
                  aria-hidden
                  className="shrink-0 fill-none stroke-current stroke-2"
                >
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>
                <span className="sr-only">(private account)</span>
              </>
            )}
          </span>
        </span>
      </Link>
      {actions}
      {showFollow && person.follow_status && (
        <FollowButton userId={person.id} name={person.display_name} status={person.follow_status} />
      )}
    </div>
  );
}
