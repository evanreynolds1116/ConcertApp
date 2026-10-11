-- The fixes from SECURITY_AUDIT.md (migration *_security_hardening.sql):
--   M1 signed setlist.fm details   M3 search quota   L2 can_view   L3 shared data visibility
--   L6 account deletion            L9 avatar files
-- Seed users: pat (public, follows fran), priya (private), fran (private). Everything this test
-- writes uses made-up names and 1999 dates, and rolls back.

begin;
\ir _helpers.psql
select plan(25);

create temp table ids (k text primary key, id uuid) on commit drop;
grant select, insert on ids to authenticated;
create function pg_temp.id(k text) returns uuid language sql as $$ select id from ids where ids.k = id.k $$;

create function pg_temp.error_of(sql text)
returns text
language plpgsql
as $$
declare
  v_state text;
  v_message text;
begin
  execute sql;
  return 'ok';
exception when others then
  get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
  return v_state || ': ' || v_message;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- M1: setlist.fm details must be signed by setlist-search
-- ---------------------------------------------------------------------------------------------
-- A venue and artist planted before signing existed, with made-up names.
insert into public.venues (name, city, state, setlistfm_venue_id) values ('Planted Venue Name', 'Austin', 'TX', 'sec-venue-1');
insert into public.artists (name, mbid) values ('Planted Artist Name', 'sec-mbid-1');

create temp table v as select '{"name":"Real Hall","city":"Austin","state":"TX","setlistfmId":"sec-venue-1"}'::jsonb as j;
grant select on v to authenticated;

select pg_temp.as_user('pat');
select is(left(pg_temp.error_of($$ select public.log_concert('setlistfm', '1999-05-01', (select j from v), '[{"name":"A"}]') $$), 5),
  '22023', 'a setlist.fm log without a signature is refused');
select is(left(pg_temp.error_of($$ select public.log_concert('setlistfm', '1999-05-01',
    '{"name":"Offensive Name","city":"Austin","state":"TX","setlistfmId":"sec-venue-1"}', '[{"name":"A"}]',
    p_show_signature => pg_temp.show_sig((select j from v), '1999-05-01')) $$), 5),
  '22023', 'a changed venue name breaks the signature');
select is(left(pg_temp.error_of($$ select public.log_concert('setlistfm', '1999-05-01', (select j from v), '[{"name":"A"}]',
    p_festival_name => 'Scam Fest', p_show_signature => pg_temp.show_sig((select j from v), '1999-05-01')) $$), 5),
  '22023', 'so does a festival name that wasn''t signed');
select is(left(pg_temp.error_of($$ select public.log_concert('setlistfm', '1999-05-02', (select j from v), '[{"name":"A"}]',
    p_show_signature => pg_temp.show_sig((select j from v), '1999-05-01')) $$), 5),
  '22023', 'and a signature for another date');

insert into ids select 'signed', public.log_concert('setlistfm', '1999-05-01', (select j from v),
  pg_temp.signed('[{"name":"Real Artist","mbid":"sec-mbid-1","setlistUrl":"https://www.setlist.fm/setlist/real-artist/1999/real-hall-1.html"}]', '1999-05-01')
    || '[{"name":"Typed Artist","mbid":"sec-mbid-typed","setlistUrl":"https://www.setlist.fm/setlist/typed/1999/x.html","signature":"0000"}]'::jsonb
    || (select jsonb_build_array(a[0] || '{"name":"Renamed Artist"}') from (select pg_temp.signed('[{"name":"Other Artist","mbid":"sec-mbid-2"}]', '1999-05-01') as a) s),
  p_show_signature => pg_temp.show_sig((select j from v), '1999-05-01'));
select pg_temp.as_postgres();
select is((select name from public.venues where setlistfm_venue_id = 'sec-venue-1'), 'Real Hall',
  'a signed log replaces a planted venue name with setlist.fm''s');
select is((select name from public.artists where mbid = 'sec-mbid-1'), 'Real Artist',
  'and a planted artist name');
select results_eq(
  $$ select a.name, a.mbid, la.setlistfm_url from public.log_artists la join public.artists a on a.id = la.artist_id
     where la.log_id = pg_temp.id('signed') order by la.position $$,
  $$ values ('Real Artist', 'sec-mbid-1', 'https://www.setlist.fm/setlist/real-artist/1999/real-hall-1.html'),
            ('Typed Artist', null, null), ('Renamed Artist', null, null) $$,
  'artists without a valid signature keep their name but lose the MBID and links'
);
select is((select s.setlistfm_url from public.shows s join public.concert_logs l on l.show_id = s.id where l.id = pg_temp.id('signed')),
  'https://www.setlist.fm/setlist/real-artist/1999/real-hall-1.html', 'the show links the first signed artist''s setlist');

-- Festival names: signed ones win; a manual log only fills in a missing one.
select pg_temp.as_user('priya');
insert into ids select 'manual_fest', public.log_concert('manual', '1999-05-03', '{"name":"Fest Field","city":"Austin","state":"TX"}',
  '[{"name":"A"}]', p_festival_name => 'Made Up Fest', p_festival_day_label => 'Day 1');
