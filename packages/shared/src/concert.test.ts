import { describe, expect, it } from "vitest";
import {
  formatMonthYear,
  spendCoverage,
  concertDraftSchema,
  editLogSchema,
  festivalLabel,
  supportingActsLine,
  formatPrice,
  formatPriceWhole,
  formatRating,
  formatShowDate,
  lineupSummary,
  manualShowSchema,
  parsePriceToCents,
  parseRating,
  showDateParts,
  usToday,
  type ConcertDraft,
} from "./concert";

describe("ratings", () => {
  it("formats tenths with one decimal, including 0.0", () => {
    expect(formatRating(87)).toBe("8.7");
    expect(formatRating(100)).toBe("10.0");
    expect(formatRating(0)).toBe("0.0");
  });

  it("parses typed ratings; blank means no rating", () => {
    expect(parseRating("8.7")).toBe(87);
    expect(parseRating("10")).toBe(100);
    expect(parseRating("0")).toBe(0);
    expect(parseRating("  ")).toBeNull();
  });

  it.each(["10.1", "-1", "8.75", "abc", "11"])("rejects %j", (text) => {
    expect(parseRating(text)).toBeUndefined();
  });
});

describe("prices", () => {
  it("formats USD", () => {
    expect(formatPrice(8500)).toBe("$85.00");
    expect(formatPrice(0)).toBe("$0.00");
    expect(formatPriceWhole(124049)).toBe("$1,240");
  });

  it.each([
    ["85", 8500],
    ["$85.5", 8550],
    ["1,240.99", 124099],
    ["0", 0],
    ["0.05", 5],
  ])("parses %j as %d cents", (text, cents) => {
    expect(parsePriceToCents(text)).toBe(cents);
  });

  it("treats blank as not set and rejects junk", () => {
    expect(parsePriceToCents("")).toBeNull();
    expect(parsePriceToCents("12.345")).toBeUndefined();
    expect(parsePriceToCents("-5")).toBeUndefined();
    expect(parsePriceToCents("free")).toBeUndefined();
    expect(parsePriceToCents("100000.01")).toBeUndefined();
  });
});

describe("dates", () => {
  it("formats show dates without time-zone drift", () => {
    expect(formatShowDate("2026-09-20")).toBe("Sun, Sep 20, 2026");
    expect(showDateParts("2024-06-01")).toEqual({ month: "JUN", day: "1", year: "2024" });
  });

  it("uses the latest US time zone for today", () => {
    expect(usToday(new Date("2026-10-01T05:00:00Z"))).toBe("2026-09-30");
  });
});

describe("stats wording", () => {
  it("describes spend with its coverage, as the spec words it", () => {
    expect(spendCoverage(124000, 18, 25)).toBe("$1,240 across 18 of 25 concerts");
    expect(spendCoverage(31000, 4, 6)).toBe("$310 across 4 of 6 concerts");
    expect(spendCoverage(0, 1, 1)).toBe("$0 across 1 of 1 concert");
  });

  it("formats month and year", () => {
    expect(formatMonthYear("2019-03-14")).toBe("Mar 2019");
  });
});

