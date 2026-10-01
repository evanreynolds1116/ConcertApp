import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@musicjunkie/shared";
import { cookies } from "next/headers";
import { supabasePublishableKey, supabaseUrl } from "./env";

/** Supabase client for Server Components and Server Actions, acting as the signed-in user. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet)
            cookieStore.set(name, value, options);
        } catch {
          // Server Components can't set cookies. The proxy refreshes the session instead.
        }
      },
    },
  });
}
