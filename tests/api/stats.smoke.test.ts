/**
 * Stats through the API: they follow the same privacy rule as logs. Read-only.
 * (Exact hand-counted numbers are checked in supabase/tests/database/06_stats.test.sql.)
 */
import { describe, expect, it } from "vitest";
import { anonClient, SEED, signedInAs } from "./supabase";

describe("stats", () => {
  it("a follower sees a private user's stats; a non-follower gets zeros", async () => {
    const [pat, priya] = await Promise.all([signedInAs("pat"), signedInAs("priya")]);
    const { data: seen } = await pat.rpc("user_stats", { p_user_id: SEED.fran.id }).single();
    const { data: hidden } = await priya.rpc("user_stats", { p_user_id: SEED.fran.id }).single();
    expect(seen?.concerts).toBeGreaterThan(0);
    expect(hidden).toMatchObject({ concerts: 0, artists: 0, spent_cents: 0 });
    const { data: board } = await priya.rpc("leaderboard", {
      p_user_id: SEED.fran.id,
      p_kind: "state",
    });
    expect(board).toEqual([]);
    await Promise.all([pat.auth.signOut(), priya.auth.signOut()]);
  });

  it("counts Portland, OR and Portland, ME as two cities", async () => {
    const pat = await signedInAs("pat");
    const { data } = await pat.rpc("leaderboard", { p_user_id: SEED.pat.id, p_kind: "city" });
    expect(
      data
        ?.filter((r) => r.name === "Portland")
        .map((r) => r.state)
        .sort(),
    ).toEqual(["ME", "OR"]);
    await pat.auth.signOut();
  });

  it("is closed to signed-out visitors", async () => {
    const { error } = await anonClient().rpc("stats_by_year", { p_user_id: SEED.pat.id });
    expect(error?.code).toBe("42501");
  });
});
