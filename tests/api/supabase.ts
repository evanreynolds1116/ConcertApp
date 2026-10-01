import { execSync } from "node:child_process";
import { join } from "node:path";
import type { Database } from "@musicjunkie/shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/** Local Supabase URL and publishable key: from the root .env if set, else `supabase status`. */
function connection(): { url: string; key: string } {
  try {
    process.loadEnvFile(join(REPO_ROOT, ".env"));
  } catch {
    // No .env; fall back to the running local stack below.
  }
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (url && key) return { url, key };

  // The CLI mixes notices into its output, so cut out the JSON object.
  const out = execSync("pnpm exec supabase status -o json", {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const status = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1)) as Record<
    string,
    string
  >;
  if (!status.API_URL || !status.PUBLISHABLE_KEY) {
    throw new Error("Local Supabase isn't running. Start it with `pnpm db:start`.");
  }
  return { url: status.API_URL, key: status.PUBLISHABLE_KEY };
}

const { url, key } = connection();

export type Client = SupabaseClient<Database>;

/** A fresh, signed-out client using the publishable key, like a browser would. */
export function anonClient(): Client {
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Seed users from supabase/seed.sql (local development credentials).
export const SEED = {
  pat: { id: "00000000-0000-4000-a000-000000000001", email: "pat@example.com" },
  priya: { id: "00000000-0000-4000-a000-000000000002", email: "priya@example.com" },
  fran: { id: "00000000-0000-4000-a000-000000000003", email: "fran@example.com" },
} as const;
const SEED_PASSWORD = "musicjunkie-dev";

/** A client signed in as a seed user with a real email/password sign-in. */
export async function signedInAs(user: keyof typeof SEED): Promise<Client> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({
    email: SEED[user].email,
    password: SEED_PASSWORD,
  });
  if (error)
    throw new Error(`Sign-in as ${user} failed: ${error.message}. Did you run \`pnpm db:reset\`?`);
  return client;
}
