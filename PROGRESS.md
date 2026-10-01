# Progress

**Current phase:** Phase 3 done. Next up: Phase 4.
**Last updated:** 2026-09-30

## Next step

Start Phase 4 (Stats):
- `user_stats`, `leaderboard` and `stats_by_year` functions. Make them `security invoker` (or check `can_view`), and add the "Stats and leaderboards" row to the pgTAP privacy matrix.
- The Stats screen and the four leaderboards.
- Leaderboard rows link to the log, which already accepts the filters: `/?venue=<id>`, `/?city=Portland&state=OR`, `/?state=TN`, `/?artist=<name>`. An artist search is a substring match, so a leaderboard artist link may also catch similar names. Consider an exact `artistId` filter in `user_log` for that.
- Check against hand-counted seed data, including Portland, OR vs Portland, ME.

To use Add concert locally, run `pnpm functions:serve` alongside `pnpm dev`.

## Before building

- [x] MVP spec written (`docs/spec.md`)
- [x] Mobile mockups approved (`docs/mockups/`)
- [x] setlist.fm account created and free API key requested
- [ ] Supabase account created (not needed until Phase 6 deploy; local dev uses the Supabase CLI)

## Phase 0: Setup and setlist.fm spike

- [x] Monorepo scaffolded (pnpm, Turborepo, `apps/web`, `packages/shared`), lint and format set up
- [x] Supabase project created, env files in place (keys not committed). Local only: `supabase/config.toml` from `supabase init`, and `pnpm db:start` runs the full stack under Docker Desktop (WSL 2), with Postgres 17.6 and Studio at http://127.0.0.1:54323. The hosted project is deferred to Phase 6.
- [x] Commands section of `CLAUDE.md` filled in
- [x] setlist.fm spike script run for: a multi-artist show, a festival day, a small club show, a show that isn't there
- [x] `docs/setlistfm-notes.md` explains how to find a festival day's full lineup
- [x] Done when: the web app runs locally and the notes answer the festival question

## Phase 1: Schema, privacy, and auth

- [x] Migrations for all tables in the data model (`supabase/migrations/…_init_schema.sql`)
- [x] `can_view` function and all RLS policies (`…_privacy_and_triggers.sql`)
- [x] Activity triggers, plus follow-status, auto-accept-on-public, profile-on-sign-up, `updated_at` and "at least one artist per log" triggers
- [x] Seed data: 3 users (public, private, private-with-follower) with logs, lineups, follows and a pending request (`supabase/seed.sql`)
- [x] Sign up, sign in, sign out, profile creation. The web uses `@supabase/ssr`, `src/proxy.ts` refreshes the session and redirects, and the pages check the viewer again.
- [x] Settings page with the public/private toggle (plus sign out)
- [x] Done when: automated tests prove each row of the privacy table for all 3 seed users. Every row is covered except "Stats and leaderboards", which moves to Phase 4 (accepted 2026-09-30). `pnpm test:db` runs 107 pgTAP assertions and 9 API smoke tests. A deliberately broken `can_view` makes 13 of them fail.

## Phase 2: Add concert

- [x] `setlist-search` Edge Function (search, lineup assembly, default ordering, month filtering), plus a list of 12 major US festivals (`supabase/functions/_shared/setlistfm/festivals.ts`)
- [x] Search screen with Concert/Festival toggle and month/year/state dropdowns
- [x] Lineup editor (drag to reorder with mouse, touch or keyboard; up arrows; remove; add)
- [x] Details step (rating, ticket price, notes; festival name for festival days)
- [x] Manual entry
- [x] `log_concert` Postgres function (single transaction)
- [x] Done when: a setlist.fm concert, a festival day and a manual concert can each be logged, and a duplicate log is blocked. Checked in the browser on 2026-09-30 as priya:
  - boygenius at Madison Square Garden
  - Riot Fest 2024 Day 2
  - a manual show at The Pinhook
  - re-logging Hollywood Bowl was blocked, with a link to the existing log

  Covered by 33 pgTAP tests (`04_log_concert`), 59 function unit tests and 2 API smoke tests.

## Phase 3: Log and concert detail

