/**
 * Browsing logs through the API (user_log, also_here): the same privacy rules as the tables,
 * via real sign-ins and the publishable key. Read-only.
 */
import { describe, expect, it } from "vitest";
import { anonClient, SEED, signedInAs } from "./supabase";

describe("user_log", () => {
  it("lets anyone signed in browse a public log, with lineups in order", async () => {
    const priya = await signedInAs("priya");
    const { data, error } = await priya.rpc("user_log", {
      p_user_id: SEED.pat.id,
      p_artist: "genius",
    });
    expect(error).toBeNull();
    const hollywood = data?.find((r) => r.log_id === "10000000-0000-4000-a000-000000000001");
    expect(hollywood?.artists).toEqual(["boygenius", "100 gecs", "Sloppy Jane"]);
    await priya.auth.signOut();
  });

  it("returns nothing from a private log to a non-follower", async () => {
    const priya = await signedInAs("priya");
    const { data, error } = await priya.rpc("user_log", { p_user_id: SEED.fran.id });
    expect(error).toBeNull();
    expect(data).toEqual([]);
    await priya.auth.signOut();
  });

  it("is closed to signed-out visitors", async () => {
    const { error } = await anonClient().rpc("user_log", { p_user_id: SEED.pat.id });
    expect(error?.code).toBe("42501");
  });
});

describe("also_here", () => {
  it("lists people the viewer follows at the same show", async () => {
    const pat = await signedInAs("pat");
    const { data } = await pat.rpc("also_here", {
      p_log_id: "10000000-0000-4000-a000-000000000004",
    });
    expect(data?.map((p) => p.username)).toEqual(["fran_followed"]);
    await pat.auth.signOut();
  });
});
