import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it.each([
    ["/", "/"],
    ["/stats", "/stats"],
    ["/u/pat?year=2024#top", "/u/pat?year=2024#top"],
    ["/concerts/abc/../stats", "/concerts/stats"],
    ["/%09/evil.com", "/%09/evil.com"], // still encoded: a path on this site
  ])("keeps the same-site path %j", (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
  });

  it.each([
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com", // browsers drop the tab: "//evil.com"
    "/\n/evil.com",
    "/\r/evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "evil.com",
    "",
  ])("refuses %j", (next) => {
    expect(safeNextPath(next)).toBe("/");
  });

  it("refuses anything that isn't a string", () => {
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(["/stats"])).toBe("/");
  });
});