select pg_temp.as_user('pat');
create temp table fv as select '{"name":"Fest Field","city":"Austin","state":"TX","setlistfmId":"sec-field"}'::jsonb as j;
grant select on fv to authenticated;
insert into ids select 'signed_fest', public.log_concert('setlistfm', '1999-05-03', (select j from fv), '[{"name":"B"}]',
  p_festival_name => 'Real Fest', p_festival_day_label => 'Day 2',
  p_show_signature => pg_temp.show_sig((select j from fv), '1999-05-03', 'Real Fest', 'Day 2'));
select pg_temp.as_user('fran');
insert into ids select 'manual_after', public.log_concert('manual', '1999-05-03', '{"name":"fest field","city":"austin","state":"TX"}',
  '[{"name":"C"}]', p_festival_name => 'Made Up Again');
select pg_temp.as_postgres();
select results_eq(
  $$ select count(distinct l.show_id)::int, max(s.festival_name), max(s.festival_day_label) from public.concert_logs l
     join public.shows s on s.id = l.show_id where l.id in (pg_temp.id('manual_fest'), pg_temp.id('signed_fest'), pg_temp.id('manual_after')) $$,
  $$ values (1, 'Real Fest', 'Day 2') $$,
  'a signed festival name and label replace a manual one, and a later manual log can''t change them'
);

-- ---------------------------------------------------------------------------------------------
-- M3: search quota (service role only)
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('pat');
select throws_ok($$ select public.consume_search_quota(auth.uid()) $$, '42501', null, 'users can''t touch the search quota');
select throws_ok($$ select public.lineup_signing_key() $$, '42501', null, 'or read the signing key');
select pg_temp.as_anon();
select throws_ok($$ select public.lineup_signing_key() $$, '42501', null, 'neither can signed-out visitors');
select pg_temp.as_postgres();
set local role service_role;
select is((select bool_and(public.consume_search_quota('00000000-0000-4000-a000-000000000001')) from generate_series(1, 30)),
  true, '30 searches a minute are allowed');
select is(public.consume_search_quota('00000000-0000-4000-a000-000000000001'), false, 'the 31st is refused');
select is(public.consume_search_quota('00000000-0000-4000-a000-000000000002'), true, 'other users have their own quota');
select is(length(public.lineup_signing_key()), 64, 'the service role can read the signing key');
reset role;

-- ---------------------------------------------------------------------------------------------
-- L2: can_view only answers for the signed-in viewer
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('priya');
select is(public.can_view(pg_temp.uid('pat'), pg_temp.uid('fran')), false,
  'priya can''t ask whether pat can see fran (he can: he follows her)');
select is(public.can_view(pg_temp.uid('priya'), pg_temp.uid('priya')), true, 'but can ask about herself');

-- ---------------------------------------------------------------------------------------------
-- L3: shared rows only through a visible log
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('priya');
insert into ids select 'secret', public.log_concert('manual', '1999-06-06', '{"name":"Secret Spot 42","city":"Austin","state":"TX"}',
  '[{"name":"Secret Band 42"}]');
select is((select count(*)::int from public.venues where name = 'Secret Spot 42')
        + (select count(*)::int from public.artists where name = 'Secret Band 42')
        + (select count(*)::int from public.shows s join public.concert_logs l on l.show_id = s.id where l.id = pg_temp.id('secret')),
  3, 'priya sees the venue, artist and show from her own log');
select pg_temp.as_user('pat');
select is((select count(*)::int from public.venues where name = 'Secret Spot 42')
        + (select count(*)::int from public.artists where name = 'Secret Band 42')
        + (select count(*)::int from public.shows where date = '1999-06-06'),
  0, 'pat, who can''t see priya''s log, sees none of them');
select ok((select count(*) from public.venues v where v.id = '20000000-0000-4000-a000-000000000001') = 1,
  'shared rows from logs pat can see stay visible');

-- ---------------------------------------------------------------------------------------------
-- L6: account deletion needs no avatar files left
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_postgres();
insert into storage.objects (bucket_id, name, owner_id) values ('avatars', '00000000-0000-4000-a000-000000000003/left.webp', '00000000-0000-4000-a000-000000000003');
select pg_temp.as_user_just_signed_in('fran');
select throws_ok($$ select public.delete_account() $$, '55000', null,
  'an account with avatar files left can''t be deleted (the app removes them first)');

-- ---------------------------------------------------------------------------------------------
-- L9: avatars
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('pat');
insert into storage.objects (bucket_id, name, owner_id) values ('avatars', '00000000-0000-4000-a000-000000000001/sec.webp', auth.uid()::text);
select pg_temp.as_user('priya');
select is_empty($$ select 1 from storage.objects where bucket_id = 'avatars' and name like '00000000-0000-4000-a000-000000000001/%' $$,
  'other people can''t list or read files a profile doesn''t show');
select pg_temp.as_user('pat');
update public.profiles set avatar_url = '00000000-0000-4000-a000-000000000001/sec.webp' where id = auth.uid();
select pg_temp.as_user('priya');
select is((select count(*)::int from storage.objects where bucket_id = 'avatars' and name like '00000000-0000-4000-a000-000000000001/%'), 1,
  'but can read the one his profile shows');
select pg_temp.as_postgres();
select is((select allowed_mime_types from storage.buckets where id = 'avatars'), array['image/webp'],
  'the avatars bucket only takes WebP');

select * from finish();
rollback;
