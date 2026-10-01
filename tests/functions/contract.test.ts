// The Edge Function keeps its own copy of the setlist-search contract (it can't import from
// the monorepo when deployed). These checks fail `pnpm typecheck` if the copies drift apart.
import type * as App from "@musicjunkie/shared";
import { expect, it } from "vitest";
import type * as Fn from "../../supabase/functions/_shared/setlistfm/contract.ts";

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const same = <T extends true>(): T => true as T;

same<Same<App.UsVenue, Fn.UsVenue>>();
same<Same<App.LineupTarget, Fn.LineupTarget>>();
same<Same<App.SearchRequest, Fn.SearchRequest>>();
same<Same<App.SearchResponse, Fn.SearchResponse>>();
same<Same<App.LineupRequest, Fn.LineupRequest>>();
same<Same<App.LineupResponse, Fn.LineupResponse>>();
same<Same<App.SetlistSearchRequest, Fn.SetlistSearchRequest>>();

it("keeps the app and function contracts in sync (checked at compile time)", () => {
  expect(true).toBe(true);
});
