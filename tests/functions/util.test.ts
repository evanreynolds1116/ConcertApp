import { describe, expect, it } from "vitest";
import {
  buildLineup,
  songCount,
  toApiDate,
  toIsoDate,
  toUsVenue,
  usToday,
} from "../../supabase/functions/_shared/setlistfm/util.ts";
import { setlist } from "./fixtures.ts";

describe("dates", () => {
  it("converts between setlist.fm dd-MM-yyyy and ISO", () => {
    expect(toIsoDate("16-06-2024")).toBe("2024-06-16");
    expect(toApiDate("2024-06-16")).toBe("16-06-2024");
    expect(toIsoDate("2024-06-16")).toBeNull();
    expect(toIsoDate("")).toBeNull();
  });

  it("uses the latest US time zone for 'today'", () => {
    // 05:00 UTC on Oct 1 is still Sep 30 in Hawaii.
    expect(usToday(Date.parse("2026-10-01T05:00:00Z"))).toBe("2026-09-30");
  });
});

describe("toUsVenue", () => {
  it("maps a US venue", () => {
    const v = toUsVenue(
      setlist({ artist: "A", date: "2024-01-01", venueId: "abc", venue: "The Basement East" })
        .venue,
    );
    expect(v).toEqual({
      setlistfmId: "abc",
      name: "The Basement East",
      city: "Nashville",
      state: "TN",
      url: "https://www.setlist.fm/venue/abc.html",
    });
  });

  it("rejects venues we can't store", () => {
    expect(
      toUsVenue(setlist({ artist: "A", date: "2024-01-01", country: "CA", state: "ON" }).venue),
    ).toBeNull();
    expect(toUsVenue(setlist({ artist: "A", date: "2024-01-01", state: "06" }).venue)).toBeNull();
    expect(toUsVenue({ id: "x", name: "No City" })).toBeNull();
  });
});

describe("songCount", () => {
  it("doesn't count taped intros", () => {
    expect(songCount(setlist({ artist: "A", date: "2024-01-01", songs: 25, tapes: 2 }))).toBe(25);
  });
});

describe("buildLineup", () => {
  const show = [
    setlist({ artist: "Sloppy Jane", date: "2023-10-31", songs: 5 }),
    setlist({ artist: "boygenius", date: "2023-10-31", songs: 25 }),
    setlist({ artist: "100 gecs", date: "2023-10-31", songs: 12 }),
  ];

  it("orders by song count, most first", () => {
    expect(buildLineup(show).map((a) => a.name)).toEqual(["boygenius", "100 gecs", "Sloppy Jane"]);
  });

  it("puts the searched artist first", () => {
    expect(buildLineup(show, "mbid-Sloppy Jane").map((a) => a.name)).toEqual([
      "Sloppy Jane",
      "boygenius",
      "100 gecs",
    ]);
  });

  it("breaks ties (including all the 0-song setlists) alphabetically", () => {
    const lineup = buildLineup([
      setlist({ artist: "Veggi", date: "2024-06-16" }),
      setlist({ artist: "TSHA", date: "2024-06-16" }),
      setlist({ artist: "Megan Thee Stallion", date: "2024-06-16", songs: 19 }),
      setlist({ artist: "Fred again..", date: "2024-06-16", songs: 19 }),
    ]);
    expect(lineup.map((a) => a.name)).toEqual([
      "Fred again..",
      "Megan Thee Stallion",
      "TSHA",
      "Veggi",
    ]);
  });

  it("lists an artist once when they have two setlists that day (early and late shows)", () => {
    const early = setlist({ artist: "boygenius", date: "2023-11-11", songs: 2 });
    const late = setlist({ artist: "boygenius", date: "2023-11-11", songs: 3 });
    const lineup = buildLineup([early, late]);
    expect(lineup).toHaveLength(1);
    expect(lineup[0]!.songCount).toBe(3);
    expect(lineup[0]!.setlistUrl).toBe(late.url); // the longer set
  });

  it("gives each artist a link to their own setlist at the show", () => {
    const lineup = buildLineup(show);
    expect(lineup.map((a) => a.setlistUrl)).toEqual([show[1]!.url, show[2]!.url, show[0]!.url]);
    expect(lineup[0]!.setlistUrl).toMatch(/^https:\/\/www\.setlist\.fm\/setlist\//);
  });
});
