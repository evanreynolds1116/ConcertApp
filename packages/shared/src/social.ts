import { z } from "zod";
import { displayNameSchema, usernameSchema } from "./schemas";

/** "Sam Carter" -> "SC", "pat_public" -> "PP". For avatar placeholders. */
export function initials(name: string): string {
  const words = name
    .replace(/[_.-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

// Muted tones for initials avatars (from the mockups), picked by user id so a person keeps
// their color everywhere.
export const AVATAR_TONES = [
  "#3e6b85",
  "#7a5c3e",
  "#5a4a8a",
  "#4a7a5a",
  "#8a4a5a",
  "#4a6a8a",
] as const;

export function avatarTone(userId: string): string {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length]!;
}

/**
 * Feed timestamps: "now", "5m", "2h", "3d", then "Sep 20" (with the year if it isn't this
 * year). `now` is passed in so server and client render the same text.
 */
export function timeAgo(iso: string, now: Date): string {
  const then = new Date(iso);
  const seconds = Math.max(0, (now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 7 * 86400) return `${Math.floor(seconds / 86400)}d`;
  const sameYear = then.getUTCFullYear() === now.getUTCFullYear();
  return then.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}

/** Items per feed page (the feed function caps at 50). */
export const FEED_PAGE_SIZE = 20;

/** Settings: editing your username and display name. */
export const profileSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
});
export type ProfileInput = z.infer<typeof profileSchema>;
