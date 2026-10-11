import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Clears a session whose account no longer exists (deleted account, or a local `db:reset`).
 * Its token is still validly signed, so without this the proxy would treat the visitor as
 * signed in while every page finds no profile: a redirect loop. Pages can't clear cookies,
 * so they send the visitor here. A session with a profile is left alone, so a link or image
 * on another site can't sign people out (SECURITY_AUDIT.md, L5).
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (profile) return NextResponse.redirect(new URL("/", request.url));
  }
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/sign-in", request.url));
}
