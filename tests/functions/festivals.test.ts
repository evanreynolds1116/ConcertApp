import { describe, expect, it } from "vitest";
import {
  FESTIVALS,
  findFestival,
  siteForYear,
  stagecoachFriday,
} from "../../supabase/functions/_shared/setlistfm/festivals.ts";

const byName = (name: string) => FESTIVALS.find((f) => f.name === name)!;

describe("findFestival", () => {
  it.each([
    ["Bonnaroo", "Bonnaroo"],
    ["bonnaroo 2024", "Bonnaroo"],
    ["Lolla", "Lollapalooza"],
    ["gov ball", "Governors Ball"],
    ["Governor's Ball", "Governors Ball"],
    ["ACL", "Austin City Limits"],
    ["newport jazz", "Newport Jazz Festival"],
    ["Riot Fest", "Riot Fest"],
    ["bottle rock", "BottleRock Napa Valley"],
    ["So What", "So What?! Music Festival"],
    ["so what?! 2024", "So What?! Music Festival"],
    ["Warped Tour", "Warped Tour"],
    ["vans warped tour 2018", "Warped Tour"],
  ])("%s -> %s", (query, name) => {
    expect(findFestival(query)?.name).toBe(name);
  });

  it.each(["festival", "music festival 2024", "", "Ryman Auditorium", "acl2"])(
    "%j matches nothing",
    (query) => {
      expect(findFestival(query)).toBeNull();
    },
  );
});

describe("festival dates", () => {
  it("finds Stagecoach weekend: Friday-Sunday from the last Friday of April", () => {
    expect(stagecoachFriday(2022)).toBe("2022-04-29"); // ran into May 1
    expect(stagecoachFriday(2024)).toBe("2024-04-26");
    expect(stagecoachFriday(2025)).toBe("2025-04-25");
  });

  it("tells Coachella and Stagecoach apart at the same grounds", () => {
    const coachella = byName("Coachella");
    const stagecoach = byName("Stagecoach");
    expect(coachella.isFestivalDate("2025-04-20")).toBe(true);
    expect(coachella.isFestivalDate("2025-04-26")).toBe(false);
    expect(stagecoach.isFestivalDate("2025-04-26")).toBe(true);
    expect(stagecoach.isFestivalDate("2022-05-01")).toBe(true);
    expect(stagecoach.isFestivalDate("2025-04-20")).toBe(false);
  });

  it("tells Newport Folk (July) and Newport Jazz (August) apart", () => {
    expect(byName("Newport Folk Festival").isFestivalDate("2023-07-30")).toBe(true);
    expect(byName("Newport Folk Festival").isFestivalDate("2023-08-05")).toBe(false);
    expect(byName("Newport Jazz Festival").isFestivalDate("2023-08-05")).toBe(true);
  });

  it("matches So What?! editions by date, not other shows at the same grounds", () => {
    const soWhat = byName("So What?! Music Festival");
    expect(soWhat.isFestivalDate("2024-06-01")).toBe(true);
    expect(soWhat.isFestivalDate("2024-06-02")).toBe(true);
    expect(soWhat.isFestivalDate("2024-06-15")).toBe(false);
    expect(soWhat.isFestivalDate("2023-06-24")).toBe(true);
    expect(soWhat.isFestivalDate("2023-07-26")).toBe(false);
    expect(soWhat.isFestivalDate("2022-05-27")).toBe(true);
    expect(soWhat.isFestivalDate("2027-06-05")).toBe(true); // unlisted later year: late May/June
  });
});

describe("siteForYear", () => {
  it("follows a festival that moved", () => {
    const govBall = byName("Governors Ball");
    expect(siteForYear(govBall, 2024)?.grounds.name).toBe("Flushing Meadows Corona Park");
    expect(siteForYear(govBall, 2023)?.grounds.name).toBe("Citi Field");
    expect(siteForYear(govBall, 2019)?.grounds.name).toBe("Randall's Island Park");
    expect(siteForYear(govBall)?.grounds.name).toBe("Flushing Meadows Corona Park");
    const soWhat = byName("So What?! Music Festival");
    expect(siteForYear(soWhat, 2024)?.grounds.name).toBe("Panther Island Pavilion");
    expect(siteForYear(soWhat, 2023)?.grounds.name).toBe("Fair Park");
    expect(siteForYear(soWhat, 2022)?.grounds.name).toBe("Choctaw Stadium");
  });

  it("returns nothing for years a listed site doesn't cover", () => {
    expect(siteForYear(byName("Riot Fest"), 2014)).toBeNull();
  });

  it("every listed site has a US grounds venue to save shows against", () => {
    for (const festival of FESTIVALS) {
      for (const site of festival.sites) {
        expect(site.grounds.state, festival.name).toMatch(/^[A-Z]{2}$/);
        expect(site.grounds.state, festival.name).toBe(site.search.stateCode);
      }
    }
  });
});
