/**
 * log_concert through the API: the web app relies on PostgREST passing the duplicate error
 * through as code 23505, message "already_logged" and the existing log id as `details`.
 * Read-only: both calls fail before writing anything.
 */
import { describe, expect, it } from "vitest";
import { anonClient, signedInAs } from "./supabase";

const HOLLYWOOD_BOWL = {
  name: "Hollywood Bowl",
  city: "Los Angeles",
  state: "CA",
  setlistfmId: "33d62cf9",
};

describe("log_concert", () => {
  it("reports a duplicate with the existing log's id", async () => {
    const priya = await signedInAs("priya");
    const { data, error } = await priya.rpc("log_concert", {
      p_source: "setlistfm",
      p_date: "2023-10-31",
      p_venue: HOLLYWOOD_BOWL,
      p_artists: [{ name: "boygenius", mbid: "3ceeddbd-fba5-4bdb-99f7-2d028ed5afda" }],
    });
    expect(data).toBeNull();
    expect(error).toMatchObject({
      code: "23505",
      message: "already_logged",
      details: "10000000-0000-4000-a000-000000000005", // priya's seeded Hollywood Bowl log
    });
    await priya.auth.signOut();
  });

  it("can't be called signed out", async () => {
    const { error } = await anonClient().rpc("log_concert", {
      p_source: "manual",
      p_date: "2024-01-01",
      p_venue: { name: "X", city: "Y", state: "TN" },
      p_artists: [{ name: "Z" }],
    });
    expect(error?.code).toBe("42501");
  });
});
