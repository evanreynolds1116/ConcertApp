import { requireViewer } from "@/lib/auth";
import { loadLogView } from "@/lib/log-page";
import { LogView } from "./log-view";

// The log (home): the viewer's concerts, newest show first, with search and filters in the URL.
export default async function LogPage({ searchParams }: PageProps<"/">) {
  const { supabase, profile } = await requireViewer();
  const props = await loadLogView(supabase, profile.id, await searchParams);
  return <LogView {...props} basePath="/" heading="Your concerts" ownLog />;
}
