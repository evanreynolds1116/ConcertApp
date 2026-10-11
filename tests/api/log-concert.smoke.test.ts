/**
 * log_concert through the API: the web app relies on PostgREST passing the duplicate error
 * through as code 23505, message "already_logged" and the existing log id as `details`, and
 * setlist.fm details must carry setlist-search's signature (SECURITY_AUDIT.md, M1).
 * Read-only: every call fails before writing anything.
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
    // A manual entry of the same venue and date is the same show.
    const { name, city, state } = HOLLYWOOD_BOWL;
    const { data, error } = await priya.rpc("log_concert", {
      p_source: "manual",
      p_date: "2023-10-31",
      p_venue: { name, city, state },
      p_artists: [{ name: "boygenius" }],
    });
    expect(data).toBeNull();
    expect(error).toMatchObject({
      code: "23505",
      message: "already_logged",
      details: "10000000-0000-4000-a000-000000000005", // priya's seeded Hollywood Bowl log
    });
    await priya.auth.signOut();
  });

  it("refuses setlist.fm details that setlist-search didn't sign", async () => {
    const priya = await signedInAs("priya");
    const { data, error } = await priya.rpc("log_concert", {
      p_source: "setlistfm",
      p_date: "1999-01-01",
      p_venue: { ...HOLLYWOOD_BOWL, name: "Not The Hollywood Bowl" },
      p_artists: [{ name: "boygenius", mbid: "3ceeddbd-fba5-4bdb-99f7-2d028ed5afda" }],
      p_show_signature: "0".repeat(64),
    });
    expect(data).toBeNull();
    expect(error?.code).toBe("22023");
    expect(error?.message).toMatch(/could not be verified/);
    await priya.auth.signOut();
  });

  it("keeps the signing key and search quota away from users", async () => {
    const priya = await signedInAs("priya");
    const key = await priya.rpc("lineup_signing_key");
    const quota = await priya.rpc("consume_search_quota", {
      p_user_id: "00000000-0000-4000-a000-000000000002",
    });
    expect(key.data).toBeNull();
    expect(key.error).not.toBeNull();
    expect(quota.data).toBeNull();
    expect(quota.error).not.toBeNull();
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
