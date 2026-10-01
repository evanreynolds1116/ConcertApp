import { describe, expect, it } from "vitest";
import type { FestivalDayResult } from "../../supabase/functions/_shared/setlistfm/contract.ts";
import {
  BadRequest,
  getLineup,
  parseRequest,
  searchConcerts,
  searchFestivalDays,
} from "../../supabase/functions/_shared/setlistfm/search.ts";
import { fakeClient, NOW, setlist } from "./fixtures.ts";

const search = (query: string, extra: Record<string, unknown> = {}) =>
  ({ action: "search", mode: "concert", query, ...extra }) as const;

describe("parseRequest", () => {
  it("accepts a search and normalizes the state", () => {
    expect(
      parseRequest(
        { action: "search", mode: "festival", query: " bonnaroo ", year: 2024, state: "tn" },
        NOW,
      ),
    ).toEqual({
      action: "search",
      mode: "festival",
      query: "bonnaroo",
      year: 2024,
      month: undefined,
      state: "TN",
      page: undefined,
    });
  });

  it.each([
    [{ action: "search", mode: "concert", query: "x" }, "at least 2"],
    [{ action: "search", mode: "concert", query: "phoebe", month: 6 }, "month needs a year"],
    [{ action: "search", mode: "concert", query: "phoebe", year: 2027 }, "year"],
    [{ action: "search", mode: "concert", query: "phoebe", year: 1959 }, "year"],
    [{ action: "search", mode: "concert", query: "phoebe", state: "ON" }, "state"],
    [{ action: "search", mode: "other", query: "phoebe" }, "mode"],
    [{ action: "lineup", target: { kind: "venue", venueId: "v1" }, date: "16-06-2024" }, "date"],
    [{ action: "lineup", target: { kind: "nope" }, date: "2024-06-16" }, "target"],
    [{ action: "delete" }, "action"],
    [null, "JSON object"],
  ])("rejects %j", (body, message) => {
    expect(() => parseRequest(body, NOW)).toThrow(BadRequest);
    expect(() => parseRequest(body, NOW)).toThrow(message);
  });
});

describe("searchConcerts", () => {
  const data = [
    setlist({
      artist: "Phoebe Bridgers",
      venueId: "ryman",
      venue: "Ryman Auditorium",
      date: "2026-09-20",
      songs: 18,
    }),
    setlist({
      artist: "Phoebe Bridgers",
      venueId: "ryman",
      venue: "Ryman Auditorium",
      date: "2026-09-19",
      songs: 18,
    }),
    setlist({
      artist: "Phoebe Bridgers",
      venueId: "salt",
      venue: "The Salt Shed",
      city: "Chicago",
      state: "IL",
      date: "2026-09-12",
    }),
    setlist({
      artist: "Phoebe Bridgers",
      venueId: "future",
      venue: "Red Rocks",
      city: "Morrison",
      state: "CO",
      date: "2026-10-15",
    }),
    setlist({
      artist: "Phoebe Bridgers",
      venueId: "tor",
      venue: "Massey Hall",
      city: "Toronto",
      state: "ON",
      country: "CA",
      date: "2026-08-01",
    }),
    setlist({
      artist: "MUNA",
      venueId: "ryman",
      venue: "Ryman Auditorium",
      date: "2026-09-20",
      songs: 9,
    }),
  ];

  it("finds an artist's past US shows, one result per show, newest first", async () => {
    const { client } = fakeClient(data);
    const r = await searchConcerts({ client, now: NOW }, search("phoebe"));
    expect(
      r.results.map((x) => `${x.date} ${x.venue.name}, ${x.venue.city}, ${x.venue.state}`),
    ).toEqual([
      "2026-09-20 Ryman Auditorium, Nashville, TN",
      "2026-09-19 Ryman Auditorium, Nashville, TN",
      "2026-09-12 The Salt Shed, Chicago, IL",
    ]); // no upcoming Red Rocks show, no Toronto show
    expect(r.results[0]).toMatchObject({
      title: "Phoebe Bridgers",
      artistMbid: "mbid-Phoebe Bridgers",
      target: { kind: "venue", venueId: "ryman" },
    });
    expect(r.nextPage).toBeNull();
  });

  it("falls back to a venue search when no artist matches", async () => {
    const { client, queries } = fakeClient(data);
    const r = await searchConcerts({ client, now: NOW }, search("ryman"));
    expect(queries[0]).toMatchObject({ artistName: "ryman" });
    expect(queries[1]).toMatchObject({ venueName: "ryman" });
    // One result per show; led by the longest set; no searched artist to put first.
    expect(r.results.map((x) => [x.date, x.title, x.artistMbid])).toEqual([
      ["2026-09-20", "Phoebe Bridgers", null],
      ["2026-09-19", "Phoebe Bridgers", null],
    ]);
  });

  it("filters to a month by paging through the year, newest first", async () => {
    const many = Array.from({ length: 45 }, (_, i) =>
      setlist({
        artist: "Phish",
        venueId: `v${i}`,
        venue: `Venue ${i}`,
        date: `2025-${String(12 - Math.floor(i / 4)).padStart(2, "0")}-${String((i % 4) + 1).padStart(2, "0")}`,
      }),
    );
    const { client, queries } = fakeClient(many);
    const r = await searchConcerts({ client, now: NOW }, search("phish", { year: 2025, month: 6 }));
    expect(r.results.every((x) => x.date.startsWith("2025-06"))).toBe(true);
    expect(r.results).toHaveLength(4);
    // Page 1 (Dec-Aug) and 2 (Jul-Mar): stopped once results were older than June.
    expect(queries.filter((q) => q.artistName === "phish" && q.p! > 1).map((q) => q.p)).toEqual([
      2,
    ]);
    expect(r.nextPage).toBeNull();
  });

  it("offers a next page when setlist.fm has more", async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      setlist({
        artist: "Phish",
        venueId: `v${i}`,
        date: `2024-01-${String(i + 1).padStart(2, "0")}`,
      }),
    );
    const { client } = fakeClient(many);
    const first = await searchConcerts({ client, now: NOW }, search("phish"));
    expect(first.results).toHaveLength(20);
    expect(first.nextPage).toBe(2);
    const second = await searchConcerts({ client, now: NOW }, search("phish", { page: 2 }));
    expect(second.results).toHaveLength(5);
    expect(second.nextPage).toBeNull();
  });
});

