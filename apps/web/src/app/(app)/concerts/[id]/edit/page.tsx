import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadConcert } from "../load";
import { EditConcert } from "./edit-concert";

export const metadata: Metadata = { title: "Edit concert · Music Junkie" };

export default async function EditConcertPage({ params }: PageProps<"/concerts/[id]/edit">) {
  const concert = await loadConcert((await params).id);
  // Only the owner can edit; anyone else gets the same "not found" as a missing log.
  if (!concert?.isOwner) notFound();
  const { log, show, venue, lineup } = concert;
  return (
    <div className="mx-auto w-full max-w-xl">
      <EditConcert
        logId={log.id}
        show={{
          date: show.date,
          festivalName: show.festival_name,
          festivalDayLabel: show.festival_day_label,
          venueName: venue.name,
          city: venue.city,
          state: venue.state,
        }}
        lineup={lineup}
        log={log}
      />
    </div>
  );
}
