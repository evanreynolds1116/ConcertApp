/**
 * Social features through the API with real sign-ins: people search, profiles (locked vs
 * visible), follower lists, feed, avatar storage. Read-only.
 */
import { describe, expect, it } from "vitest";
import { anonClient, SEED, signedInAs } from "./supabase";

describe("social", () => {
  it("search finds people with the viewer's follow status", async () => {
    const priya = await signedInAs("priya");
    const { data } = await priya.rpc("search_people", { p_query: "fran" });
    expect(data?.map((p) => [p.username, p.follow_status])).toEqual([["fran_followed", "pending"]]);
    await priya.auth.signOut();
  });

  it("a locked profile shows names but no counts; a follower sees counts", async () => {
    const [priya, pat] = await Promise.all([signedInAs("priya"), signedInAs("pat")]);
    const { data: locked } = await priya
      .rpc("profile_overview", { p_username: "fran_followed" })
      .single();
    const { data: open } = await pat
      .rpc("profile_overview", { p_username: "fran_followed" })
      .single();
    expect(locked).toMatchObject({
      display_name: "Fran Followed",
      can_view: false,
      concerts: null,
    });
    expect(open).toMatchObject({ can_view: true, follow_status: "accepted" });
    expect(open?.concerts).toBeGreaterThan(0);
    await Promise.all([priya.auth.signOut(), pat.auth.signOut()]);
  });

  it("follower lists of a private user stay private", async () => {
    const priya = await signedInAs("priya");
    const { data } = await priya.rpc("follow_list", {
      p_user_id: SEED.fran.id,
      p_kind: "followers",
    });
    expect(data).toEqual([]);
    await priya.auth.signOut();
  });

  it("the feed has your activity and people you follow", async () => {
    const pat = await signedInAs("pat");
    const { data } = await pat.rpc("feed", {});
    const actors = new Set(data?.map((i) => i.actor_id));
    expect([...actors].sort()).toEqual([SEED.pat.id, SEED.fran.id].sort());
    await pat.auth.signOut();
  });

  it("signed-out visitors can't search people, read feeds or list avatars", async () => {
    const anon = anonClient();
    expect((await anon.rpc("search_people", { p_query: "pat" })).error?.code).toBe("42501");
    expect((await anon.rpc("feed", {})).error?.code).toBe("42501");
    const { data } = await anon.storage.from("avatars").list();
    expect(data ?? []).toEqual([]);
  });
});
