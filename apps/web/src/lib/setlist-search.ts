"use client";

import type {
  LineupRequest,
  LineupResponse,
  SearchRequest,
  SearchResponse,
} from "@musicjunkie/shared";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { getBrowserClient } from "./supabase/client";

/** Calls the setlist-search Edge Function. Throws an Error with a user-facing message. */
async function call<T>(body: SearchRequest | LineupRequest): Promise<T> {
  const { data, error } = await getBrowserClient().functions.invoke<T>("setlist-search", { body });
  if (error) {
    let message = "Couldn't reach setlist.fm. Check your connection and try again.";
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => null)) as { error?: string } | null;
      if (payload?.error) message = payload.error;
    }
    throw new Error(message);
  }
  return data as T;
}

export function searchSetlists(request: Omit<SearchRequest, "action">) {
  return call<SearchResponse>({ action: "search", ...request });
}

export function fetchLineup(request: Omit<LineupRequest, "action">) {
  return call<LineupResponse>({ action: "lineup", ...request });
}
