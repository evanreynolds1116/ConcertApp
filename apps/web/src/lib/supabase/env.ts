// Public Supabase settings for the web app (apps/web/.env.local; see .env.example).
// The publishable key is safe in the browser: RLS decides what each user can read.

function required(name: string, value: string | undefined): string {
  if (!value)
    throw new Error(`${name} is not set. Copy apps/web/.env.example to apps/web/.env.local.`);
  return value;
}

export const supabaseUrl = required(
  "NEXT_PUBLIC_SUPABASE_URL",
  process.env.NEXT_PUBLIC_SUPABASE_URL,
);
export const supabasePublishableKey = required(
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);
