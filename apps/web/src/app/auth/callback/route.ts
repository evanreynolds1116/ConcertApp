import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Where the sign-up confirmation email lands. Supabase verifies the link and sends the visitor
 * here with a one-time code, which is exchanged for a session (the PKCE verifier is the cookie
 * the browser set when signing up).
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.redirect(new URL("/sign-in?confirm=failed", request.url));
}
