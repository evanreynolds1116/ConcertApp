-- Privacy table (docs/spec.md, "Privacy & social rules") for the 3 seed users.
--
--   viewer \ owner   pat (public)   priya (private)   fran (private, pat follows)
--   pat              yes (self)     no                yes (accepted follower)
--   priya            yes (public)   yes (self)        no (request is only pending)
--   fran             yes (public)   no                yes (self)
--
-- Covered rows: profiles (everyone signed in); logs, lineups, ratings, notes, prices (one row
-- each: whole log rows are visible or not); feed items; follower/following lists; pending
-- requests; signed-out visitors see nothing. The "Stats and leaderboards" row is covered in
-- Phase 4, when the stats functions exist; they must read through these same policies.

begin;
\ir _helpers.psql
select plan(46);

-- ---------------------------------------------------------------------------------------------
-- Ground truth as postgres (RLS bypassed)
-- ---------------------------------------------------------------------------------------------
create temp table truth on commit drop as
select u.name,
  (select count(*) from public.concert_logs l where l.user_id = pg_temp.uid(u.name))::int as logs,
  (select count(*) from public.log_artists la join public.concert_logs l on l.id = la.log_id
     where l.user_id = pg_temp.uid(u.name))::int as lineup_rows,
  (select count(*) from public.activities a where a.actor_id = pg_temp.uid(u.name))::int as activities
from (values ('pat'), ('priya'), ('fran')) as u (name);

select results_eq(
  'select name, logs, lineup_rows > 0, activities > 0 from truth order by name',
  $$ values ('fran', 3, true, true), ('pat', 4, true, true), ('priya', 2, true, true) $$,
  'seed: every user has logs, lineups and feed items to hide or show'
);

create temp table expected (viewer text, owner text, visible boolean) on commit drop;
insert into expected values
  ('pat', 'pat', true), ('pat', 'priya', false), ('pat', 'fran', true),
  ('priya', 'pat', true), ('priya', 'priya', true), ('priya', 'fran', false),
  ('fran', 'pat', true), ('fran', 'priya', false), ('fran', 'fran', true);

grant select on truth, expected to authenticated, anon;

-- A 4th private user, quinn, who is an accepted follower of priya. This gives a follow row
-- between two private accounts, so we can check it's hidden from people who can't view either.
select pg_temp.create_user('quinn');
insert into public.follows (follower_id, followee_id) values (pg_temp.uid('quinn'), pg_temp.uid('priya'));
update public.follows set status = 'accepted'
where follower_id = pg_temp.uid('quinn') and followee_id = pg_temp.uid('priya');

-- Lineup rows are checked by log ID from the ground truth, not through concert_logs, so the
-- log_artists policy is tested on its own.
create temp table owner_logs on commit drop as
select l.id as log_id, u.name as owner
from public.concert_logs l
join (values ('pat'), ('priya'), ('fran')) as u (name) on l.user_id = pg_temp.uid(u.name);
grant select on owner_logs to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Logs, lineups and feed items: 3 viewers x 3 owners x 3 checks = 27
-- ---------------------------------------------------------------------------------------------
create function pg_temp.check_viewer(viewer text)
returns setof text
language plpgsql
as $$
declare
  e record;
  t record;
  v_logs int;
  v_lineup int;
  v_acts int;
begin
  perform pg_temp.as_user(viewer);
  for e in select * from expected where expected.viewer = check_viewer.viewer order by owner loop
    select * into t from truth where name = e.owner;
    select count(*) into v_logs from public.concert_logs where user_id = pg_temp.uid(e.owner);
    select count(*) into v_lineup from public.log_artists
      where log_id in (select log_id from owner_logs where owner = e.owner);
    select count(*) into v_acts from public.activities where actor_id = pg_temp.uid(e.owner);
    return next is(v_logs, case when e.visible then t.logs else 0 end,
      format('%s %s %s''s concert logs', viewer, case when e.visible then 'sees' else 'cannot see' end, e.owner));
    return next is(v_lineup, case when e.visible then t.lineup_rows else 0 end,
      format('%s %s %s''s lineups', viewer, case when e.visible then 'sees' else 'cannot see' end, e.owner));
    return next is(v_acts, case when e.visible then t.activities else 0 end,
      format('%s %s %s''s feed items', viewer, case when e.visible then 'sees' else 'cannot see' end, e.owner));
  end loop;
  perform pg_temp.as_postgres();
