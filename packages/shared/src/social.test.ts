import { describe, expect, it } from "vitest";
import { AVATAR_TONES, avatarTone, initials, profileSchema, timeAgo } from "./social";

describe("initials", () => {
  it.each([
    ["Sam Carter", "SC"],
    ["Pat Public", "PP"],
    ["pat_public", "PP"],
    ["Cher", "C"],
    ["  ", ""],
  ])("%j -> %j", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });
});

describe("avatarTone", () => {
  it("is stable per user and from the palette", () => {
    const id = "00000000-0000-4000-a000-000000000001";
    expect(avatarTone(id)).toBe(avatarTone(id));
    expect(AVATAR_TONES).toContain(avatarTone(id));
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  it.each([
    ["2026-10-01T11:59:30Z", "now"],
    ["2026-10-01T11:55:00Z", "5m"],
    ["2026-10-01T10:00:00Z", "2h"],
    ["2026-09-28T12:00:00Z", "3d"],
    ["2026-09-20T12:00:00Z", "Sep 20"],
    ["2025-12-24T12:00:00Z", "Dec 24, 2025"],
    ["2026-10-01T12:00:05Z", "now"], // a slightly fast server clock isn't "in the future"
  ])("%s -> %s", (iso, expected) => {
    expect(timeAgo(iso, now)).toBe(expected);
  });
});

describe("profileSchema", () => {
  it("reuses the sign-up rules", () => {
    expect(profileSchema.safeParse({ username: "pat_public", displayName: "Pat" }).success).toBe(
      true,
    );
    expect(profileSchema.safeParse({ username: "no", displayName: "" }).success).toBe(false);
  });
});
