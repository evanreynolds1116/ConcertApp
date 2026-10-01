-- log_concert: creates or matches venue, artists and show, and writes the log and lineup in
-- one transaction. Seed users: pat, priya, fran (see supabase/seed.sql). Shows this test
-- creates use made-up names and 1999 dates, so they can't collide with data from using the app.

begin;
\ir _helpers.psql
select plan(33);

create temp table ids (k text primary key, id uuid) on commit drop;
grant select, insert on ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select id from ids where ids.k = id.k $$;

-- Runs a statement and returns "SQLSTATE: message | detail" if it fails, or 'ok'.
create function pg_temp.error_of(sql text)
returns text
language plpgsql
as $$
declare
  v_state text;
  v_message text;
  v_detail text;
begin
  execute sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_message = message_text, v_detail = pg_exception_detail;
  return v_state || ': ' || v_message || coalesce(' | ' || v_detail, '');
end;
$$;

create temp table before as
select (select count(*) from public.venues) as venues, (select count(*) from public.shows) as shows,
       (select count(*) from public.artists) as artists;
grant select on before to authenticated;

-- ---------------------------------------------------------------------------------------------
-- A setlist.fm concert: The Basement East, 2026-09-17 (fran already logged this show)
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_anon();
select throws_ok($$ select public.log_concert('manual', '2024-01-01', '{"name":"X","city":"Y","state":"TN"}', '[{"name":"Z"}]') $$,
  '42501', null, 'signed-out visitors cannot log concerts');

select pg_temp.as_user('pat');
insert into ids select 'pat_basement', public.log_concert(
  'setlistfm', '2026-09-17',
  '{"name": "The Basement East", "city": "Nashville", "state": "TN", "setlistfmId": "23d09c67"}',
  '[{"name": "Shakey Graves", "mbid": "24ca022c-653e-4379-812a-71f729b900ef", "setlistfmUrl": "https://www.setlist.fm/setlists/shakey-graves-2bd6d8ae.html"},
    {"name": "Futurebirds", "mbid": "e432ac6d-fc48-436a-bbee-3f112902f6ae"},
    {"name": "Langhorne Slim", "mbid": "0bc5259b-bf08-40ad-9f6a-20462f652e83"}]',
  p_setlistfm_url => 'https://www.setlist.fm/setlist/shakey-graves/2026/the-basement-east-nashville-tn-1.html',
  p_rating_tenths => 87::smallint, p_ticket_price_cents => 3500);

select pg_temp.as_postgres();
select results_eq(
  $$ select l.user_id, l.show_id, l.rating_tenths, l.ticket_price_cents, l.source from public.concert_logs l where l.id = pg_temp.id('pat_basement') $$,
  $$ values ('00000000-0000-4000-a000-000000000001'::uuid, '30000000-0000-4000-a000-000000000002'::uuid, 87::smallint, 3500, 'setlistfm') $$,
  'the log belongs to the caller and reuses the existing show (so "Also here" finds fran)'
);
select results_eq(
  $$ select a.name, la.position from public.log_artists la join public.artists a on a.id = la.artist_id
     where la.log_id = pg_temp.id('pat_basement') order by la.position $$,
  $$ values ('Shakey Graves', 1::smallint), ('Futurebirds', 2::smallint), ('Langhorne Slim', 3::smallint) $$,
  'the lineup keeps the order the user chose'
);
select is((select count(*)::int from public.artists where mbid in ('24ca022c-653e-4379-812a-71f729b900ef', 'e432ac6d-fc48-436a-bbee-3f112902f6ae', '0bc5259b-bf08-40ad-9f6a-20462f652e83')),
  3, 'artists are matched by MusicBrainz ID, never duplicated');
select is((select count(*)::int from public.venues) - (select venues::int from before), 0, 'the venue is matched by setlist.fm ID');
select is((select count(*)::int from public.activities where log_id = pg_temp.id('pat_basement')), 1, 'logging writes a feed item');

