// setlist-search: the only code that talks to setlist.fm. Clients send their Supabase session;
// the setlist.fm API key never leaves this function. Logic lives in ../_shared/setlistfm.
//
//   POST { action: "search", mode: "concert" | "festival", query, year?, month?, state?, page? }
//   POST { action: "lineup", target, date, searchedArtistMbid? }
//
// Contract: packages/shared/src/setlist-search.ts.

import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { SetlistFmClient, SetlistFmError } from "../_shared/setlistfm/api.ts";
import { BadRequest, handle, parseRequest } from "../_shared/setlistfm/search.ts";
import { createSigner, type Signer } from "../_shared/setlistfm/signing.ts";

// Auth is a bearer token, not cookies, so a wildcard origin doesn't expose sessions.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Searches a user may have running at once in this worker; more waits on setlist.fm's pacing.
const MAX_IN_FLIGHT_PER_USER = 2;
const SIGNING_KEY_TTL_MS = 5 * 60 * 1000;

const apiKey = Deno.env.get("SETLISTFM_API_KEY");
// One client per worker, so request pacing and the short page cache are shared.
const setlistfm = apiKey ? new SetlistFmClient({ apiKey }) : null;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// Service role: reads the signing key and counts each user's searches (both service-role-only
// database functions). Never sent anywhere.
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const admin = serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

let signer: { sign: Signer; at: number } | null = null;
const inFlight = new Map<string, number>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** The database's signing key, cached briefly (a local db:reset makes a new one). */
async function getSigner(): Promise<Signer> {
  if (signer && Date.now() - signer.at < SIGNING_KEY_TTL_MS) return signer.sign;
  const { data, error } = await admin!.rpc("lineup_signing_key");
  if (error || typeof data !== "string") throw new Error("signing key unavailable");
  signer = { sign: await createSigner(data), at: Date.now() };
  return signer.sign;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);

  // Signed-in users only. Verified here rather than with verify_jwt, so it works with
  // Supabase's new signing keys too.
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await supabase.auth.getClaims(token) : { data: null };
  const userId = auth?.claims?.sub;
  if (!userId) return json({ error: "Sign in to search setlist.fm" }, 401);

  if (!setlistfm || !admin) {
    console.error("SETLISTFM_API_KEY or SUPABASE_SERVICE_ROLE_KEY is not set");
    return json({ error: "Search is not available right now" }, 503);
  }

  // Per-user limits (SECURITY_AUDIT.md, M3): requests per minute and per day in the database,
  // and searches running at once in this worker.
  const running = inFlight.get(userId) ?? 0;
  if (running >= MAX_IN_FLIGHT_PER_USER) {
    return json({ error: "Too many searches at once. Try again in a moment." }, 429);
  }
  const { data: allowed, error: quotaError } = await admin.rpc("consume_search_quota", {
    p_user_id: userId,
  });
  if (quotaError) {
    console.error("search quota check failed", quotaError.code);
    return json({ error: "Search is not available right now" }, 503);
  }
  if (allowed !== true) {
    return json({ error: "Too many searches. Try again in a minute." }, 429);
  }

  inFlight.set(userId, running + 1);
  try {
    const body = await req.json().catch(() => {
      throw new BadRequest("Expected a JSON body");
    });
    const request = parseRequest(body, Date.now());
    const sign = await getSigner();
    return json(await handle({ client: setlistfm, now: Date.now(), sign }, request));
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
    console.error("setlist-search failed", err instanceof Error ? err.message : "unknown error");
    return json({ error: "Something went wrong" }, 500);
  } finally {
    const left = (inFlight.get(userId) ?? 1) - 1;
    if (left > 0) inFlight.set(userId, left);
    else inFlight.delete(userId);
  }
});