- [x] Log list, newest first, 20 per page ("Load more"), cards show headliner + up to two supporting acts, festival chip ("Bonnaroo · Day 4"), rating
- [x] Artist search and year/month/state filters, plus venue and city filters (for Phase 4 leaderboard links). All in the URL, with removable chips.
- [x] Concert detail page with "Also here"
- [x] Edit (same lineup and details editors as Add concert) and delete (confirm dialog)
- [x] Done when: filters combine correctly and lineup edits show up everywhere. Checked in the browser on 2026-09-30 as pat:
  - year+state, artist+year+state and an empty combination; city (Portland, OR) and venue links
  - editing the Hollywood Bowl lineup (new headliner, removed and added artists, new rating, cleared price) updated the concert page, the log card and the artist search
  - delete, privacy (404 for a private log, read-only for a followed user's log) and paging (25 logs)

  Covered by 38 pgTAP tests (`05_log_browse_and_edit`), shared unit tests and 4 API smoke tests.

## Phase 4: Stats

- [ ] `user_stats`, `leaderboard` and `stats_by_year` functions, written as `security invoker` (or checking `can_view`) so they respect privacy
- [ ] Add the "Stats and leaderboards" row to the pgTAP privacy matrix (carried over from Phase 1)
- [ ] Stats screen: five counts, money spent card, concerts per year and spend per year charts
- [ ] Leaderboards: artists, venues, cities, states, each linking to a filtered log
- [ ] Done when: stats match hand-counted seed data, including the Portland, OR / Portland, ME case

## Phase 5: Social

- [ ] People search
- [ ] Follow / unfollow; requests (send, cancel, accept, decline)
- [ ] Other users' profiles, including the locked private view
- [ ] Activity feed
- [ ] Settings: edit username, display name and avatar; delete account (moved here from the spec's Settings section, 2026-09-30)
- [ ] Done when: two test accounts can go through every following rule and see the right things at each step

## Phase 6: Web polish and deploy

- [ ] Loading, empty and error states
- [ ] Keyboard and screen reader checks; phone-width layout
- [ ] setlist.fm attribution everywhere it's needed
- [ ] Deployed to Vercel against the hosted Supabase project

## Phase 7: Mobile app

- [ ] `apps/mobile` with Expo Router, reusing `packages/shared`
- [ ] All web flows with bottom tab navigation
- [ ] Done when: every web flow works on iOS and Android simulators against the same backend

## Decisions made during the build

Record anything decided that isn't in the spec, with the date.

- 2026-09-30: Local Supabase only for now (Supabase CLI as a dev dependency, run with `pnpm supabase`). The hosted project is created in Phase 6.
- 2026-09-30: Nothing installed globally. Turbo, the Supabase CLI and tsx are root dev dependencies.
- 2026-09-30: TypeScript pinned to `~6.0`, because typescript-eslint supports TypeScript below 6.1 (npm `latest` is 7.0).
- 2026-09-30: Upgraded the dev machine from Node 20.17 (end-of-life) to Node 24.19 LTS, installed with winget from the official nodejs.org installer. The repo requires Node ≥ 24 (`engines`, `.node-version`). This removed the temporary Vite ^6 override, and tests now run on Vitest 5 and Vite 8.
- 2026-09-30: pnpm 12 blocks dependency build scripts. Only `esbuild` and `supabase` are allowed (`allowBuilds` in `pnpm-workspace.yaml`); `sharp` and `unrs-resolver` are denied.
- 2026-09-30: `packages/shared` exports TypeScript source directly (no build step). Next 16 transpiles workspace packages automatically.
- 2026-09-30: Docker Desktop (WSL 2 backend) installed by the user. Local Supabase analytics are turned off in `supabase/config.toml`, because on Windows the `vector` log collector can't reach the Docker daemon and restart-loops. The only cost is Studio's Logs page. We rejected the alternative, exposing the Docker daemon on tcp://localhost:2375 without TLS, as a security downgrade.
- 2026-09-30: Markdown is excluded from Prettier so the spec and docs keep their hand formatting.
- 2026-09-30: Env layout: root `.env` for scripts, `apps/web/.env.local` for the web app, `supabase/functions/.env` for Edge Functions. Each has a committed `.env.example`.
- 2026-09-30: setlist.fm findings that change Phase 2 (details in `docs/setlistfm-notes.md`):
  - No festival entity in the API; the festival name must be user-entered.
  - A no-match search returns 404.
  - Lineups need pagination and dedupe by MBID.
  - Song count needs an alphabetical tie-break.
  - The month filter has to page through a year's results, newest first.

- 2026-09-30 (Phase 1): RLS testing is pgTAP for the full privacy matrix and the following rules (`supabase/tests/database`), plus a small Vitest smoke suite through supabase-js with real sign-ins (`tests/api`). Both run with `pnpm test:db`; `pnpm test` stays unit-only and needs no Docker.
- 2026-09-30 (Phase 1): Supabase's new publishable and secret keys (`sb_publishable_…` / `sb_secret_…`) instead of the legacy anon and service_role keys. The env names are `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`.
- 2026-09-30 (Phase 1): Email confirmation stays off locally, so sign-up signs you straight in. Decide for the hosted project in Phase 6.
- 2026-09-30 (Phase 1): Privacy details the spec didn't spell out (confirmed by the user):
  - Pending follow requests are visible to the **sender** as well as the receiver. The sender needs this for the "Requested" button and to cancel.
  - An accepted follow row is visible when the viewer can view **either** side. So if a public user follows a private one, that shows on the public user's following list.
  - `artists`, `venues` and `shows` are shared reference data readable by every signed-in user. Clients can't write them; `log_concert` will (Phase 2).
  - A "started following" feed item stays after an unfollow.
  - Signed-out visitors (anon) get no table access at all, only `is_username_available` for the sign-up form.
- 2026-09-30 (Phase 1): Grants are deny-by-default. Tables in `public` get explicit grants to `authenticated` only, with column-level UPDATE grants:
  - a log's owner and show can't change after saving
  - only the followee can set a follow's status
  - follow status is set by a trigger, never by the client

  Every public function revokes PUBLIC execute; Postgres grants it by default, and our first version of `can_view` was callable by anon because of it (caught by a test). A guard test now checks this.
- 2026-09-30 (Phase 1): Limits not in the spec:
  - Display names are 1–50 characters.
  - Passwords need at least 8 characters, in both `supabase/config.toml` and the shared Zod schema.
  - Usernames are checked case-insensitively (citext).
- 2026-09-30: Phase 1 accepted with the "Stats and leaderboards" privacy row deferred to Phase 4. Editing profile details and deleting an account go in Phase 5.
- 2026-09-30 (Phase 1): The auth site URL is `http://localhost:3000`. The web theme now uses the exact mockup colors. Error red (#ff7a7a) isn't in the mockups.

- 2026-09-30 (Phase 2): Festival search is option 2: a hand-kept festival list plus a plain venue-name search fallback. Each list entry holds a venue-name search (catching stage-level venues), a canonical grounds venue to save shows against, and a date rule. Details in `docs/setlistfm-notes.md` ("Phase 2 update").
- 2026-09-30 (Phase 2): Concert search results don't show an artist count, unlike the mockup. It would cost one setlist.fm request per result; the count shows on the lineup step. Festival days keep exact counts, which cost a few seconds per search, with a loading message and a 10-minute in-memory cache.
- 2026-09-30 (Phase 2): Concert search tries the query as an artist name first, then as a venue name if no artist matches.
- 2026-09-30 (Phase 2): The festival name is editable on the details step (pre-filled from the festival list, or from the search text for unlisted festivals). Manual entry has an optional festival name field. Neither is in the mockups.
- 2026-09-30 (Phase 2): `log_concert` matching rules:
  - setlist.fm venues match by setlist.fm ID; manual venues by name + city + state, ignoring case.
  - setlist.fm artists match by MusicBrainz ID; manual artists by name, preferring a setlist.fm artist.
  - A setlist.fm venue or artist adopts a manually entered twin rather than duplicating it.
  - Manual logs ignore any setlist.fm IDs or links sent.
  - Only `https://www.setlist.fm/...` links are stored.
  - Shows from 1960 to today only.
  - Duplicates raise `23505 already_logged` with the existing log's id in DETAIL.
- 2026-09-30 (Phase 2): The Edge Function checks the caller's session itself (`auth.getClaims`) with `verify_jwt = false`, because the gateway's check only knows the legacy JWT secret.
- 2026-09-30 (Phase 2): The lineup editor uses dnd-kit (`@dnd-kit/core` + `sortable`) for accessible drag and drop, with the mockup's up arrows as well.
- 2026-09-30 (Phase 2): After saving, the app opens a minimal concert page (`/concerts/[id]`: lineup, rating, price, notes, setlist.fm attribution). Phase 3 adds "Also here", edit and delete.
- 2026-09-30 (Phase 2): A session whose account no longer exists (deleted, or wiped by `db:reset`) is cleared via `/auth/reset-session` instead of looping between the proxy and the pages.
- 2026-09-30 (Phase 2): The header now has an "Add concert" button (the rest of the main nav still arrives with its phases).

- 2026-09-30 (Phase 3): Festival days store their label. A new nullable `shows.festival_day_label` ("Day 3", "Weekend 2 · Day 1") is saved by `log_concert` from the festival search, like `festival_name` (first non-null wins). Log cards show "Bonnaroo · Day 3" as in the mockup; manual festival entries show just the name. Approved by the user.
- 2026-09-30 (Phase 3): Log filters:
  - Month works on its own (e.g. every June) or with a year. Unlike the add-concert search, nothing forces a year first.
  - A city filter always carries its state ("City, ST"), shown as one chip.
  - Year and state dropdowns list only the values in the user's log.
  - Artist search is a case-insensitive substring match on anyone in the lineup.
- 2026-09-30 (Phase 3): Edit is a single page with the lineup editor and the details fields, rather than the add flow's two steps. Venue, date and festival name can't be edited: they belong to the shared show. Edited lineups send existing artists by id and new ones by name (matched like manual entries), and `update_log` replaces the lineup and details in one transaction.
- 2026-09-30 (Phase 3): "Also here" excludes both the viewer and the log's owner. On a friend's log it shows other people you follow who were there.
- 2026-09-30 (Phase 3): Database functions for the log (`user_log`, `log_filter_options`, `also_here`) run as the caller (security invoker), so RLS applies and Phase 5 profiles can reuse them for other users.

**Open questions (to decide):**

_None right now._

## Known issues

- Festival search limits:
  - setlist.fm doesn't have Lollapalooza 2025/2026 under Grant Park, so a no-year Lolla search shows 2024.
  - Outside Lands and Summerfest aren't in the festival list (no reliable filing).
  - A Coachella search takes about 12 s and can report `incomplete`.
- `log_concert` trusts the artist names, MusicBrainz IDs and venue IDs the client sends. A tampered request could create a shared artist with a wrong name for a real ID. Fine for MVP; harden later by having the Edge Function sign the lineups it returns.
- No Playwright end-to-end tests yet. The add-concert and log flows were checked by hand in the browser. Playwright needs a browser download (~hundreds of MB to the user profile), so ask before adding it (suggest Phase 6).
- The concert page's "Log" back link always goes to your own log, even on someone else's concert. Revisit with profiles in Phase 5.
- In the Claude browser pane, the Next dev hot-reload websocket sometimes logs connection errors after server restarts. A direct connection test succeeds, and this is dev-only.
- ESLint 9 is marked deprecated in favour of 10. Stay on 9 until `eslint-config-next` supports 10.
- The Edge Function isn't deployed anywhere yet. For the hosted project (Phase 6): `pnpm supabase functions deploy setlist-search` and `pnpm supabase secrets set SETLISTFM_API_KEY=...`.

- Studio's Logs page is empty locally because analytics are off (see decisions).
- If your root `.env` was copied from the old template, it still has `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`. They're unused. The API smoke tests read `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` and otherwise fall back to `supabase status`.
- A private user's manually entered venue or artist (Phase 2) becomes a shared row every signed-in user can see. It doesn't say who added it, but it reveals that someone logged it. This is probably fine; revisit if it matters.
- The header has no main navigation yet (Log, Stats, Feed, People, Profile and Add concert arrive with their phases). It shows the username and a Settings link.
- The setlist.fm rate limit is undocumented. The second request of a run drew a 429 (AWS API Gateway, no `Retry-After`); retrying after 2 s worked.
- setlist.fm data is crowd-sourced and patchy: many setlists have 0 songs, and Lollapalooza 2023 Saturday shows only 21 artists.
