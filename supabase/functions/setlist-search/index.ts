// setlist-search: the only code that talks to setlist.fm. Clients send their Supabase session;
// the setlist.fm API key never leaves this function. Logic lives in ../_shared/setlistfm.
//
//   POST { action: "search", mode: "concert" | "festival", query, year?, month?, state?, page? }
//   POST { action: "lineup", target, date, searchedArtistMbid? }
//
// Contract: packages/shared/src/setlist-search.ts.

import { createClient } from "npm:@supabase/supabase-js@2";
import { SetlistFmClient, SetlistFmError } from "../_shared/setlistfm/api.ts";
import { BadRequest, handle, parseRequest } from "../_shared/setlistfm/search.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const apiKey = Deno.env.get("SETLISTFM_API_KEY");
// One client per worker, so request pacing and the short page cache are shared.
const setlistfm = apiKey ? new SetlistFmClient({ apiKey }) : null;
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  // Signed-in users only. Verified here rather than with verify_jwt, so it works with
  // Supabase's new signing keys too.
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await supabase.auth.getClaims(token) : { data: null };
  if (!auth?.claims?.sub) return json({ error: "Sign in to search setlist.fm" }, 401);

  if (!setlistfm) {
    console.error("SETLISTFM_API_KEY is not set");
    return json({ error: "Search is not available right now" }, 503);
  }

  try {
    const body = await req.json().catch(() => {
      throw new BadRequest("Expected a JSON body");
    });
    const request = parseRequest(body, Date.now());
    return json(await handle({ client: setlistfm, now: Date.now() }, request));
  } catch (err) {
    if (err instanceof BadRequest) return json({ error: err.message }, 400);
    if (err instanceof SetlistFmError) {
      console.error(`setlist.fm error: ${err.status}`);
      const busy = err.status === 429;
      return json(
        {
          error: busy
            ? "setlist.fm is busy. Try again in a moment."
            : "setlist.fm isn't responding.",
        },
        busy ? 503 : 502,
      );
    }
    console.error("setlist-search failed", err);
    return json({ error: "Something went wrong" }, 500);
  }
});
