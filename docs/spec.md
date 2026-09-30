# Music Junkie — MVP Spec

Sep 30, 2026 · @Evan Reynolds

## Overview & MVP scope

Music Junkie is a personal/portfolio app where people log US concerts they attended, see stats about their concert history, and follow friends to see their activity and shared shows. It ships as a web app first, then a React Native mobile app on the same backend.

**In scope**

- Accounts with username, display name, avatar, and a public/private toggle
- Add a concert by searching setlist.fm, with a manual-entry fallback
- Edit the returned lineup before saving: remove artists, reorder (headliner first)
- Festivals logged as one entry per day attended
- Optional per-log fields: rating (0.0–10.0 in 0.1 steps), notes, ticket price (USD)
- Concert log, newest first, with edit and delete
- Log search by artist; filters by year, month, and state
- Personal stats (including total money spent) and leaderboards for artists, venues, cities, and states (most first)
- Follow/unfollow, follow requests for private accounts, user search
- Activity feed of concerts logged and new follows
- Shared history: on a concert, show people you follow who logged the same show

**Out of scope for MVP**

- Upcoming shows, bookmarks, and ticket vendor/price listings
- Shows outside the US
- Notifications of any kind
- Desktop app (the web app covers desktop browsers)
- Commercial features (ads, subscriptions, affiliate links)

## Tech stack & architecture

One TypeScript monorepo holds the web app, the mobile app, and shared code, all talking to one Supabase backend. Supabase gives Postgres, auth, and row-level security (RLS) without running a server, and RLS is where the privacy rules live.

| Layer | Choice | Notes |
| --- | --- | --- |
| Monorepo | pnpm workspaces + Turborepo | `apps/web`, `apps/mobile`, `packages/shared` |
| Web | Next.js (App Router) + Tailwind CSS | Responsive, so it works in desktop and phone browsers |
| Mobile | Expo (React Native) + Expo Router | Built after the web app reaches feature parity |
| Shared code | `packages/shared` | Types, Zod validation schemas, API client, formatting helpers (rating, price, dates) |
| Database & auth | Supabase (Postgres + Supabase Auth) | Email/password sign-in for MVP |
| Privacy enforcement | Postgres RLS policies | Private data is filtered in the database, not only in the UI |
| Server logic | Supabase Edge Functions + Postgres functions (RPC) | setlist.fm proxy, stats, feed queries |
| External data | setlist.fm REST API | Key stays server-side in the Edge Function |
| Testing | Vitest (shared + web), Playwright (web end-to-end) | RLS policies get their own tests |

The setlist.fm API key must never ship in the web or mobile bundle, so both clients call the `setlist-search` Edge Function, which calls setlist.fm.

Architecture: web app and mobile app → packages/shared → Supabase (Auth, Postgres with RLS, `setlist-search` Edge Function) → setlist.fm REST API.

Web and mobile share one package and one backend; the setlist.fm key never leaves the Edge Function.

## Data source: setlist.fm

setlist.fm is the only external data source for MVP, used through its free non-commercial API key. Its data is crowd-sourced, so every search result is a starting point the user confirms and edits, with manual entry when a show is missing.

**How a lineup is assembled**

setlist.fm stores one setlist per artist per show, with no billing order. The Edge Function builds a lineup like this:

1. The user searches by artist, venue, or festival name, optionally narrowed by month, year, or state. The API filters by year and exact date but not by month, so the Edge Function requests the year and filters to the month itself (`countryCode=US` is always set).
2. The user picks one result (artist, venue, city, state, date).
3. The function fetches every setlist at that venue ID on that date. Together those artists are the lineup.
4. Default order: the artist the user searched for first, then the rest by song count, most first (headliners usually play longest). The user fixes the order by dragging.

**Festivals**

Each festival day is its own log entry, so a festival search returns one result per day. The user picks the day they attended and gets that day's artists to trim. How setlist.fm records festivals (festival name as the venue, as a tour name, or per stage) needs a hands-on check before building; see the Phase 0 spike in the build plan.

**Terms to respect**

- Non-commercial use only on the free key. Revisit if the app ever makes money.
- Show a followable "Data from setlist.fm" link on any screen showing setlist.fm results, and on saved concerts that came from it.
- Don't mirror setlist.fm. Store only what the user confirmed in a log (their lineup, the venue, the date) plus the setlist.fm IDs and URL. Search results are not saved.
- Check the current rate limits in the setlist.fm API docs and debounce search input so typing doesn't fire a request per keystroke.

**Manual entry fallback**

