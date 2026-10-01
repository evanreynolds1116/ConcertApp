-- Each lineup entry keeps that artist's setlist at the show (log_artists.setlistfm_url), so the
-- concert page links the headliner's setlist. Writes roll back; the show uses a made-up venue and
-- a 1999 date so it can't collide with concerts logged while using the app.

begin;
\ir _helpers.psql
select plan(8);

create temp table ids (name text primary key, id uuid) on commit drop;
grant select, insert on ids to authenticated;

create function pg_temp.links(p_log uuid) returns text language sql as $$
  select string_agg(a.name || '=' || coalesce(la.setlistfm_url, '-'), ' ' order by la.position)
  from public.log_artists la join public.artists a on a.id = la.artist_id
  where la.log_id = p_log;
$$;

select pg_temp.as_user('pat');
insert into ids select 'show', public.log_concert(
  'setlistfm', '1999-03-03',
  '{"name": "Setlist Link Test Hall", "city": "Nashville", "state": "TN", "setlistfmId": "testlink1"}',
  '[{"name": "Link Headliner", "setlistfmUrl": "https://www.setlist.fm/setlists/link-headliner-1.html", "setlistUrl": "https://www.setlist.fm/setlist/link-headliner/1999/hall-1.html"},
    {"name": "Link Opener", "setlistUrl": "https://www.setlist.fm/setlists/link-opener-2.html"},
    {"name": "Link Elsewhere", "setlistUrl": "https://example.com/setlist/x.html"},
    {"name": "Link Nobody"}]');

select is(pg_temp.links((select id from ids where name = 'show')),
  'Link Headliner=https://www.setlist.fm/setlist/link-headliner/1999/hall-1.html Link Opener=- Link Elsewhere=- Link Nobody=-',
  'a setlist.fm log stores each artist''s setlist; artist pages and other sites are dropped');

insert into ids select 'manual', public.log_concert(
  'manual', '1999-03-04',
  '{"name": "Setlist Link Test Hall", "city": "Nashville", "state": "TN"}',
  '[{"name": "Link Headliner", "setlistUrl": "https://www.setlist.fm/setlist/link-headliner/1999/hall-2.html"}]');
select is(pg_temp.links((select id from ids where name = 'manual')), 'Link Headliner=-',
  'manual logs never carry setlist links');

-- Reordering keeps each artist's link; artists added while editing have none.
select public.update_log(
  (select id from ids where name = 'show'),
  (select jsonb_agg(x) from (
     select jsonb_build_object('artistId', la.artist_id) as x
     from public.log_artists la join public.artists a on a.id = la.artist_id
     where la.log_id = (select id from ids where name = 'show') and a.name in ('Link Opener', 'Link Headliner')
     order by a.name desc
   ) q) || '[{"name": "Link Added"}]'::jsonb,
  null, null, null);
select is(pg_temp.links((select id from ids where name = 'show')),
  'Link Opener=- Link Headliner=https://www.setlist.fm/setlist/link-headliner/1999/hall-1.html Link Added=-',
  'editing the lineup keeps each artist''s setlist link through reorders');

-- Direct writes can't store anything but a setlist.fm setlist page.
select throws_ok(
  $$ update public.log_artists set setlistfm_url = 'https://www.setlist.fm/setlist/x.html'
     where log_id = (select id from ids where name = 'show') $$,
  '42501', null, 'clients cannot change a setlist link directly');
select throws_ok(
  $$ insert into public.log_artists (log_id, artist_id, position, setlistfm_url)
     select (select id from ids where name = 'manual'), id, 2, 'https://example.com/setlist/x.html'
     from public.artists where name = 'Link Opener' $$,
  '23514', null, 'a link that isn''t a setlist.fm setlist page is rejected');
select lives_ok(
  $$ insert into public.log_artists (log_id, artist_id, position, setlistfm_url)
     select (select id from ids where name = 'manual'), id, 2, 'https://www.setlist.fm/setlist/link-opener/1999/hall-2.html'
     from public.artists where name = 'Link Opener' $$,
  'an owner adding a lineup row may include a setlist.fm setlist link');

-- Privacy: links are read through the same RLS as the rest of the lineup.
select pg_temp.as_user('priya');
select is((select count(*)::int from public.log_artists where log_id = (select id from ids where name = 'show')),
  3, 'anyone signed in can read a public user''s lineup links');
select pg_temp.as_anon();
select throws_ok($$ select count(*) from public.log_artists $$, '42501', null, 'signed-out visitors read nothing');

select * from finish();
rollback;