describe("searchFestivalDays", () => {
  const atBonnaroo = (date: string, artists: number, prefix = date) =>
    Array.from({ length: artists }, (_, i) =>
      setlist({
        artist: `${prefix} act ${i}`,
        venueId: "2bd6181e",
        venue: "Great Stage Park",
        city: "Manchester",
        date,
      }),
    );
  const bonnaroo = [
    ...atBonnaroo("2026-06-12", 2), // this year: only stray setlists so far, not a real edition
    ...atBonnaroo("2024-06-16", 12),
    ...atBonnaroo("2024-06-15", 10),
    // the same artist twice on one day counts once
    setlist({
      artist: "2024-06-15 act 0",
      venueId: "2bd6181e",
      venue: "Great Stage Park",
      city: "Manchester",
      date: "2024-06-15",
    }),
    ...atBonnaroo("2024-06-14", 9),
    ...atBonnaroo("2024-06-12", 2), // a pre-party: far smaller than the festival days
    ...atBonnaroo("2024-05-01", 3), // another event at the grounds, outside the festival month
    ...atBonnaroo("2023-06-17", 10),
  ];

  it("lists the most recent real edition's days, with exact artist counts", async () => {
    const { client } = fakeClient(bonnaroo);
    const r = await searchFestivalDays(
      { client, now: NOW },
      search("Bonnaroo", { mode: "festival" }),
    );
    expect(r.results.map((d) => [d.date, d.festivalName, d.dayLabel, d.artistCount])).toEqual([
      ["2024-06-14", "Bonnaroo", "Day 1", 9],
      ["2024-06-15", "Bonnaroo", "Day 2", 10],
      ["2024-06-16", "Bonnaroo", "Day 3", 12],
    ]);
    expect(r.results[0]!.venue).toMatchObject({
      setlistfmId: "2bd6181e",
      name: "Great Stage Park",
      state: "TN",
    });
    expect(r.incomplete).toBe(false);
  });

  it("shows the requested year even if it's thin", async () => {
    const { client } = fakeClient(bonnaroo);
    const r = await searchFestivalDays(
      { client, now: NOW },
      search("Bonnaroo", { mode: "festival", year: 2026 }),
    );
    expect(r.results.map((d) => [d.date, d.artistCount])).toEqual([["2026-06-12", 2]]);
  });

  it("merges stages filed as separate venues into one day, saved against the grounds", async () => {
    const riot = ["Rise Stage", "Riot Stage", "NOFX World"].map((stage, i) =>
      setlist({
        artist: `Band ${i}`,
        venueId: `s${i}`,
        venue: `${stage} Douglass Park`,
        city: "Chicago",
        state: "IL",
        date: "2024-09-20",
      }),
    );
    const { client, queries } = fakeClient(riot);
    const r = await searchFestivalDays(
      { client, now: NOW },
      search("riot fest", { mode: "festival", year: 2024 }),
    );
    expect(queries[0]).toMatchObject({
      venueName: "Douglass Park",
      cityName: "Chicago",
      stateCode: "IL",
      year: 2024,
    });
    expect(r.results).toHaveLength(1);
    expect(r.results[0]).toMatchObject({
      artistCount: 3,
      dayLabel: "Day 1",
      venue: { setlistfmId: null, name: "Douglass Park", city: "Chicago", state: "IL" },
      target: { kind: "venue-search", venueName: "Douglass Park" },
    });
  });

  it("labels two-weekend festivals by weekend and keeps Stagecoach out of Coachella", async () => {
    const days = ["2025-04-11", "2025-04-12", "2025-04-18", "2025-04-19", "2025-04-26"];
    const data = days.map((date) =>
      setlist({
        artist: `Act ${date}`,
        venueId: "13d39d15",
        venue: "Empire Polo Club",
        city: "Indio",
        state: "CA",
        date,
      }),
    );
    const { client } = fakeClient(data);
    const r = await searchFestivalDays(
      { client, now: NOW },
      search("coachella", { mode: "festival", year: 2025 }),
    );
    expect(r.results.map((d: FestivalDayResult) => `${d.date} ${d.dayLabel}`)).toEqual([
      "2025-04-11 Weekend 1 · Day 1",
      "2025-04-12 Weekend 1 · Day 2",
      "2025-04-18 Weekend 2 · Day 1",
      "2025-04-19 Weekend 2 · Day 2",
    ]);
  });

  it("returns nothing when the state filter excludes a listed festival", async () => {
    const { client, queries } = fakeClient(bonnaroo);
    const r = await searchFestivalDays(
      { client, now: NOW },
      search("bonnaroo", { mode: "festival", state: "CA" }),
    );
    expect(r.results).toEqual([]);
    expect(queries).toEqual([]);
  });

  it("falls back to a venue search for unlisted festivals, one result per venue and day", async () => {
    const data = [
      setlist({
        artist: "A",
        venueId: "hh",
        venue: "Hinterland Festival Grounds",
        city: "St. Charles",
        state: "IA",
        date: "2024-08-03",
      }),
      setlist({
        artist: "B",
        venueId: "hh",
        venue: "Hinterland Festival Grounds",
        city: "St. Charles",
        state: "IA",
        date: "2024-08-03",
      }),
      setlist({
        artist: "C",
        venueId: "hh",
        venue: "Hinterland Festival Grounds",
        city: "St. Charles",
        state: "IA",
        date: "2024-08-04",
      }),
    ];
    const { client } = fakeClient(data);
    const r = await searchFestivalDays(
      { client, now: NOW },
      search("Hinterland", { mode: "festival" }),
    );
    expect(
      r.results.map((d) => [d.date, d.festivalName, d.dayLabel, d.artistCount, d.target]),
    ).toEqual([
      ["2024-08-03", "Hinterland", "Day 1", 2, { kind: "venue", venueId: "hh" }],
      ["2024-08-04", "Hinterland", "Day 2", 1, { kind: "venue", venueId: "hh" }],
    ]);
  });
});

