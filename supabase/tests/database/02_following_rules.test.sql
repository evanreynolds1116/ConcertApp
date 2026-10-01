-- Following rules (docs/spec.md, "Following"), acted out by the seed users.
-- Starting state: pat->fran accepted, fran->pat accepted, priya->fran pending.

begin;
\ir _helpers.psql
select plan(28);

-- Rows changed by a statement run as the current role (0 = blocked by RLS).
create function pg_temp.rows_changed(sql text)
returns int
language plpgsql
as $$
declare
  n int;
begin
  execute sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

create function pg_temp.follow_status(follower text, followee text)
returns text
language sql
security definer -- read the truth regardless of the caller's role
as $$
  select coalesce((select status from public.follows
    where follower_id = pg_temp.uid(follower) and followee_id = pg_temp.uid(followee)), 'none');
$$;

create function pg_temp.follow_activities(follower text, followee text)
returns int
language sql
security definer
as $$
  select count(*)::int from public.activities
  where type = 'follow_started' and actor_id = pg_temp.uid(follower) and target_user_id = pg_temp.uid(followee);
$$;

-- ---------------------------------------------------------------------------------------------
-- Sending requests
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('pat');
select lives_ok($$ insert into public.follows (follower_id, followee_id) values (auth.uid(), '00000000-0000-4000-a000-000000000002') $$,
  'pat can follow priya');
select is(pg_temp.follow_status('pat', 'priya'), 'pending', 'following a private account creates a pending request');
select is(pg_temp.follow_activities('pat', 'priya'), 0, 'no feed item while the request is pending');

select pg_temp.as_user('priya');
select lives_ok($$ insert into public.follows (follower_id, followee_id) values (auth.uid(), '00000000-0000-4000-a000-000000000001') $$,
  'priya can follow pat');
select is(pg_temp.follow_status('priya', 'pat'), 'accepted', 'following a public account is accepted immediately');
select is(pg_temp.follow_activities('priya', 'pat'), 1, 'an immediate accept writes a "started following" feed item');

select throws_ok($$ insert into public.follows (follower_id, followee_id, status) values (auth.uid(), '00000000-0000-4000-a000-000000000003', 'accepted') $$,
  '42501', null, 'clients cannot choose the status of a new follow');
select throws_ok($$ insert into public.follows (follower_id, followee_id) values ('00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000001') $$,
  '42501', null, 'users cannot follow on someone else''s behalf');
select throws_ok($$ insert into public.follows (follower_id, followee_id) values (auth.uid(), auth.uid()) $$,
  '23514', null, 'users cannot follow themselves');

-- ---------------------------------------------------------------------------------------------
-- Accepting
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('pat');
select is(pg_temp.rows_changed($$ update public.follows set status = 'accepted' where follower_id = auth.uid() and followee_id = '00000000-0000-4000-a000-000000000002' $$),
  0, 'the requester cannot accept their own request');
select is(pg_temp.rows_changed($$ update public.follows set status = 'accepted' where follower_id = '00000000-0000-4000-a000-000000000002' and followee_id = '00000000-0000-4000-a000-000000000003' $$),
  0, 'a third party cannot accept someone else''s request');
select is(pg_temp.follow_status('priya', 'fran'), 'pending', 'priya->fran is still pending');

select pg_temp.as_user('priya');
select is((select count(*)::int from public.concert_logs where user_id = pg_temp.uid('fran')), 0,
  'a pending request does not let priya see fran''s logs');

select pg_temp.as_user('fran');
select is(pg_temp.rows_changed($$ update public.follows set status = 'accepted' where follower_id = '00000000-0000-4000-a000-000000000002' and followee_id = auth.uid() $$),
  1, 'fran accepts priya''s request');
select is(pg_temp.follow_activities('priya', 'fran'), 1, 'accepting writes a "started following" feed item');
select is(pg_temp.rows_changed($$ update public.follows set status = 'pending' where follower_id = '00000000-0000-4000-a000-000000000002' and followee_id = auth.uid() $$),
  0, 'an accepted follow cannot go back to pending');

select pg_temp.as_user('priya');
select is((select count(*)::int from public.concert_logs where user_id = pg_temp.uid('fran')), 3,
  'once accepted, priya sees fran''s logs');

-- ---------------------------------------------------------------------------------------------
-- Declining, cancelling, unfollowing, removing a follower
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('priya');
select is(pg_temp.rows_changed($$ delete from public.follows where follower_id = '00000000-0000-4000-a000-000000000001' and followee_id = auth.uid() $$),
  1, 'priya declines pat''s request');
select is(pg_temp.follow_status('pat', 'priya'), 'none', 'a declined request is deleted');

select pg_temp.as_user('pat');
insert into public.follows (follower_id, followee_id) values (auth.uid(), '00000000-0000-4000-a000-000000000002');
select is(pg_temp.rows_changed($$ delete from public.follows where follower_id = auth.uid() and followee_id = '00000000-0000-4000-a000-000000000002' $$),
  1, 'pat cancels his own pending request');

select pg_temp.as_user('pat');
select is(pg_temp.rows_changed($$ delete from public.follows where follower_id = '00000000-0000-4000-a000-000000000002' and followee_id = '00000000-0000-4000-a000-000000000003' $$),
  0, 'a third party cannot delete someone else''s follow');

select pg_temp.as_user('fran');
select is(pg_temp.rows_changed($$ delete from public.follows where follower_id = '00000000-0000-4000-a000-000000000001' and followee_id = auth.uid() $$),
  1, 'fran removes pat as a follower');
select pg_temp.as_user('pat');
select is((select count(*)::int from public.concert_logs where user_id = pg_temp.uid('fran')), 0,
  'a removed follower can no longer see fran''s logs');

select pg_temp.as_user('priya');
select is(pg_temp.rows_changed($$ delete from public.follows where follower_id = auth.uid() and followee_id = '00000000-0000-4000-a000-000000000003' $$),
  1, 'priya unfollows fran');

-- ---------------------------------------------------------------------------------------------
-- Switching privacy
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('pat');
insert into public.follows (follower_id, followee_id) values (auth.uid(), '00000000-0000-4000-a000-000000000002');
select pg_temp.as_user('priya');
update public.profiles set is_private = false where id = auth.uid();
select is(pg_temp.follow_status('pat', 'priya'), 'accepted', 'going private -> public auto-accepts pending requests');
select is(pg_temp.follow_activities('pat', 'priya'), 1, 'the auto-accept writes a "started following" feed item');

update public.profiles set is_private = true where id = auth.uid();
select is(pg_temp.follow_status('pat', 'priya'), 'accepted', 'going public -> private keeps existing followers');

select pg_temp.as_user('fran');
select is(pg_temp.rows_changed($$ update public.profiles set is_private = false where id = '00000000-0000-4000-a000-000000000002' $$),
  0, 'users cannot change someone else''s privacy setting');

select pg_temp.as_postgres();
select * from finish();
rollback;
