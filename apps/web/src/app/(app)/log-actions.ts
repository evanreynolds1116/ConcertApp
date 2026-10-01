"use server";

import { parseLogFilters } from "@musicjunkie/shared";
import { requireViewer } from "@/lib/auth";
import { fetchLogPage, type LogPage } from "@/lib/concerts";

/** "Load more" on the log: the next page for the same filters (passed as the URL query). */
export async function loadMoreLogs(query: string, offset: number): Promise<LogPage> {
  const { supabase, profile } = await requireViewer();
  const safeOffset = Number.isInteger(offset) && offset > 0 ? offset : 0;
  return fetchLogPage(
    supabase,
    profile.id,
    parseLogFilters(new URLSearchParams(query)),
    safeOffset,
  );
}