describe("getLineup", () => {
  it("collects every page, dedupes artists and orders the lineup", async () => {
    const data = [
      ...Array.from({ length: 25 }, (_, i) =>
        setlist({
          artist: `Act ${String(i).padStart(2, "0")}`,
          venueId: "v1",
          date: "2024-06-16",
          songs: i % 3,
        }),
      ),
      setlist({ artist: "Headliner", venueId: "v1", date: "2024-06-16", songs: 20 }),
      setlist({ artist: "Elsewhere", venueId: "v2", date: "2024-06-16", songs: 30 }),
    ];
    const { client, queries } = fakeClient(data);
    const r = await getLineup(
      { client, now: NOW },
      { action: "lineup", target: { kind: "venue", venueId: "v1" }, date: "2024-06-16" },
    );
    expect(queries.map((q) => [q.venueId, q.date, q.p])).toEqual([
      ["v1", "16-06-2024", 1],
      ["v1", "16-06-2024", 2],
    ]);
    expect(r.artists).toHaveLength(26);
    expect(r.artists[0]).toMatchObject({ name: "Headliner", songCount: 20 });
    expect(r.setlistfmUrl).toMatch(/^https:\/\/www\.setlist\.fm\/setlist\//);
  });

  it("puts the searched artist first", async () => {
    const data = [
      setlist({ artist: "Headliner", venueId: "v1", date: "2024-06-16", songs: 20 }),
      setlist({ artist: "Opener", venueId: "v1", date: "2024-06-16", songs: 6 }),
    ];
    const { client } = fakeClient(data);
    const r = await getLineup(
      { client, now: NOW },
      {
        action: "lineup",
        target: { kind: "venue", venueId: "v1" },
        date: "2024-06-16",
        searchedArtistMbid: "mbid-Opener",
      },
    );
    expect(r.artists.map((a) => a.name)).toEqual(["Opener", "Headliner"]);
  });
});