describe("concertDraftSchema", () => {
  const draft: ConcertDraft = {
    source: "setlistfm",
    date: "2023-10-31",
    venue: { name: "Hollywood Bowl", city: "Los Angeles", state: "CA", setlistfmId: "33d62cf9" },
    festivalName: null,
    festivalDayLabel: null,
    setlistfmUrl: "https://www.setlist.fm/setlist/x.html",
    artists: [{ name: "boygenius", mbid: "3ceeddbd", setlistfmUrl: null }],
    ratingTenths: 0,
    ticketPriceCents: 0,
    notes: "",
  };

  it("accepts a complete draft, with 0.0 and $0 as real values", () => {
    expect(concertDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("needs at least one artist, a US state and a past date", () => {
    expect(concertDraftSchema.safeParse({ ...draft, artists: [] }).success).toBe(false);
    expect(
      concertDraftSchema.safeParse({ ...draft, venue: { ...draft.venue, state: "ON" } }).success,
    ).toBe(false);
    expect(concertDraftSchema.safeParse({ ...draft, date: "2999-01-01" }).success).toBe(false);
    expect(concertDraftSchema.safeParse({ ...draft, date: "2023-02-30" }).success).toBe(false);
    expect(concertDraftSchema.safeParse({ ...draft, date: "1959-12-31" }).success).toBe(false);
  });

  it("rejects out-of-range ratings and prices", () => {
    expect(concertDraftSchema.safeParse({ ...draft, ratingTenths: 101 }).success).toBe(false);
    expect(concertDraftSchema.safeParse({ ...draft, ticketPriceCents: -1 }).success).toBe(false);
  });
});

describe("manualShowSchema", () => {
  it("trims fields and requires venue, city, state and date", () => {
    const ok = manualShowSchema.safeParse({
      venueName: " The Pinhook ",
      city: "Durham",
      state: "NC",
      date: "2025-03-01",
      festivalName: "",
    });
    expect(ok.success && ok.data.venueName).toBe("The Pinhook");
    const bad = manualShowSchema.safeParse({
      venueName: "",
      city: "",
      state: "",
      date: "",
      festivalName: "",
    });
    expect([...new Set(bad.error?.issues.map((i) => i.path[0]))].sort()).toEqual([
      "city",
      "date",
      "state",
      "venueName",
    ]);
  });
});

describe("lineupSummary", () => {
  it("names the headliner and counts the rest", () => {
    expect(lineupSummary(["Phoebe Bridgers", "MUNA", "Sloppy Jane"])).toBe(
      "Phoebe Bridgers + 2 more",
    );
    expect(lineupSummary(["Phoebe Bridgers"])).toBe("Phoebe Bridgers");
    expect(lineupSummary([])).toBe("");
  });
});

describe("log card helpers", () => {
  it("lists up to two supporting acts, then a count", () => {
    expect(supportingActsLine(["Phoebe Bridgers"])).toBe("");
    expect(supportingActsLine(["Phoebe Bridgers", "MUNA"])).toBe("with MUNA");
    expect(supportingActsLine(["Phoebe Bridgers", "MUNA", "Sloppy Jane"])).toBe(
      "with MUNA, Sloppy Jane",
    );
    const bonnaroo = [
      "Tyler, the Creator",
      "Doechii",
      "Clairo",
      ...Array.from({ length: 16 }, (_, i) => `Act ${i}`),
    ];
    expect(supportingActsLine(bonnaroo)).toBe("with Doechii, Clairo + 16 more");
  });

  it("labels festival days", () => {
    expect(festivalLabel("Bonnaroo", "Day 3")).toBe("Bonnaroo · Day 3");
    expect(festivalLabel("Bonnaroo", null)).toBe("Bonnaroo");
  });
});

describe("editLogSchema", () => {
  const id = "10000000-0000-4000-a000-000000000001";
  it("takes existing artists by id and new ones by name", () => {
    const ok = editLogSchema.safeParse({
      logId: id,
      artists: [{ artistId: "40000000-0000-4000-a000-000000000002" }, { name: " New Act " }],
      ratingTenths: null,
      ticketPriceCents: 0,
      notes: "",
    });
    expect(ok.success && ok.data.artists[1]).toEqual({ name: "New Act" });
  });

  it("needs an artist and valid ids", () => {
    const base = { logId: id, ratingTenths: null, ticketPriceCents: null, notes: "" };
    expect(editLogSchema.safeParse({ ...base, artists: [] }).success).toBe(false);
    expect(editLogSchema.safeParse({ ...base, artists: [{ artistId: "nope" }] }).success).toBe(
      false,
    );
    expect(
      editLogSchema.safeParse({ ...base, logId: "nope", artists: [{ name: "A" }] }).success,
    ).toBe(false);
  });
});
