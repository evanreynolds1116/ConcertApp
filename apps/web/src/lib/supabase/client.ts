"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@musicjunkie/shared";
import { supabasePublishableKey, supabaseUrl } from "./env";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Supabase client for Client Components, using the signed-in user's session cookies. */
export function getBrowserClient() {
  client ??= createBrowserClient<Database>(supabaseUrl, supabasePublishableKey);
  return client;
}
