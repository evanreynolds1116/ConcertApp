# Progress

**Current phase:** Phase 1 built and tested; waiting on one sign-off (stats row, below). Next up: Phase 2.
**Last updated:** 2026-09-30

## Next step

1. Confirm the Phase 1 sign-off question under "Open questions" (the "Stats and leaderboards" privacy row is tested in Phase 4).
2. Decide the festival search approach (open question).
3. Start Phase 2:
   - the `setlist-search` Edge Function: search, lineup assembly, default ordering, month filter. Use the findings in `docs/setlistfm-notes.md`.
   - the `log_concert` function, written in the `private`/`public` grant style from Phase 1
   - the add-concert screens

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
- [ ] Done when: automated tests prove each row of the privacy table for all 3 seed users. **Met for every row except "Stats and leaderboards"**, whose functions don't exist until Phase 4 (see open questions). `pnpm test:db` runs 107 pgTAP assertions and 9 API smoke tests. A deliberately broken `can_view` makes 13 of them fail.

## Phase 2: Add concert

- [ ] `setlist-search` Edge Function (search, lineup assembly, default ordering, month filtering)
- [ ] Search screen with Concert/Festival toggle and month/year/state dropdowns
- [ ] Lineup editor (reorder, remove, add)
- [ ] Details step (rating, ticket price, notes)
- [ ] Manual entry
- [ ] `log_concert` Postgres function (single transaction)
- [ ] Done when: a setlist.fm concert, a festival day and a manual concert can each be logged, and a duplicate log is blocked

## Phase 3: Log and concert detail

- [ ] Log list, newest first, 20 per page, cards show headliner + up to two supporting acts
- [ ] Artist search and year/month/state filters
- [ ] Concert detail page with "Also here"
- [ ] Edit and delete
- [ ] Done when: filters combine correctly and lineup edits show up everywhere

## Phase 4: Stats

- [ ] `user_stats`, `leaderboard` and `stats_by_year` functions
- [ ] Stats screen: five counts, money spent card, concerts per year and spend per year charts
- [ ] Leaderboards: artists, venues, cities, states, each linking to a filtered log
- [ ] Done when: stats match hand-counted seed data, including the Portland, OR / Portland, ME case

## Phase 5: Social

- [ ] People search
- [ ] Follow / unfollow; requests (send, cancel, accept, decline)
- [ ] Other users' profiles, including the locked private view
- [ ] Activity feed
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
- 2026-09-30 (Phase 1): Privacy details the spec didn't spell out:
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
- 2026-09-30 (Phase 1): The auth site URL is `http://localhost:3000`. The web theme now uses the exact mockup colors. Error red (#ff7a7a) isn't in the mockups.

**Open questions (to decide):**

- **Phase 1 sign-off: the "Stats and leaderboards" privacy row.** The `user_stats`, `leaderboard` and `stats_by_year` functions are Phase 4 work, so that row can't be tested yet. Proposal:
  - Accept Phase 1 as done now.
  - In Phase 4, write those functions as `security invoker` (so they read through these RLS policies), or have them check `can_view` explicitly.
  - Add their rows to the privacy matrix test then.
- **Settings items with no phase.** The spec's Settings section also lists editing username, display name and avatar, and deleting an account. Only the privacy toggle is in Phase 1's checklist, and none of these appear in a later phase. Suggest Phase 5 (alongside profiles) or Phase 6. Account deletion already cascades correctly in the database (tested).

- **Festival search (before Phase 2).** Two options:
  - Search `venueName=<festival name>` only, grouping results per day, and suggest searching the grounds (e.g. "Grant Park") when nothing matches.
  - Also keep a small hand-maintained map of major US festivals to their grounds venue IDs.

  "Lollapalooza" finds nothing by name; "Bonnaroo" works.

## Known issues

- Studio's Logs page is empty locally because analytics are off (see decisions).
- If your root `.env` was copied from the old template, it still has `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`. They're unused. The API smoke tests read `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` and otherwise fall back to `supabase status`.
- A private user's manually entered venue or artist (Phase 2) becomes a shared row every signed-in user can see. It doesn't say who added it, but it reveals that someone logged it. This is probably fine; revisit if it matters.
- The header has no main navigation yet (Log, Stats, Feed, People, Profile and Add concert arrive with their phases). It shows the username and a Settings link.
- The setlist.fm rate limit is undocumented. The second request of a run drew a 429 (AWS API Gateway, no `Retry-After`); retrying after 2 s worked.
- setlist.fm data is crowd-sourced and patchy: many setlists have 0 songs, and Lollapalooza 2023 Saturday shows only 21 artists.
