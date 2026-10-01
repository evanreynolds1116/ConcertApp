-- Phase 4: stats match hand-counted seed data, and respect privacy (the "Stats and
-- leaderboards: can_view" row of the privacy table, deferred from Phase 1).
--
-- Hand counts from supabase/seed.sql. Logs you added while using the app are deleted inside
-- this test's transaction (and come back on rollback), so only the seed logs are counted.
--
-- pat (public):
--   2022-05-14  Crystal Ballroom, Portland, OR    The Local Openers                    $0
--   2022-08-20  State Theatre, Portland, ME       Langhorne Slim                        (no price)
--   2023-10-31  Hollywood Bowl, Los Angeles, CA   boygenius, 100 gecs, Sloppy Jane      $85
--   2024-06-16  Great Stage Park, Manchester, TN  Fred again.., Megan Thee Stallion,
--                                                 Chappell Roan (Bonnaroo)             $350
--   => 4 concerts, 8 artists, 4 venues, 4 cities (two Portlands), 4 states,
--      $435 across 3 of 4 concerts ($0 is a real price; "no price" is skipped)
-- fran (private, pat follows):
--   2022-05-14  Crystal Ballroom, Portland, OR    The Local Openers                     (no price)
--   2024-06-16  Great Stage Park, Manchester, TN  Chappell Roan, Megan Thee Stallion   $340
--   2026-09-17  The Basement East, Nashville, TN  Shakey Graves, Langhorne Slim         $32
--   => 3 concerts, 5 artists, 3 venues, 3 cities, 2 states (TN twice), $372 across 2 of 3

begin;
\ir _helpers.psql
select plan(19);

-- Only the seed logs.
delete from public.concert_logs where id::text not like '10000000-0000-4000-a000-00000000000_';

-- ---------------------------------------------------------------------------------------------
-- pat's own stats
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('pat');
select results_eq(
  $$ select concerts, artists, venues, cities, states, spent_cents, priced_concerts, first_show from public.user_stats(pg_temp.uid('pat')) $$,
  $$ values (4, 8, 4, 4, 4, 43500::bigint, 3, '2022-05-14'::date) $$,
  'pat: 4 concerts, 8 artists, 4 venues, 4 cities (Portland, OR and Portland, ME), 4 states, $435 across 3 of 4'
);
select results_eq(
  $$ select year, concerts, spent_cents, priced_concerts from public.stats_by_year(pg_temp.uid('pat')) $$,
  $$ values (2022, 2, 0::bigint, 1), (2023, 1, 8500::bigint, 1), (2024, 1, 35000::bigint, 1),
            (2025, 0, 0::bigint, 0), (2026, 0, 0::bigint, 0) $$,
  'pat by year: earliest year to this year, empty years as 0; the $0 ticket is priced, the unpriced show isn''t'
);
select results_eq(
  $$ select name, city, state, concerts from public.leaderboard(pg_temp.uid('pat'), 'city') $$,
  $$ values ('Los Angeles', 'Los Angeles', 'CA', 1), ('Manchester', 'Manchester', 'TN', 1),
            ('Portland', 'Portland', 'ME', 1), ('Portland', 'Portland', 'OR', 1) $$,
  'city leaderboard: Portland, ME and Portland, OR are separate rows; ties A-Z'
);
select results_eq(
  $$ select name, concerts from public.leaderboard(pg_temp.uid('pat'), 'artist') $$,
  $$ values ('100 gecs', 1), ('boygenius', 1), ('Chappell Roan', 1), ('Fred again..', 1),
            ('Langhorne Slim', 1), ('Megan Thee Stallion', 1), ('Sloppy Jane', 1), ('The Local Openers', 1) $$,
  'artist leaderboard: every artist, ties A-Z ignoring case'
);
select results_eq(
  $$ select name, city, state, concerts from public.leaderboard(pg_temp.uid('pat'), 'venue') $$,
  $$ values ('Crystal Ballroom', 'Portland', 'OR', 1), ('Great Stage Park', 'Manchester', 'TN', 1),
            ('Hollywood Bowl', 'Los Angeles', 'CA', 1), ('State Theatre', 'Portland', 'ME', 1) $$,
  'venue leaderboard with each venue''s City, ST'
);
select ok((select bool_and(item_id is not null) from public.leaderboard(pg_temp.uid('pat'), 'venue')),
  'venue rows carry the venue id for links to the filtered log');
select results_eq(
  $$ select name, concerts from public.leaderboard(pg_temp.uid('pat'), 'state') $$,
  $$ values ('CA', 1), ('ME', 1), ('OR', 1), ('TN', 1) $$,
  'state leaderboard'
);

-- ---------------------------------------------------------------------------------------------
-- fran, seen by pat (accepted follower): counts and most-first ordering
-- ---------------------------------------------------------------------------------------------
select results_eq(
  $$ select concerts, artists, venues, cities, states, spent_cents, priced_concerts from public.user_stats(pg_temp.uid('fran')) $$,
  $$ values (3, 5, 3, 3, 2, 37200::bigint, 2) $$,
  'fran (seen by her follower pat): 3 concerts, 5 artists, 3 venues, 3 cities, 2 states, $372 across 2 of 3'
);
select results_eq(
  $$ select name, concerts from public.leaderboard(pg_temp.uid('fran'), 'state') $$,
  $$ values ('TN', 2), ('OR', 1) $$,
  'leaderboards sort by count, most first'
);
select results_eq(
  $$ select name, state, concerts from public.leaderboard(pg_temp.uid('fran'), 'city') $$,
  $$ values ('Manchester', 'TN', 1), ('Nashville', 'TN', 1), ('Portland', 'OR', 1) $$,
  'fran''s cities'
);
select results_eq(
  $$ select year, concerts, spent_cents, priced_concerts from public.stats_by_year(pg_temp.uid('fran')) $$,
  $$ values (2022, 1, 0::bigint, 0), (2023, 0, 0::bigint, 0), (2024, 1, 34000::bigint, 1),
            (2025, 0, 0::bigint, 0), (2026, 1, 3200::bigint, 1) $$,
  'fran by year, with an empty year in the middle'
);

-- Removing an artist from a lineup removes them from that show's counts.
select pg_temp.as_user('fran');
select public.update_log('10000000-0000-4000-a000-000000000007',
  '[{"artistId": "40000000-0000-4000-a000-000000000004"}]', 81::smallint, 3200, null);
select is((select concerts from public.leaderboard(pg_temp.uid('fran'), 'artist') where name = 'Langhorne Slim'), null::integer,
  'an artist removed from a lineup no longer counts for that show');
select is((select artists from public.user_stats(pg_temp.uid('fran'))), 4, 'and the artist count drops');

-- ---------------------------------------------------------------------------------------------
-- Privacy: stats and leaderboards follow can_view
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('priya');
select results_eq(
  $$ select concerts, artists, spent_cents, first_show from public.user_stats(pg_temp.uid('fran')) $$,
  $$ values (0, 0, 0::bigint, null::date) $$,
  'priya (pending request) sees no stats for private fran'
);
select is_empty($$ select * from public.leaderboard(pg_temp.uid('fran'), 'artist') $$, 'nor her leaderboards');
select is_empty($$ select * from public.stats_by_year(pg_temp.uid('fran')) $$, 'nor her stats by year');
select is((select concerts from public.user_stats(pg_temp.uid('pat'))), 4, 'priya sees public pat''s stats');
select throws_ok($$ select * from public.leaderboard('00000000-0000-4000-a000-000000000001', 'genre') $$,
  '22023', null, 'unknown leaderboard kinds are rejected');
select pg_temp.as_anon();
select throws_ok($$ select * from public.user_stats('00000000-0000-4000-a000-000000000001') $$,
  '42501', null, 'signed-out visitors can''t see stats');

select * from finish();
rollback;
