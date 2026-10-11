import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { handle } from "../../supabase/functions/_shared/setlistfm/search.ts";
import {
  createSigner,
  signArtist,
  signResult,
} from "../../supabase/functions/_shared/setlistfm/signing.ts";
import { fakeClient, NOW, setlist } from "./fixtures.ts";

const KEY = "a".repeat(64);
// The format private.lineup_signature() uses in Postgres: kind and trimmed fields joined by \x1f.
const expected = (kind: string, fields: (string | null)[]) =>
  createHmac("sha256", KEY)
    .update([kind, ...fields.map((f) => (f ?? "").trim())].join("\x1f"), "utf8")
    .digest("hex");

describe("createSigner", () => {
  it("matches the database's HMAC format, trimming fields and treating null as empty", async () => {
    const sign = await createSigner(KEY);
    expect(await sign("artist", ["m1", " RÜFÜS DU SOL ", null, "u", "2026-06-13"])).toBe(
      expected("artist", ["m1", "RÜFÜS DU SOL", "", "u", "2026-06-13"]),
    );
  });

  it("depends on the kind and every field", async () => {
    const sign = await createSigner(KEY);
    const base = await sign("show", ["v", "Hall", "Austin", "TX", "1999-05-01", null, null]);
    expect(await sign("artist", ["v", "Hall", "Austin", "TX", "1999-05-01", null, null])).not.toBe(
      base,
    );
    expect(await sign("show", ["v", "Hall!", "Austin", "TX", "1999-05-01", null, null])).not.toBe(
      base,
    );
    expect(await sign("show", ["v", "Hall", "Austin", "TX", "1999-05-02", null, null])).not.toBe(
      base,
    );
  });
});

describe("signResult / signArtist", () => {
  const venue = { setlistfmId: "v1", name: "Ryman", city: "Nashville", state: "TN", url: null };

  it("signs a concert result over venue and date", async () => {
    const sign = await createSigner(KEY);
    const signed = await signResult(
      {
        kind: "concert",
        key: "k",
        date: "2024-06-16",
        venue,
        title: "boygenius",
        artistMbid: null,
        setlistfmUrl: "https://www.setlist.fm/setlist/x.html",
        target: { kind: "venue", venueId: "v1" },
      },
      sign,
    );
    expect(signed.signature).toBe(
      expected("show", ["v1", "Ryman", "Nashville", "TN", "2024-06-16", null, null]),
    );
  });

  it("includes a festival day's name and label", async () => {
    const sign = await createSigner(KEY);
    const signed = await signResult(
      {
        kind: "festival-day",
        key: "k",
        date: "2024-06-16",
        venue,
        festivalName: "Bonnaroo",
        dayLabel: "Day 4",
        artistCount: 3,
        target: { kind: "venue", venueId: "v1" },
      },
      sign,
    );
    expect(signed.signature).toBe(
      expected("show", ["v1", "Ryman", "Nashville", "TN", "2024-06-16", "Bonnaroo", "Day 4"]),
    );
  });

  it("signs an artist over MBID, name, links and the show date", async () => {
    const sign = await createSigner(KEY);
    const artist = {
      name: "Chappell Roan",
      mbid: "m",
      setlistfmUrl: "a",
      setlistUrl: "s",
      songCount: 9,
    };
    expect((await signArtist(artist, "2024-06-16", sign)).signature).toBe(
      expected("artist", ["m", "Chappell Roan", "a", "s", "2024-06-16"]),
    );
  });
});

describe("handle", () => {
  it("signs every search result and lineup artist it returns", async () => {
    const sign = await createSigner(KEY);
    const { client } = fakeClient([
      setlist({ artist: "Headliner", venueId: "v1", date: "2024-06-16", songs: 20 }),
      setlist({ artist: "Opener", venueId: "v1", date: "2024-06-16", songs: 6 }),
    ]);
    const search = await handle(
      { client, now: NOW, sign },
      { action: "search", mode: "concert", query: "Headliner" },
    );
    expect(
      "results" in search && search.results.every((r) => /^[0-9a-f]{64}$/.test(r.signature)),
    ).toBe(true);
    const lineup = await handle(
      { client, now: NOW, sign },
      { action: "lineup", target: { kind: "venue", venueId: "v1" }, date: "2024-06-16" },
    );
    expect("artists" in lineup && lineup.artists.map((a) => a.signature)).toEqual(
      "artists" in lineup
        ? lineup.artists.map((a) =>
            expected("artist", [a.mbid, a.name, a.setlistfmUrl, a.setlistUrl, "2024-06-16"]),
          )
        : [],
    );
  });
});
