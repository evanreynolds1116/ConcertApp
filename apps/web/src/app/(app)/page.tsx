import { requireViewer } from "@/lib/auth";

// Placeholder home. The concert log arrives with "Add concert" in Phase 2 and the log in Phase 3.
export default async function HomePage() {
  const { supabase, profile } = await requireViewer();
  const { count } = await supabase
    .from("concert_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id);
  const logged = count ?? 0;

  return (
    <>
      <h1 className="text-3xl font-extrabold">Hi, {profile.display_name}</h1>
      <div className="mt-6 rounded-xl border border-border bg-surface p-6">
        <p className="font-semibold">
          {logged === 0
            ? "No concerts logged yet"
            : `${logged} ${logged === 1 ? "concert" : "concerts"} logged`}
        </p>
        <p className="mt-1 text-muted">Your full concert log will show up here.</p>
      </div>
    </>
  );
}
