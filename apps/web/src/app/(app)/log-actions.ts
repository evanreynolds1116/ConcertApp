"use server";

import { parseLogFilters } from "@musicjunkie/shared";
import { requireViewer } from "@/lib/auth";
import { fetchLogPage, type LogPage } from "@/lib/concerts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "Load more" on a log (yours or someone else's): the next page for the same filters (passed
 * as the URL query). RLS decides visibility, so a private log stays empty to non-followers.
 */
export async function loadMoreLogs(
  userId: string,
  query: string,
  offset: number,
): Promise<LogPage> {
  const { supabase } = await requireViewer();
  if (!UUID.test(userId)) return { entries: [], total: 0 };
  const safeOffset = Number.isInteger(offset) && offset > 0 ? offset : 0;
  return fetchLogPage(supabase, userId, parseLogFilters(new URLSearchParams(query)), safeOffset);
}
