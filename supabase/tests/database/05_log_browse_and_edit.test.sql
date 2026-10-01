-- Phase 3: user_log filters, log_filter_options, update_log, also_here, festival day labels.
-- Uses the seed logs (supabase/seed.sql). pat's four:
--   L1 Hollywood Bowl, Los Angeles, CA   2023-10-31  boygenius, 100 gecs, Sloppy Jane   9.2
--   L2 Crystal Ballroom, Portland, OR    2022-05-14  The Local Openers
--   L3 State Theatre, Portland, ME       2022-08-20  Langhorne Slim                    7.5
--   L4 Great Stage Park, Manchester, TN  2024-06-16  Fred again.., Megan Thee Stallion, Chappell Roan (Bonnaroo, Day 4)
-- priya also logged the Hollywood Bowl show; fran also logged the Bonnaroo day.
-- Tests that write roll back, and user_log calls filter to pat's seed logs by id where it
-- matters, so concerts you logged while using the app don't break this.

begin;
\ir _helpers.psql
select plan(38);

create function pg_temp.log(n int) returns uuid language sql immutable as $$
  select ('10000000-0000-4000-a000-00000000000' || n)::uuid
$$;

-- pat's seed logs only, as "L<n>" in the order user_log returns them.
create function pg_temp.pat_log(
  p_artist text default null, p_year int default null, p_month int default null,
  p_state text default null, p_city text default null, p_venue_id uuid default null,
  p_limit int default 20, p_offset int default 0)
returns text
language sql
as $$
  select coalesce(string_agg('L' || right(log_id::text, 1), ' ' order by ord), '')
  from (
    select log_id, row_number() over () as ord
    from public.user_log('00000000-0000-4000-a000-000000000001', p_artist, p_year, p_month, p_state, p_city, p_venue_id, p_limit, p_offset)
  ) r
  where log_id in (pg_temp.log(1), pg_temp.log(2), pg_temp.log(3), pg_temp.log(4));
$$;

-- ---------------------------------------------------------------------------------------------
-- user_log filters (as pat, on his own log)
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('pat');
select is(pg_temp.pat_log(), 'L4 L1 L3 L2', 'newest show first');
select is(pg_temp.pat_log(p_artist => 'GENIUS'), 'L1', 'artist search: part of a name, any case');
select is(pg_temp.pat_log(p_artist => 'megan'), 'L4', 'artist search matches anyone in the lineup, not just the headliner');
select is(pg_temp.pat_log(p_artist => '  '), 'L4 L1 L3 L2', 'a blank artist search is no filter');
select is(pg_temp.pat_log(p_artist => '%'), '', 'search text is literal, not a pattern');
select is(pg_temp.pat_log(p_year => 2022), 'L3 L2', 'year');
select is(pg_temp.pat_log(p_year => 2022, p_month => 8), 'L3', 'year + month');
select is(pg_temp.pat_log(p_month => 5), 'L2', 'month on its own (any year)');
select is(pg_temp.pat_log(p_state => 'or'), 'L2', 'state, any case');
select is(pg_temp.pat_log(p_city => 'portland', p_state => 'ME'), 'L3', 'city is a "City, ST" pair: Portland, ME');
select is(pg_temp.pat_log(p_city => 'Portland', p_state => 'OR'), 'L2', 'and Portland, OR is a different city');
select is(pg_temp.pat_log(p_venue_id => '20000000-0000-4000-a000-000000000001'), 'L1', 'venue');
select is(pg_temp.pat_log(p_artist => 'langhorne', p_year => 2022, p_state => 'ME'), 'L3', 'filters combine');
select is(pg_temp.pat_log(p_artist => 'langhorne', p_year => 2023), '', 'combined filters can match nothing');
select is(pg_temp.pat_log(p_limit => 2), 'L4 L1', 'pages of a given size');
select is(pg_temp.pat_log(p_limit => 2, p_offset => 2), 'L3 L2', 'and the next page');

select results_eq(
  $$ select artists, festival_name, festival_day_label, city, state, rating_tenths
     from public.user_log('00000000-0000-4000-a000-000000000001') where log_id in (pg_temp.log(1), pg_temp.log(4)) order by show_date $$,
  $$ values (array['boygenius', '100 gecs', 'Sloppy Jane'], null::text, null::text, 'Los Angeles', 'CA', 92::smallint),
            (array['Fred again..', 'Megan Thee Stallion', 'Chappell Roan'], 'Bonnaroo', 'Day 4', 'Manchester', 'TN', 88::smallint) $$,
  'each row carries the lineup in order, festival label, City + ST and rating'
);
select ok((select bool_and(total_count = (select count(*) from public.concert_logs where user_id = pg_temp.uid('pat')))
           from public.user_log(pg_temp.uid('pat'), p_limit => 1)),
  'total_count is the number of matches before paging');

select results_eq(
  $$ select years @> array[2024, 2023, 2022], states @> array['CA', 'ME', 'OR', 'TN'] from public.log_filter_options(pg_temp.uid('pat')) $$,
  $$ values (true, true) $$,
  'filter options list the years and states in the log'
);

