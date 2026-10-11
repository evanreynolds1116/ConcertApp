import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { cookieOptions, supabasePublishableKey, supabaseUrl } from "./lib/supabase/env";

// Signed-out visitors see nothing but sign-in and sign-up (docs/spec.md, "Following").
const SIGNED_OUT_PATHS = ["/sign-in", "/sign-up"];
// Route handlers that work signed in or out (email confirmation, clearing a stale session).
const EITHER_PATHS = ["/auth/"];

const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy (SECURITY_AUDIT.md, M4). Scripts need this request's nonce, which
 * Next.js adds to its own scripts. Styles allow inline attributes (chart bar heights, leaderboard
 * widths). Images and API calls may also go to Supabase (avatars, auth, data, setlist-search).
 * Nobody may frame the app. Development also allows eval, which React's dev tools use.
 */
function contentSecurityPolicy(nonce: string): string {
  const supabase = new URL(supabaseUrl).origin;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${supabase}`,
    "font-src 'self'",
    `connect-src 'self' ${supabase}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * Refreshes the Supabase session cookie on every navigation and redirects between the
 * signed-in and signed-out areas. This is a convenience, not the security boundary: pages
 * check the viewer again, and RLS in the database decides what anyone can read.
 */
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  // Pass the nonce and CSP to rendering (Next.js reads them from the request headers). Built
  // fresh each time so refreshed session cookies on the request are included.
  const next = () => {
    const headers = new Headers(request.headers);
    headers.set("x-nonce", nonce);
    headers.set("Content-Security-Policy", csp);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };
  let response = next();

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = next();
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
  if (EITHER_PATHS.some((p) => pathname.startsWith(p))) return response;

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
