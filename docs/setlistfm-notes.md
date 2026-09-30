# setlist.fm spike notes (Phase 0)

Findings from `scripts/setlistfm-spike.ts`, run on 2026-09-30 against the live API (`https://api.setlist.fm/rest/1.0`, JSON, `x-api-key` header). Re-run with `pnpm spike:setlistfm [multi|festival|club|none]`; raw responses land in `scripts/.spike-output/` (git-ignored).

Cases run:

| Case | Query | Result |
| --- | --- | --- |
| Multi-artist show | boygenius, 2023, US → Hollywood Bowl, Los Angeles, CA, 31-10-2023 | 3 setlists: boygenius (25 songs), 100 gecs (12), Sloppy Jane (5) |
| Festival day | Bonnaroo 2024 → Great Stage Park, Manchester, TN, 16-06-2024 | 35 setlists over 2 pages; 15 of them have 0 songs |
| Festival (comparison) | Lollapalooza 2023 → Grant Park, Chicago, IL, 05-08-2023 | 21 setlists; "Lollapalooza" itself matches nothing |
| Small club show | The Basement East, Nashville, TN, 17-09-2026 | 3 setlists (Shakey Graves, Langhorne Slim, Futurebirds), all 0 songs |
| No results | made-up artist; real artist in 1975; made-up venue | HTTP 404 every time |

## The festival question: how to get a festival day's full lineup

**The API has no festival entity.** There is no festival endpoint, no festival field on a setlist, and the festival name appears nowhere in the returned data. Setlists at a festival are ordinary setlists whose venue is the festival grounds:

- Bonnaroo → venue "Great Stage Park", Manchester, TN (`2bd6181e`)
- Lollapalooza → venue "Grant Park", Chicago, IL (`53d6cfdd`)

`tour.name` is each artist's own tour ("Hot Girl Summer Tour", "The Midwest Princess Tour", "Live 2024"), not the festival. `tourName=Bonnaroo` and `artistName=Bonnaroo` both return 404.

**A festival day's full lineup = every setlist at the grounds' venue ID on that date**, which is exactly the spec's normal lineup assembly (`search/setlists?venueId=…&date=dd-MM-yyyy`, all pages). For Bonnaroo 2024 every stage is filed under the one Great Stage Park venue: the date search by venue name returned the same 35 setlists as the venue ID search, all with one venue ID. setlist.fm also has per-stage venues (What Stage, This Tent, …, and "Crossroads Stage Grant Park" etc. in Chicago), but the What Stage venue has no setlists at all, so per-stage venues look like leftovers rather than how festivals are filed now. The Edge Function should still merge by date across all venue IDs a festival search returns, in case a festival files some stages separately.

**Finding the festival from its name is unreliable:**

- `venueName=Bonnaroo` works: it returns Great Stage Park setlists (183 for 2024), even though "Bonnaroo" isn't in the venue's name. Presumably setlist.fm matches a venue alias or its festival pages on the server side, but that isn't exposed.
- `venueName=Lollapalooza` returns 404. You only find it by searching "Grant Park".

**Festival days vs. other events at the grounds:** the full Bonnaroo 2024 year returns 11-06 (4 setlists), 12-06 (8), 13-06 (43), 14-06 (47), 15-06 (46) and 16-06 (35). The festival ran 13–16 June. The small counts on 11–12 June are other events, so grouping by date with a setlist count makes the real festival days obvious to the user.

**Implication for Phase 2 (Festival toggle):**

1. Search `venueName=<term>`, plus `year`/`stateCode` when set.
2. Group the results by (venue ID, date) into one result per day, showing the venue, "City, ST", the date and the number of artists.
3. `shows.festival_name` has to come from the user, not the API. Pre-fill it with their search term, and let them edit it on the details step.
4. When a name search finds nothing, suggest searching for the grounds instead ("Try the venue name, e.g. Grant Park").

**Decision needed before Phase 2:** is that enough, or do we also want a small hand-maintained map of major US festival names to their grounds venue IDs (e.g. Lollapalooza → Grant Park)? See PROGRESS.md.

## Venues, cities and states (US)

- `venue.id` is a short hex string, and not always 8 characters: `bd6c9f6` is 7. Store it as text.
- `venue.name` is the venue only; there's no separate address.
- `venue.city`:
  - `name`: "Manchester"
  - `stateCode`: "TN", the 2-letter USPS code for every US venue we saw, so it maps straight onto `venues.state char(2)`
  - `state`: "Tennessee"
  - `country.code`: "US"
  - `id` (GeoNames ID) and `coords`
- The docs say a venue may have no city at all (then the city may be in the name). The spike didn't hit one. The Edge Function should skip results with no city or with `country.code !== "US"`.
- `venue.url` is a setlist.fm page usable for attribution.
- Venue search: `search/venues?name=…&cityName=…&countryCode=US`. `GET /venue/{id}/setlists` lists a venue's setlists newest first.