-- Privacy: user_log reads through RLS.
select pg_temp.as_user('priya');
select is((select count(*)::int from public.user_log(pg_temp.uid('pat')) where log_id in (pg_temp.log(1), pg_temp.log(2), pg_temp.log(3), pg_temp.log(4))),
  4, 'anyone signed in can browse a public user''s log');
select is((select count(*)::int from public.user_log(pg_temp.uid('fran'))), 0, 'a private log is empty to non-followers');
select is((select cardinality(years) from public.log_filter_options(pg_temp.uid('fran'))), 0, 'and so are its filter options');
select pg_temp.as_user('pat');
select ok((select count(*) from public.user_log(pg_temp.uid('fran'))) > 0, 'an accepted follower can browse a private log');
select pg_temp.as_anon();
select throws_ok($$ select * from public.user_log('00000000-0000-4000-a000-000000000001') $$, '42501', null, 'signed-out visitors can''t browse logs');

-- ---------------------------------------------------------------------------------------------
-- also_here
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('pat');
select is((select string_agg(username, ',') from public.also_here(pg_temp.log(4))), 'fran_followed',
  'pat sees fran (who he follows) at Bonnaroo');
select is((select count(*)::int from public.also_here(pg_temp.log(1))), 0,
  'pat doesn''t see priya at the Hollywood Bowl: he doesn''t follow her');
select is((select count(*)::int from public.also_here(pg_temp.log(8))), 0,
  'on fran''s own log, pat isn''t listed and neither is fran');
select pg_temp.as_user('fran');
select is((select string_agg(username, ',') from public.also_here(pg_temp.log(8))), 'pat_public', 'fran sees pat at Bonnaroo');
select pg_temp.as_user('priya');
select is((select count(*)::int from public.also_here(pg_temp.log(5))), 0, 'priya doesn''t follow pat yet');
insert into public.follows (follower_id, followee_id) values (auth.uid(), pg_temp.uid('pat')); -- public: accepted at once
select is((select string_agg(username, ',') from public.also_here(pg_temp.log(5))), 'pat_public', 'once she follows pat, he shows up');
select is((select count(*)::int from public.also_here(pg_temp.log(4))), 0, 'also_here on a log you can''t see is empty');

-- ---------------------------------------------------------------------------------------------
-- update_log
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('pat');
select lives_ok($$
  select public.update_log(
    '10000000-0000-4000-a000-000000000001',
    '[{"artistId": "40000000-0000-4000-a000-000000000002"}, {"artistId": "40000000-0000-4000-a000-000000000001"}, {"name": "  the local OPENERS "}, {"name": "Test Edit Act"}]',
    50::smallint, null, '   ')
$$, 'pat reorders, removes and adds artists and changes details');
select results_eq(
  $$ select artists, rating_tenths from public.user_log(pg_temp.uid('pat')) where log_id = pg_temp.log(1) $$,
  $$ values (array['100 gecs', 'boygenius', 'The Local Openers', 'Test Edit Act'], 50::smallint) $$,
  'the edited lineup and rating show up in the log (added names match existing artists first)'
);
select results_eq(
  $$ select ticket_price_cents, notes, show_id from public.concert_logs where id = pg_temp.log(1) $$,
  $$ values (null::integer, null::text, '30000000-0000-4000-a000-000000000001'::uuid) $$,
  'null clears the price, blank notes clear the notes, and the show is unchanged'
);

select pg_temp.as_user('priya');
select throws_ok($$ select public.update_log('10000000-0000-4000-a000-000000000001', '[{"name": "X"}]', null, null, null) $$,
  'P0002', null, 'nobody else can edit a log (it looks missing)');
select pg_temp.as_user('pat');
select throws_ok($$ select public.update_log('10000000-0000-4000-a000-000000000001', '[]', null, null, null) $$,
  '22023', null, 'a lineup can''t be emptied');
select throws_ok($$ select public.update_log('10000000-0000-4000-a000-000000000001', '[{"artistId": "40000000-0000-4000-a000-0000000000ff"}]', null, null, null) $$,
  '22023', null, 'unknown artist ids are rejected');

-- ---------------------------------------------------------------------------------------------
-- Festival day labels (saved by log_concert)
-- ---------------------------------------------------------------------------------------------
create temp table new_logs (k text, id uuid) on commit drop;
grant select, insert on new_logs to authenticated;
select pg_temp.as_user('pat');
insert into new_logs select 'fest', public.log_concert('setlistfm', '1999-09-18', '{"name":"Test Grounds","city":"Chicago","state":"IL"}',
  '[{"name":"Test Band"}]', p_festival_name => 'Test Fest', p_festival_day_label => 'Weekend 2 · Day 1');
insert into new_logs select 'club', public.log_concert('manual', '1999-09-19', '{"name":"Test Club","city":"Chicago","state":"IL"}',
  '[{"name":"Test Band"}]', p_festival_day_label => 'Day 9');
select results_eq(
  $$ select n.k, s.festival_day_label from new_logs n join public.concert_logs l on l.id = n.id
     join public.shows s on s.id = l.show_id order by n.k $$,
  $$ values ('club', null::text), ('fest', 'Weekend 2 · Day 1') $$,
  'a festival day keeps its label; a label without a festival name is dropped'
);

select * from finish();
rollback;