If a show isn't on setlist.fm, the user types the artists, venue name, city, state (dropdown of US states), and date. Manual artists and venues are matched to existing rows by case-insensitive name (plus city and state for venues) before new ones are created, so stats don't double-count.

## Data model

The key idea is splitting a **show** (a venue on a date, shared by everyone who attended) from a **concert log** (one user's attendance, with their own lineup, rating, notes, and price). Shared history is then just "other logs pointing at the same show."

**profiles** (one per auth user)

| Column | Type | Rules |
| --- | --- | --- |
| id | uuid, PK | Same as `auth.users.id` |
| username | citext | Unique, 3–30 chars, letters/numbers/underscore |
| display\_name | text | Required |
| avatar\_url | text | Optional; Supabase Storage |
| is\_private | boolean | Default `true` |
| created\_at | timestamptz | Default now() |

**artists**

| Column | Type | Rules |
| --- | --- | --- |
| id | uuid, PK | |
| name | text | Required |
| mbid | text | MusicBrainz ID from setlist.fm; unique when present, null for manual |
| setlistfm\_url | text | Optional |

**venues**

| Column | Type | Rules |
| --- | --- | --- |
| id | uuid, PK | |
| name | text | Required |
| city | text | Required |
| state | char(2) | US state code, e.g. `TN` |
| setlistfm\_venue\_id | text | Unique when present, null for manual |

**shows** (a venue on a date; one row per festival day)

| Column | Type | Rules |
| --- | --- | --- |
| id | uuid, PK | |
| venue\_id | uuid, FK → venues | Required |
| date | date | Required |
| festival\_name | text | Set for festival days, null otherwise |
| setlistfm\_url | text | Optional, for attribution |
| — | — | Unique on (venue\_id, date) |

**concert\_logs** (a user's attendance at a show)

| Column | Type | Rules |
| --- | --- | --- |
| id | uuid, PK | |
| user\_id | uuid, FK → profiles | Required |
| show\_id | uuid, FK → shows | Required; unique on (user\_id, show\_id) |
| rating\_tenths | smallint | Optional; 0–100 (stored ×10 to avoid float errors; 8.7 → 87) |
| notes | text | Optional; max 5,000 chars |
| ticket\_price\_cents | integer | Optional; ≥ 0; USD |
| source | text | `setlistfm` or `manual` |
| created\_at, updated\_at | timestamptz | |

**log\_artists** (the user's edited lineup)

| Column | Type | Rules |
| --- | --- | --- |
| log\_id | uuid, FK → concert\_logs | On delete cascade |
| artist\_id | uuid, FK → artists | |
| position | smallint | 1 = headliner; unique on (log\_id, position) |
| — | — | PK (log\_id, artist\_id); at least one artist per log |

**follows**

| Column | Type | Rules |
| --- | --- | --- |
| follower\_id | uuid, FK → profiles | |
| followee\_id | uuid, FK → profiles | Can't equal follower\_id |
| status | text | `pending` or `accepted` |
| created\_at, accepted\_at | timestamptz | |
| — | — | PK (follower\_id, followee\_id) |

**activities** (feed events)

| Column | Type | Rules |
| --- | --- | --- |
| id | uuid, PK | |
| actor\_id | uuid, FK → profiles | Who did it |
| type | text | `concert_logged` or `follow_started` |
| log\_id | uuid, FK → concert\_logs | For `concert_logged`; on delete cascade |
| target\_user\_id | uuid, FK → profiles | For `follow_started` |
| created\_at | timestamptz | |

Activities are written by database triggers (on log insert, and on follow becoming `accepted`) so the clients can't forget to create them. Deleting a log removes its feed item through the cascade.

## Features & screen flows

The app has five main tabs (Log, Stats, Feed, People, Profile) plus an always-visible **Add concert** button. On web these sit in a top nav; on mobile, a bottom tab bar.

**Add concert flow**

1. **Search.** One search box with a toggle: Concert or Festival. Optional filters, all dropdowns: month (January–December), year (current year back to 1960), and state. Month can only be picked once a year is set. Results show headliner/festival name, venue, city, state, and date. A "Can't find it? Add manually" link is always visible.
2. **Pick a result.** Festival results list each day separately.
3. **Edit lineup.** The full lineup appears as a list. Each row has a drag handle (reorder) and a remove button. The top row is labeled Headliner. The user can also add an artist by name. At least one artist is required to continue.
4. **Details (all optional).** Rating slider 0.0–10.0 in 0.1 steps with a numeric input beside it and a clear button (no rating ≠ 0.0). Ticket price in USD. Notes.
5. **Save.** Blocked if the user already logged this show; offer to open the existing log instead. On success, go to the new concert's detail page.

**Log (home)**

- Concert cards, newest show date first: headliner, then "with" and up to two supporting acts in lineup order (plus "+ N more" beyond that, e.g. "with Doechii, Clairo + 16 more"), festival name if any, venue, city/state, date, rating if set.
- Search box filtering by artist name (matches anyone in the lineup, not just the headliner).
- Filters: year, month, state dropdowns, plus venue and city filters set by tapping a leaderboard row. Filters combine; active ones show as removable chips.
- Empty state points to Add concert.

**Concert detail**

- Full lineup in the user's order, venue, city/state, date, rating, price, notes, setlist.fm link when applicable.
- **Also here:** avatars of people the viewer follows (accepted) who logged the same show. Hidden when there are none.
- Owner actions: Edit (same lineup and details editors as the add flow; venue/date aren't editable, delete and re-add instead) and Delete (confirm dialog).

**Stats**

- Five headline numbers: concerts, artists, venues, cities, states. Below them, a Money spent card with total spent and how many concerts it covers, then a By year section with two bar charts: concerts per year and spend per year (see Stats definitions).
- **Leaderboards:** four tabs (Artists, Venues, Cities, States), each listing every item with its count, most first, ties broken alphabetically. Tapping a row opens the Log filtered to it.

**Feed**

- Reverse-chronological activity from the user and people they follow: "Sam logged Phoebe Bridgers at Ryman Auditorium" and "Sam started following Alex."
- Concert items open the concert detail. Infinite scroll, 20 items per page.

**People**

- Search users by username or display name. Results show a Follow / Requested / Following button.

**Profile**

- Own profile: avatar, names, stats summary, their log, Edit profile, pending follow requests (accept/decline).
- Another user's profile: if public or you're an accepted follower, their stats and log (read-only, with the same filters). If private and you're not, only avatar, names, and a lock message with the Follow button.

**Settings**

- Edit username, display name, avatar. Public/private toggle. Sign out. Delete account (removes all their data).

## Privacy & social rules

One rule decides almost everything: a viewer can see a user's logs, stats, and activity if the viewer **is** that user, the user is **public**, or the viewer is an **accepted follower**. Implement it once as a Postgres function, `can_view(viewer_id, owner_id)`, and use it in every RLS policy.

| Data | Who can see it |
| --- | --- |
| Username, display name, avatar | Every signed-in user (so people can be found and followed) |
| Concert logs, lineups, ratings, notes, prices | `can_view` is true |
| Stats and leaderboards | `can_view` is true |
| Feed items | `can_view` on the actor is true |
| Follower / following lists | `can_view` is true |
| Pending follow requests | Only the person receiving them |

**Following**

- Following a public account is accepted immediately. Following a private account creates a `pending` request.
- The receiver accepts (status → `accepted`) or declines (row deleted). The requester can cancel a pending request.
- Unfollowing deletes the row. Users can also remove one of their own followers.
- Switching private → public auto-accepts all pending requests. Switching public → private keeps existing followers.
- Signed-out visitors see nothing but the sign-in page.

**Feed contents**

The viewer's own activity plus activity from accounts they follow with status `accepted`. A "started following" item appears once the follow is accepted.

**Shared history ("Also here")**

On a concert detail page, list users who (1) have a log with the same `show_id` and (2) the viewer follows with status `accepted`. Nobody is notified. Because matching uses `show_id`, manual entries only match if they resolve to the same venue and date, which is why venue matching in manual entry matters.

**Not in MVP:** blocking, reporting, muting.

## Stats definitions

All stats are computed live from a user's logs by one Postgres function, `user_stats(user_id)`, and one for all four leaderboards, `leaderboard(user_id, kind)`. Both respect `can_view`. Counting rules:

| Stat | Definition |
| --- | --- |
| Concerts | Number of concert logs. A 3-day festival attended all 3 days counts as 3. |
| Artists | Distinct artists across all the user's lineups (after their edits) |
| Venues | Distinct venues across their logs |
| Cities | Distinct (city, state) pairs, so Portland, OR and Portland, ME count as two. Anywhere a city appears in the app, it's shown as "City, ST" (e.g. Nashville, TN). |
| States | Distinct state codes |
| Total spent | Sum of `ticket_price_cents` across logs that have a price, shown in USD. Logs without a price are skipped, not counted as $0. Shown with its coverage, e.g. "$1,240 across 18 of 25 concerts." Hidden when no log has a price. |
| Concerts per year | Logs grouped by the calendar year of the show date. Bar chart from the user's earliest year to the current year, with empty years shown as 0. |
| Spend per year | Total spent grouped the same way, priced logs only. Each bar's tooltip shows its coverage, e.g. "$310 across 4 of 6 concerts." Hidden when no log has a price. |
| Leaderboards | Kind is artist, venue, city, or state. Artist: logs whose lineup includes them. Venue: logs at that venue. City: logs in that (city, state), always displayed with its state code, e.g. "Nashville, TN". State: logs in that state. Sorted by count descending, then name A–Z. |

The artist leaderboard counts appearances in the user's saved lineup, so an artist the user removed from a show doesn't count for that show.

## Phased build plan for Claude Code

Mockups of the key screens are finished and approved before Phase 0 starts; save them in the repo under `docs/mockups/` next to this spec. Then build in eight phases, one Claude Code session (or a few) per phase, and don't start a phase until the previous one's "done when" is true. Save this spec in the repo as `docs/spec.md` and reference it from `CLAUDE.md` so every session starts with it.

1. **Phase 0: Setup and setlist.fm spike**
   - Scaffold the monorepo (pnpm, Turborepo, `apps/web`, `packages/shared`), Supabase project, env files, lint and format.
   - Write a throwaway script that queries setlist.fm for: a normal multi-artist show, a festival day, a small club show, and a show that probably isn't there. Record how festivals, venues, and dates come back in `docs/setlistfm-notes.md`.
   - Done when: the web app runs locally and the notes answer how to find a festival day's full lineup.
2. **Phase 1: Schema, privacy, and auth**
   - Migrations for every table in the data model, `can_view`, all RLS policies, activity triggers, and seed data (3 users: public, private, private-with-follower).
   - Sign up, sign in, sign out, profile creation, settings page with the privacy toggle.
   - Done when: automated tests prove each row of the privacy table for all 3 seed users.
3. **Phase 2: Add concert**
   - `setlist-search` Edge Function (search + lineup assembly + default ordering).
   - Search screen, lineup editor (drag to reorder, remove, add), details step, manual entry.
   - Save through one Postgres function, `log_concert`, that creates or matches venue, artists, and show and writes the log and lineup in a single transaction.
   - Done when: a user can log a setlist.fm concert, a festival day, and a manual concert, and a duplicate log is blocked.
4. **Phase 3: Log and concert detail**
   - Log list (newest first, 20 per page), artist search, year/month/state filters, detail page, edit, delete.
   - Done when: filters combine correctly and edits to a lineup show up everywhere.
5. **Phase 4: Stats**
   - `user_stats` and `leaderboard` functions, Stats screen, four leaderboards (artists, venues, cities, states) linking to a filtered log, and a stats\_by\_year function feeding the two by-year charts.
   - Done when: stats match hand-counted seed data, including the Portland, OR / Portland, ME case.
6. **Phase 5: Social**
   - People search, follow/unfollow, requests (send, cancel, accept, decline), other users' profiles with the locked state, feed, "Also here."
   - Done when: two test accounts can go through every following rule and see the right things at each step.
7. **Phase 6: Web polish and deploy**
   - Loading, empty, and error states; keyboard and screen reader checks; phone-width layout; setlist.fm attribution everywhere it's needed.
   - Deploy web to Vercel against the hosted Supabase project.
8. **Phase 7: Mobile app**
   - `apps/mobile` with Expo Router, reusing `packages/shared`; same screens and flows as web, bottom tab navigation.
   - Done when: every web flow works on iOS and Android simulators against the same backend.

## Assumptions & decisions

All assumptions below are confirmed, and the earlier open questions are settled.

**Assumptions**

- New accounts start private. Flip `is_private` default to `false` if you'd rather start public.
- Email/password sign-in only for MVP.
- Ticket price is what the user paid for one ticket, fees included, in USD.
- A rating of 0.0 is a real rating; no rating is stored as null and shown as blank.
- A venue and date can't be edited after saving; users delete and re-add instead, which keeps shared-history matching simple.
- Two shows at one venue on one date (early and late shows) are treated as one show.
- Deleting an account deletes all of that user's logs, follows, and activity.

**Decisions**

- No Apple or Google sign-in for now; email/password only, including on mobile.
- The app is called **Music Junkie**. Visual mockups come before any building.
- Concerts per year and spend per year are added to Stats.
