import type { Metadata } from "next";
import { PersonRow } from "@/components/social/person-row";
import { requireViewer } from "@/lib/auth";
import { searchPeople, signAvatars } from "@/lib/social";
import { PeopleSearch } from "./people-search";

export const metadata: Metadata = { title: "People · Music Junkie" };

export default async function PeoplePage({ searchParams }: PageProps<"/people">) {
  const { supabase } = await requireViewer();
  const q = (await searchParams).q;
  const query = (typeof q === "string" ? q : "").trim().slice(0, 50);
  const people = query.length >= 2 ? await searchPeople(supabase, query) : [];
  const avatars = await signAvatars(
    supabase,
    people.map((p) => p.avatar_url),
  );

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <h1 className="text-3xl font-extrabold tracking-tight">People</h1>
      <PeopleSearch initialQuery={query} />
      <section aria-live="polite">
        {query.length < 2 ? (
          <p className="py-6 text-center text-muted">
            Search by username or name to find people to follow.
          </p>
        ) : people.length === 0 ? (
          <p className="py-6 text-center text-muted">Nobody matches “{query}”.</p>
        ) : (
          <>
            <h2 className="text-xs font-bold tracking-widest text-muted uppercase">
              {people.length} {people.length === 1 ? "person" : "people"}
            </h2>
            <ul>
              {people.map((person) => (
                <li key={person.id}>
                  <PersonRow
                    person={person}
                    avatarSrc={person.avatar_url ? avatars.get(person.avatar_url) : null}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <p className="text-sm text-subtle">
        Public accounts are followed right away. Private accounts get a request they must accept.
      </p>
    </div>
  );
}