-- ---------------------------------------------------------------------------------------------
-- Duplicates
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('pat');
select is(
  pg_temp.error_of($$ select public.log_concert('setlistfm', '2026-09-17', '{"name":"The Basement East","city":"Nashville","state":"TN","setlistfmId":"23d09c67"}', '[{"name":"Futurebirds"}]') $$),
  '23505: already_logged | ' || pg_temp.id('pat_basement'),
  'logging the same show twice is blocked, and the error carries the existing log''s id'
);
select is(
  pg_temp.error_of($$ select public.log_concert('manual', '2026-09-17', '{"name":"the basement east","city":"NASHVILLE","state":"tn"}', '[{"name":"Futurebirds"}]') $$),
  '23505: already_logged | ' || pg_temp.id('pat_basement'),
  'a manual entry of the same venue and date is the same show, so it''s blocked too'
);

-- ---------------------------------------------------------------------------------------------
-- Manual entry matching
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('priya');
insert into ids select 'priya_ryman', public.log_concert(
  'manual', '1999-11-08',
  '{"name": "  ryman auditorium ", "city": "nashville", "state": "tn"}',
  '[{"name": "the local openers"}, {"name": "Test Band Alpha"}, {"name": " TEST BAND ALPHA "}, {"name": "BOYGENIUS"}]');
select pg_temp.as_postgres();
select is((select s.venue_id from public.shows s join public.concert_logs l on l.show_id = s.id where l.id = pg_temp.id('priya_ryman')),
  '20000000-0000-4000-a000-000000000006'::uuid, 'a manual venue matches an existing one by name, city and state, ignoring case');
select results_eq(
  $$ select a.name, a.mbid is not null, la.position from public.log_artists la join public.artists a on a.id = la.artist_id
     where la.log_id = pg_temp.id('priya_ryman') order by la.position $$,
  $$ values ('The Local Openers', false, 1::smallint), ('Test Band Alpha', false, 2::smallint), ('boygenius', true, 3::smallint) $$,
  'manual artists match existing ones by name (preferring setlist.fm artists), and a repeated name counts once'
);

select pg_temp.as_user('fran');
insert into ids select 'fran_pinhook', public.log_concert('manual', '1999-03-01', '{"name":"Test Hall One","city":"Durham","state":"NC"}', '[{"name":"test band alpha"}]');
select pg_temp.as_user('priya');
insert into ids select 'priya_pinhook', public.log_concert('manual', '1999-03-01', '{"name":"test hall one","city":"durham","state":"NC"}', '[{"name":"Test Band Alpha"}]');
select pg_temp.as_postgres();
select is((select count(distinct show_id)::int from public.concert_logs where id in (pg_temp.id('fran_pinhook'), pg_temp.id('priya_pinhook'))), 1,
  'two people entering the same new venue by hand share one show');
select is((select count(*)::int from public.venues where lower(name) = 'test hall one'), 1, 'and one venue');
select is((select count(*)::int from public.artists where lower(name) = 'test band alpha'), 1, 'and a manually added artist is created once');

-- A setlist.fm log adopts a venue someone added by hand (Crystal Ballroom, Portland, OR).
select pg_temp.as_user('priya');
insert into ids select 'priya_crystal', public.log_concert('setlistfm', '1999-04-01',
  '{"name":"Crystal Ballroom","city":"Portland","state":"OR","setlistfmId":"cb000001"}', '[{"name":"Test Band Beta","mbid":"mbid-test-band-beta"}]');
select pg_temp.as_postgres();
select results_eq(
  $$ select id, setlistfm_venue_id from public.venues where lower(name) = 'crystal ballroom' $$,
  $$ values ('20000000-0000-4000-a000-000000000003'::uuid, 'cb000001') $$,
  'a setlist.fm venue adopts its manually added twin instead of duplicating it'
);
-- And a setlist.fm artist adopts a manually added twin.
select pg_temp.as_user('pat');
insert into ids select 'pat_bnb', public.log_concert('setlistfm', '1999-03-02',
  '{"name":"Test Hall One","city":"Durham","state":"NC"}', '[{"name":"Test Band Alpha","mbid":"mbid-test-band-alpha"}]');
