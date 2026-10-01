import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StatsView } from "../../../stats/stats-view";
import { firstName, loadProfile } from "../load";

export async function generateMetadata({
  params,
}: PageProps<"/u/[username]/stats">): Promise<Metadata> {
  const { person } = await loadProfile((await params).username);
  return { title: `${person.display_name}’s stats · Music Junkie` };
}

export default async function UserStatsPage({ params }: PageProps<"/u/[username]/stats">) {
  const { supabase, person } = await loadProfile((await params).username);
  if (person.is_self) redirect("/stats");
  // A private profile you don't follow shows the locked view instead.
  if (!person.can_view) redirect(`/u/${person.username}`);
  return (
    <div className="flex flex-col gap-2">
      <Link
        href={`/u/${person.username}`}
        className="mx-auto -mb-2 flex min-h-11 w-full max-w-xl items-center gap-0.5 font-semibold"
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
      <StatsView
        supabase={supabase}
        userId={person.id}
        heading={`${firstName(person.display_name)}’s stats`}
        own={false}
        logPath={`/u/${person.username}`}
      />
    </div>
  );
}
