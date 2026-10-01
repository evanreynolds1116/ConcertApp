import { describe, expect, it } from "vitest";
import { hasLogFilters, logFiltersToQuery, parseLogFilters } from "./log-filters";

describe("parseLogFilters", () => {
  it("reads every filter from the URL", () => {
    const filters = parseLogFilters(
      new URLSearchParams(
        "artist= boygenius &year=2023&month=10&state=ca&city=Los Angeles&venue=20000000-0000-4000-A000-000000000001",
      ),
    );
    expect(filters).toEqual({
      artist: "boygenius",
      year: 2023,
      month: 10,
      state: "CA",
      city: "Los Angeles",
      venueId: "20000000-0000-4000-a000-000000000001",
    });
  });

  it("accepts Next.js searchParams objects too", () => {
    expect(parseLogFilters({ year: ["2022", "2023"], month: undefined })).toEqual({ year: 2022 });
  });

  it("drops anything invalid instead of failing", () => {
    expect(
      parseLogFilters(new URLSearchParams("year=1959&month=13&state=ON&venue=nope&artist=%20%20")),
    ).toEqual({});
    expect(parseLogFilters(new URLSearchParams("year=2999"))).toEqual({});
  });

  it("only keeps a city alongside its state (Portland, OR vs Portland, ME)", () => {
    expect(parseLogFilters(new URLSearchParams("city=Portland"))).toEqual({});
    expect(parseLogFilters(new URLSearchParams("city=Portland&state=ME"))).toEqual({
      city: "Portland",
      state: "ME",
    });
  });
});

describe("logFiltersToQuery", () => {
  it("round-trips through the URL", () => {
    const filters = {
      artist: "Phoebe Bridgers",
      year: 2026,
      month: 9,
      state: "TN",
      city: "Nashville",
    };
    expect(parseLogFilters(new URLSearchParams(logFiltersToQuery(filters)))).toEqual(filters);
    expect(logFiltersToQuery({})).toBe("");
  });

  it("drops a city without its state", () => {
    expect(logFiltersToQuery({ city: "Portland" })).toBe("");
  });
});

describe("hasLogFilters", () => {
  it("is false only with no filters", () => {
    expect(hasLogFilters({})).toBe(false);
    expect(hasLogFilters({ month: 6 })).toBe(true);
  });
});
