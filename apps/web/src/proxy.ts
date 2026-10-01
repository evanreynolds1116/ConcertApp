import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "./lib/supabase/env";

// Signed-out visitors see nothing but sign-in and sign-up (docs/spec.md, "Following").
const SIGNED_OUT_PATHS = ["/sign-in", "/sign-up"];

/**
 * Refreshes the Supabase session cookie on every navigation and redirects between the
 * signed-in and signed-out areas. This is a convenience, not the security boundary: pages
 * check the viewer again, and RLS in the database decides what anyone can read.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet)
          response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;
  const onSignedOutPage = SIGNED_OUT_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!signedIn && !onSignedOutPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return withCookies(NextResponse.redirect(url), response);
  }
  if (signedIn && onSignedOutPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return withCookies(NextResponse.redirect(url), response);
  }
  return response;
}

// Keep any refreshed session cookies when redirecting.
function withCookies(redirect: NextResponse, from: NextResponse) {
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  // Skip Next internals (static files, images, the dev hot-reload socket) and plain assets.
  matcher: ["/((?!_next/|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