select pg_temp.as_postgres();
select results_eq(
  $$ select count(*)::int, max(mbid) from public.artists where lower(name) = 'test band alpha' $$,
  $$ values (1, 'mbid-test-band-alpha') $$,
  'a setlist.fm artist adopts its manually added twin'
);

-- ---------------------------------------------------------------------------------------------
-- Festival days
-- ---------------------------------------------------------------------------------------------
-- Riot Fest: stages are separate setlist.fm venues, so the day is saved against the grounds.
select pg_temp.as_user('pat');
insert into ids select 'pat_riot', public.log_concert('setlistfm', '1999-09-18',
  '{"name":"Douglass Park","city":"Chicago","state":"IL","setlistfmId":null}',
  '[{"name":"Test Band Gamma","mbid":"mbid-test-gamma"},{"name":"Test Band Delta","mbid":"mbid-test-delta"}]', p_festival_name => 'Riot Fest');
select pg_temp.as_user('fran');
insert into ids select 'fran_riot', public.log_concert('setlistfm', '1999-09-18',
  '{"name":"Douglass Park","city":"Chicago","state":"IL"}', '[{"name":"Test Band Delta","mbid":"mbid-test-delta"}]', p_festival_name => 'Riot Fest');
select pg_temp.as_postgres();
select results_eq(
  $$ select count(distinct l.show_id)::int, max(s.festival_name) from public.concert_logs l join public.shows s on s.id = l.show_id
     where l.id in (pg_temp.id('pat_riot'), pg_temp.id('fran_riot')) $$,
  $$ values (1, 'Riot Fest') $$,
  'everyone who logs a festival day shares one show, named after the festival'
);
-- Bonnaroo day (seed show) logged by priya: same show as pat and fran.
select pg_temp.as_user('priya');
insert into ids select 'priya_roo', public.log_concert('setlistfm', '2024-06-16',
  '{"name":"Great Stage Park","city":"Manchester","state":"TN","setlistfmId":"2bd6181e"}', '[{"name":"Chappell Roan","mbid":"56a55378-f155-48de-80a5-d80104221267"}]',
  p_festival_name => 'Bonnaroo');
select pg_temp.as_postgres();
select is((select show_id from public.concert_logs where id = pg_temp.id('priya_roo')), '30000000-0000-4000-a000-000000000005'::uuid,
  'a festival day from setlist.fm joins the existing show');
select is((select count(*)::int from public.shows) - (select shows::int from before), 5,
  'only genuinely new shows were created (Ryman 2025, Pinhook x2, Crystal Ballroom 2023, Riot Fest)');

-- ---------------------------------------------------------------------------------------------
-- Validation
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('pat');
select is(left(pg_temp.error_of($$ select public.log_concert('manual', current_date + 2, '{"name":"V","city":"C","state":"TN"}', '[{"name":"A"}]') $$), 5),
  '22023', 'upcoming shows are rejected');
select is(left(pg_temp.error_of($$ select public.log_concert('manual', '1959-12-31', '{"name":"V","city":"C","state":"TN"}', '[{"name":"A"}]') $$), 5),
  '22023', 'shows before 1960 are rejected');
select is(left(pg_temp.error_of($$ select public.log_concert('manual', '2024-01-01', '{"name":"V","city":"C","state":"TN"}', '[]') $$), 5),
  '22023', 'a concert needs at least one artist');
select is(left(pg_temp.error_of($$ select public.log_concert('manual', '2024-01-01', '{"name":"V","city":"C","state":"TN"}', '{"name":"A"}') $$), 5),
  '22023', 'artists must be a list');
select is(left(pg_temp.error_of($$ select public.log_concert('manual', '2024-01-01', '{"name":"V","city":"C","state":"TN"}', '[{"name":"  "}]') $$), 5),
  '22023', 'every artist needs a name');
