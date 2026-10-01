/**
 * API smoke tests: the privacy rules seen through the real stack (Supabase Auth sign-in,
 * PostgREST, the publishable key), not just the database. The full privacy matrix lives in
 * the pgTAP tests (supabase/tests/database); these catch what pgTAP can't, like missing
 * grants, tables not exposed through the API, or a JWT that doesn't map to auth.uid().
 *
 * Needs local Supabase running with seed data: `pnpm db:start`, then `pnpm db:reset`.
 * Read-only: nothing here changes data.
 */
import { afterAll, describe, expect, it } from "vitest";
import { anonClient, SEED, signedInAs, type Client } from "./supabase";

const clients: Client[] = [];
async function as(user: keyof typeof SEED) {
  const client = await signedInAs(user);
  clients.push(client);
  return client;
}
afterAll(async () => {
  await Promise.all(clients.map((c) => c.auth.signOut()));
});

async function logCount(client: Client, ownerId: string) {
  const { count, error } = await client
    .from("concert_logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", ownerId);
  expect(error).toBeNull();
  return count;
}

describe("signed out", () => {
  it("cannot read any user data", async () => {
    const client = anonClient();
    for (const table of [
      "profiles",
      "concert_logs",
      "log_artists",
      "follows",
      "activities",
      "shows",
    ] as const) {
      const { data, error } = await client.from(table).select("*").limit(1);
      expect(data, table).toBeNull();
      expect(error?.code, table).toBe("42501");
    }
  });

  it("can check whether a username is available (sign-up form)", async () => {
    const client = anonClient();
    const { data: taken } = await client.rpc("is_username_available", { name: "PAT_PUBLIC" });
    const { data: free } = await client.rpc("is_username_available", { name: "nobody_has_this" });
    expect(taken).toBe(false);
    expect(free).toBe(true);
  });
});

describe("signed in", () => {
  it("maps the session to the right user", async () => {
    const pat = await as("pat");
    const { data } = await pat.auth.getClaims();
    expect(data?.claims.sub).toBe(SEED.pat.id);
  });

  it("pat (accepted follower of fran) sees fran's logs, not private priya's", async () => {
    const pat = await as("pat");
    expect(await logCount(pat, SEED.pat.id)).toBe(4);
    expect(await logCount(pat, SEED.fran.id)).toBe(3);
    expect(await logCount(pat, SEED.priya.id)).toBe(0);
  });

  it("priya sees public pat's logs, but a pending request doesn't unlock fran's", async () => {
    const priya = await as("priya");
    expect(await logCount(priya, SEED.pat.id)).toBe(4);
    expect(await logCount(priya, SEED.fran.id)).toBe(0);
    const { data: pending } = await priya
      .from("follows")
      .select("followee_id, status")
      .eq("status", "pending");
    expect(pending).toEqual([{ followee_id: SEED.fran.id, status: "pending" }]);
  });

  it("returns lineups, shows and venues through API joins", async () => {
    const pat = await as("pat");
    const { data, error } = await pat
      .from("concert_logs")
      .select(
        "id, shows(date, festival_name, venues(name, city, state)), log_artists(position, artists(name))",
      )
      .eq("user_id", SEED.fran.id)
      .eq("show_id", "30000000-0000-4000-a000-000000000005")
      .single();
    expect(error).toBeNull();
    expect(data?.shows).toMatchObject({
      date: "2024-06-16",
      festival_name: "Bonnaroo",
      venues: { state: "TN" },
    });
    const lineup = [...(data?.log_artists ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((a) => a.artists?.name);
    expect(lineup).toEqual(["Chappell Roan", "Megan Thee Stallion"]);
  });

  it("everyone signed in can see every profile", async () => {
    const fran = await as("fran");
    const { data } = await fran
      .from("profiles")
      .select("username")
      .in(
        "id",
        Object.values(SEED).map((u) => u.id),
      );
    expect(data?.map((p) => p.username).sort()).toEqual([
      "fran_followed",
      "pat_public",
      "priya_private",
    ]);
  });

  it("can't edit someone else's log, even one they can see", async () => {
    const pat = await as("pat");
    const { data, error } = await pat
      .from("concert_logs")
      .update({ notes: "not mine" })
      .eq("user_id", SEED.fran.id)
      .select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]); // RLS filters the rows out: nothing updated
  });

  it("can't write feed items or shared reference data directly", async () => {
    const pat = await as("pat");
    const { error } = await pat
      .from("activities")
      .insert({ actor_id: SEED.pat.id, type: "follow_started", target_user_id: SEED.fran.id });
    expect(error?.code).toBe("42501");
    const { error: showError } = await pat
      .from("shows")
      .insert({ venue_id: "20000000-0000-4000-a000-000000000001", date: "2020-01-01" });
    expect(showError?.code).toBe("42501");
  });
});
