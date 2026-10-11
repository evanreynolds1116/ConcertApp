const BASE = "http://music-junkie.invalid";

/**
 * Only allow same-site paths as a post-sign-in destination (no open redirects). The path is
 * resolved the way a browser would: browsers drop tabs and newlines from URLs, so "/\t/x.com"
 * would otherwise become "//x.com", another site. Anything that resolves off-site, or holds a
 * control character or backslash, falls back to "/".
 */
export function safeNextPath(next: unknown): string {
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  if (typeof next !== "string" || !next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) {
    return "/";
  }
  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return "/";
  }
  if (url.origin !== BASE) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