end;
$$;

select pg_temp.check_viewer('pat');
select pg_temp.check_viewer('priya');
select pg_temp.check_viewer('fran');

-- An accepted follower of a private account sees their logs (quinn -> priya).
select pg_temp.as_user('quinn');
select is((select count(*)::int from public.concert_logs where user_id = pg_temp.uid('priya')), 2,
  'quinn (accepted follower) sees priya''s logs');

-- ---------------------------------------------------------------------------------------------
-- Profiles: every signed-in user sees every username, display name and avatar (3)
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('pat');
select is((select count(*)::int from public.profiles where id in (pg_temp.uid('pat'), pg_temp.uid('priya'), pg_temp.uid('fran'))), 3,
  'pat sees all 3 profiles');
select pg_temp.as_user('priya');
select is((select count(*)::int from public.profiles where id in (pg_temp.uid('pat'), pg_temp.uid('priya'), pg_temp.uid('fran'))), 3,
  'priya sees all 3 profiles');
select pg_temp.as_user('fran');
select is((select count(*)::int from public.profiles where id in (pg_temp.uid('pat'), pg_temp.uid('priya'), pg_temp.uid('fran'))), 3,
  'fran sees all 3 profiles');

-- ---------------------------------------------------------------------------------------------
-- Follower / following lists and pending requests (4)
-- Rows: pat->fran, fran->pat, quinn->priya (accepted); priya->fran (pending).
-- An accepted row is on the follower's following list and the followee's follower list, so
-- it's visible when the viewer can view either side. Pending: only sender and receiver.
-- ---------------------------------------------------------------------------------------------
create function pg_temp.visible_follows()
returns setof text
language sql
as $$
  select p1.username || '->' || p2.username || ':' || f.status
  from public.follows f
  join public.profiles p1 on p1.id = f.follower_id
  join public.profiles p2 on p2.id = f.followee_id;
$$;

select pg_temp.as_user('pat');
select set_eq('select pg_temp.visible_follows()',
  array['pat_public->fran_followed:accepted', 'fran_followed->pat_public:accepted'],
  'pat sees lists of people he can view; not quinn->priya, not priya''s pending request');
select pg_temp.as_user('priya');
select set_eq('select pg_temp.visible_follows()',
  array['pat_public->fran_followed:accepted', 'fran_followed->pat_public:accepted',
        'quinn_test->priya_private:accepted', 'priya_private->fran_followed:pending'],
  'priya sees her follower, her own pending request, and pat''s lists');
select pg_temp.as_user('fran');
select set_eq('select pg_temp.visible_follows()',
  array['pat_public->fran_followed:accepted', 'fran_followed->pat_public:accepted',
        'priya_private->fran_followed:pending'],
  'fran sees the pending request she received, but not quinn->priya');
select pg_temp.as_user('quinn');
select set_eq('select pg_temp.visible_follows()',
  array['pat_public->fran_followed:accepted', 'fran_followed->pat_public:accepted',
        'quinn_test->priya_private:accepted'],
  'quinn sees his own follow and pat''s lists, not priya''s pending request to fran');

-- ---------------------------------------------------------------------------------------------
-- Signed-out visitors see nothing (10)
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_anon();
select throws_ok('select 1 from public.profiles', '42501', null, 'anon cannot read profiles');
select throws_ok('select 1 from public.artists', '42501', null, 'anon cannot read artists');
select throws_ok('select 1 from public.venues', '42501', null, 'anon cannot read venues');
select throws_ok('select 1 from public.shows', '42501', null, 'anon cannot read shows');
select throws_ok('select 1 from public.concert_logs', '42501', null, 'anon cannot read concert_logs');
select throws_ok('select 1 from public.log_artists', '42501', null, 'anon cannot read log_artists');
select throws_ok('select 1 from public.follows', '42501', null, 'anon cannot read follows');
select throws_ok('select 1 from public.activities', '42501', null, 'anon cannot read activities');
select throws_ok($$ select public.can_view('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001') $$,
  '42501', null, 'anon cannot call can_view');
select ok(public.is_username_available('nobody_has_this'), 'anon can check username availability (sign-up form)');

select pg_temp.as_postgres();
select * from finish();
rollback;