select is(left(pg_temp.error_of($$ select public.log_concert('manual', '2024-01-01', '{"name":"","city":"C","state":"TN"}', '[{"name":"A"}]') $$), 5),
  '22023', 'a venue needs a name');
select is(left(pg_temp.error_of($$ select public.log_concert('manual', '2024-01-01', '{"name":"V","city":"C"}', '[{"name":"A"}]') $$), 5),
  '22023', 'a venue needs a state');
select is(left(pg_temp.error_of($$ select public.log_concert('manual', '2024-01-01', '{"name":"V","city":"Toronto","state":"ON"}', '[{"name":"A"}]') $$), 5),
  '23514', 'US states only');
select is(left(pg_temp.error_of($$ select public.log_concert('other', '2024-01-01', '{"name":"V","city":"C","state":"TN"}', '[{"name":"A"}]') $$), 5),
  '22023', 'source must be setlistfm or manual');
select is(left(pg_temp.error_of($$ select public.log_concert('manual', '2024-01-01', '{"name":"V","city":"C","state":"TN"}', '[{"name":"A"}]', p_rating_tenths => 101::smallint) $$), 5),
  '23514', 'ratings above 10.0 are rejected');
select is(left(pg_temp.error_of($$ select public.log_concert('manual', '2024-01-01', '{"name":"V","city":"C","state":"TN"}', '[{"name":"A"}]', p_ticket_price_cents => -100) $$), 5),
  '23514', 'negative prices are rejected');
select is((select count(*)::int from public.venues where name = 'V'), 0, 'a failed save leaves nothing behind (one transaction)');

insert into ids select 'pat_zero', public.log_concert('manual', '2024-02-02', '{"name":"V2","city":"C","state":"TN"}', '[{"name":"A"}]',
  p_rating_tenths => 0::smallint, p_ticket_price_cents => 0, p_notes => '   ');
select results_eq(
  $$ select rating_tenths, ticket_price_cents, notes from public.concert_logs where id = pg_temp.id('pat_zero') $$,
  $$ values (0::smallint, 0, null::text) $$,
  'a 0.0 rating and a $0 ticket are kept; blank notes are stored as not set'
);

-- Manual logs never carry setlist.fm IDs or links, and only real setlist.fm links are kept.
insert into ids select 'pat_links', public.log_concert('manual', '2024-02-03', '{"name":"V3","city":"C","state":"TN","setlistfmId":"fake"}',
  '[{"name":"B","mbid":"fake-mbid"}]', p_setlistfm_url => 'https://www.setlist.fm/setlist/x.html');
insert into ids select 'pat_badlink', public.log_concert('setlistfm', '2024-02-04', '{"name":"V4","city":"C","state":"TN","setlistfmId":"v4id"}',
  '[{"name":"C","mbid":"mbid-c","setlistfmUrl":"javascript:alert(1)"}]', p_setlistfm_url => 'https://evil.example/setlist.fm');
select pg_temp.as_postgres();
select results_eq(
  $$ select v.setlistfm_venue_id, s.setlistfm_url, a.mbid from public.concert_logs l join public.shows s on s.id = l.show_id
     join public.venues v on v.id = s.venue_id join public.log_artists la on la.log_id = l.id join public.artists a on a.id = la.artist_id
     where l.id = pg_temp.id('pat_links') $$,
  $$ values (null::text, null::text, null::text) $$,
  'manual logs ignore setlist.fm IDs and links'
);
select results_eq(
  $$ select s.setlistfm_url, a.setlistfm_url from public.concert_logs l join public.shows s on s.id = l.show_id
     join public.log_artists la on la.log_id = l.id join public.artists a on a.id = la.artist_id where l.id = pg_temp.id('pat_badlink') $$,
  $$ values (null::text, null::text) $$,
  'links that aren''t setlist.fm pages are dropped'
);

select * from finish();
rollback;
