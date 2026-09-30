# Progress

**Current phase:** Phase 0 done. Next up: Phase 1.
**Last updated:** 2026-09-30

## Next step

Start Phase 1. Local Supabase is up (`pnpm db:start` works with Docker Desktop). The festival search question under "Decisions made during the build" can wait until Phase 2.

Phase 1 covers migrations for every table in the data model, `can_view` and all RLS policies, activity triggers, seed data for the 3 users, and RLS tests. Pick an RLS test approach first: pgTAP through `supabase test db`, or Vitest against the local API with real signed-in users.

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

- [ ] Migrations for all tables in the data model
- [ ] `can_view` function and all RLS policies
- [ ] Activity triggers
- [ ] Seed data: 3 users (public, private, private-with-follower)
- [ ] Sign up, sign in, sign out, profile creation
- [ ] Settings page with the public/private toggle
- [ ] Done when: automated tests prove each row of the privacy table for all 3 seed users

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

**Open questions (to decide):**

- **Festival search (before Phase 2).** Two options:
  - Search `venueName=<festival name>` only, grouping results per day, and suggest searching the grounds (e.g. "Grant Park") when nothing matches.
  - Also keep a small hand-maintained map of major US festivals to their grounds venue IDs.

  "Lollapalooza" finds nothing by name; "Bonnaroo" works.

## Known issues

- Studio's Logs page is empty locally because analytics are off (see decisions).
- The Supabase CLI now issues new-style keys (`sb_publishable_…` / `sb_secret_…`) alongside the legacy anon and service_role JWTs. The env templates still use the `ANON_KEY` / `SERVICE_ROLE_KEY` names. Decide in Phase 1 which the Supabase client should use, and rename the templates if we switch.
- The setlist.fm rate limit is undocumented. The second request of a run drew a 429 (AWS API Gateway, no `Retry-After`); retrying after 2 s worked.
- setlist.fm data is crowd-sourced and patchy: many setlists have 0 songs, and Lollapalooza 2023 Saturday shows only 21 artists.
