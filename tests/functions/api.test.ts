import { describe, expect, it, vi } from "vitest";
import { SetlistFmClient, SetlistFmError } from "../../supabase/functions/_shared/setlistfm/api.ts";

function response(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setup(responses: Response[]) {
  let clock = 1_000_000;
  const fetch = vi.fn<typeof globalThis.fetch>(async () => responses.shift()!);
  const sleep = vi.fn(async (ms: number) => {
    clock += ms;
  });
  const client = new SetlistFmClient({
    apiKey: "test-key",
    fetch,
    sleep,
    now: () => clock,
    minGapMs: 600,
  });
  return { client, fetch, sleep };
}

describe("SetlistFmClient", () => {
  it("sends the key in a header, never in the URL, and always limits to the US", async () => {
    const { client, fetch } = setup([response(200, { setlist: [], total: 0 })]);
    await client.searchSetlists({ artistName: "boygenius", year: 2023 });
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toContain("countryCode=US");
    expect(String(url)).toContain("artistName=boygenius");
    expect(String(url)).not.toContain("test-key");
    expect((init!.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
  });

  it("treats a 404 as no results", async () => {
    const { client } = setup([response(404, { code: 404, message: "not found" })]);
    await expect(client.searchSetlists({ artistName: "nobody" })).resolves.toMatchObject({
      setlists: [],
      total: 0,
    });
  });

  it("backs off and retries when rate limited", async () => {
    const { client, fetch, sleep } = setup([
      response(429),
      response(200, { setlist: [], total: 3 }),
    ]);
    await expect(client.searchSetlists({ venueId: "v1" })).resolves.toMatchObject({ total: 3 });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1500);
  });

  it("gives up with an error after repeated 429s or a server error", async () => {
    const limited = setup([response(429), response(429), response(429), response(429)]);
    await expect(limited.client.searchSetlists({ venueId: "v1" })).rejects.toBeInstanceOf(
      SetlistFmError,
    );
    const broken = setup([response(500)]);
    await expect(broken.client.searchSetlists({ venueId: "v1" })).rejects.toMatchObject({
      status: 500,
    });
  });

  it("spaces requests out, even when called in parallel", async () => {
    const { client, sleep } = setup([response(200, {}), response(200, {})]);
    await Promise.all([
      client.searchSetlists({ venueId: "a" }),
      client.searchSetlists({ venueId: "b" }),
    ]);
    expect(sleep).toHaveBeenCalledWith(600);
  });

  it("serves a repeated query from its short-lived cache", async () => {
    const { client, fetch } = setup([response(200, { setlist: [], total: 7 })]);
    await client.searchSetlists({ venueId: "v1", p: 1 });
    await expect(client.searchSetlists({ p: 1, venueId: "v1" })).resolves.toMatchObject({
      total: 7,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