## Dates

- `eventDate` is a `dd-MM-yyyy` string with no time or time zone, e.g. `"16-06-2024"`. The `date` search parameter takes the same format. Convert to ISO `yyyy-MM-dd` at the Edge Function boundary; don't parse it with `new Date()`.
- `lastUpdated` is an ISO timestamp (`2024-02-20T…+0000`), the last time anyone edited the setlist.
- **There is no month filter** (confirmed in the docs), and no date range filter.
- Search results come back **newest date first**, 20 per page (`itemsPerPage` is fixed, `p` is the page, `total` is given). So the month filter can page through the year and stop once results are older than the month. That's cheaper than fetching the whole year: Bonnaroo 2024 alone is 10 pages.
- setlist.fm has setlists for shows only days old (the club case found 29-09-2026 entries the day after), and shows may be listed ahead of time. Filter out `eventDate > today`, since upcoming shows are out of scope.

## Song counts and default lineup order

- Songs live at `sets.set[].song[]`. The docs example shows `set` at the top level, but the **live API nests it under `sets`**.
- Songs with `"tape": true` are intro or outro music played from a recording (e.g. boygenius' Thin Lizzy intro) and shouldn't count. Covers carry a `cover` object and do count.
- **Song counts are available, but they're a weak ordering signal:**
  - **Zero-song entries are common.** On the Bonnaroo day, 15 of 35 setlists had 0 songs; on the Basement East night all 3 did. Many were created weeks ahead from the announced lineup (updated in April for a June date), so a 0-song entry can even be an act that cancelled.
  - **Ties:** Megan Thee Stallion and Fred again.. both had 19 songs.
  - **DJ sets inflate counts:** Bonnie X Clyde (25 songs) outranked Pusha T (20) at Lollapalooza.
  - It works fine for ordinary shows: boygenius 25 → 100 gecs 12 → Sloppy Jane 5 is the real billing.
- The API's own order is not billing order (it looks arbitrary), so it's no use as a tie-break.
- **Suggested default order:**
  1. The artist the user searched for.
  2. Everyone else by song count, most first.
  3. Ties (including all the zeros) alphabetical, so the order is at least stable.

  This stays as the spec describes. The user drags to fix the rest.
- **Same artist twice on one date:** boygenius has two setlists at SNL on 11-11-2023 (dress rehearsal and live broadcast). Dedupe the lineup by artist MBID. This also matches the spec's "early and late shows are one show" assumption.
- Every artist seen had an `mbid` and an `artist.url`.

## No results, errors and rate limits

- **"No results" is an HTTP 404** with a JSON error body (`{"code":404,"status":"Not Found","message":"not found",…}`), not a 200 with an empty list. This held for setlist searches and venue searches. The Edge Function must map 404 to an empty result, not an error.
- Rate limits aren't in the public docs and the API sends no rate-limit headers.
  - In both runs the **second request drew a 429** even with 0.7–1 s between calls. After that, 30+ requests at 1/s went through.
  - The 429 comes from AWS API Gateway (`x-amzn-errortype: TooManyRequestsException`) with no `Retry-After`. A 2 s backoff and retry worked.
  - Assume a small burst allowance and roughly 1–2 requests per second.
- **Cost per add-concert flow:** 1 search request, plus 1–3 lineup pages (a festival day is 2–3). Keep debouncing search input, and consider short-lived caching of lineup lookups in the Edge Function. Caching here means within a request or briefly in memory, not stored, so we don't mirror setlist.fm.

## Where the real data contradicts or sharpens the spec

1. **Festivals (spec: "festival name as the venue, as a tour name, or per stage").**
   - It's none of those, exactly. The venue is the *grounds*, found through the festival name only when setlist.fm has an alias.
   - The tour name is never the festival.
   - Stages are not separate venues, at least for Bonnaroo.
   - The festival name isn't in the data, so `festival_name` must be user-entered.
2. **Venue leaderboards will show grounds names:** "Great Stage Park, Manchester, TN", not "Bonnaroo". That's accurate, but worth knowing when we design the Stats and Log cards. The festival name on the card comes from `shows.festival_name`.
3. **Default ordering by song count** needs a tie-break and will often put the headliner below openers when the headliner's setlist hasn't been entered yet. It still works as a default because the user reorders.
4. **Lineup assembly needs pagination and dedupe:** 20 setlists per page, and the same artist can appear twice on a date. The spec's step 3 doesn't mention either.
5. **Month filtering costs requests:** it may need several pages per search. Paging newest-first and stopping early keeps it bounded.
6. **A no-match search is a 404**, not an empty 200.
