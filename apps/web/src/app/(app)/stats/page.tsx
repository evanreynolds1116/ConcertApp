import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth";
import { StatsView } from "./stats-view";

export const metadata: Metadata = { title: "Stats · Music Junkie" };

export default async function StatsPage() {
  const { supabase, profile } = await requireViewer();
  return <StatsView supabase={supabase} userId={profile.id} heading="Your stats" own logPath="/" />;
}
