-- Phase 5: people search, profiles, follower lists, requests, feed, avatars, account deletion.
-- Seed: pat (public) <-> fran (private) follow each other; priya (private) has a pending
-- request to fran. Tests that write roll back.

begin;
\ir _helpers.psql
select plan(31);

-- ---------------------------------------------------------------------------------------------
-- search_people
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('priya');
select results_eq(
  $$ select username, follow_status from public.search_people('  FRAN ') $$,
  $$ values ('fran_followed', 'pending') $$,
  'search by part of a username, ignoring case; shows the viewer''s pending request'
);
select results_eq(
  $$ select username, follow_status from public.search_people('pat pub') $$,
  $$ values ('pat_public', 'none') $$,
  'search by display name'
);
select is_empty($$ select * from public.search_people('priya') $$, 'you don''t find yourself');
select is_empty($$ select * from public.search_people('%') $$, 'search text is literal, not a pattern');
select is_empty($$ select * from public.search_people('   ') $$, 'a blank search finds nobody');
select results_eq(
  $$ select is_private from public.search_people('fran') $$,
  $$ values (true) $$,
  'results say whether an account is private (for the lock icon)'
);

-- ---------------------------------------------------------------------------------------------
-- profile_overview
-- ---------------------------------------------------------------------------------------------
select results_eq(
  $$ select display_name, can_view, follow_status, concerts, followers, following from public.profile_overview('Fran_Followed') $$,
  $$ values ('Fran Followed', false, 'pending', null::int, null::int, null::int) $$,
  'locked profile: names and request status, but no counts (username lookup ignores case)'
);
select pg_temp.as_user('pat');
select results_eq(
  $$ select can_view, follow_status, follows_viewer, concerts, followers, following, is_self from public.profile_overview('fran_followed') $$,
  $$ values (true, 'accepted', true, 3, 1, 1, false) $$,
  'an accepted follower sees counts, and that fran follows him back'
);
select results_eq(
  $$ select is_self, can_view, concerts from public.profile_overview('pat_public') $$,
  $$ values (true, true, 4) $$,
  'your own profile'
);
select is_empty($$ select * from public.profile_overview('nobody_by_that_name') $$, 'unknown usernames find nothing');

-- ---------------------------------------------------------------------------------------------
-- follow_list: follower/following lists follow can_view on the list's owner
-- ---------------------------------------------------------------------------------------------
select results_eq(
  $$ select username from public.follow_list(pg_temp.uid('fran'), 'followers') $$,
  $$ values ('pat_public') $$,
  'pat sees fran''s followers'
);
select pg_temp.as_user('priya');
-- The pat->fran row is visible to priya through pat's (public) following list, so the
-- function must check can_view on fran itself.
select is_empty($$ select * from public.follow_list(pg_temp.uid('fran'), 'followers') $$,
  'priya can''t list private fran''s followers');
select results_eq(
  $$ select username from public.follow_list(pg_temp.uid('pat'), 'following') $$,
  $$ values ('fran_followed') $$,
  'but she can see public pat''s following list (which includes fran)'
);
select results_eq(
  $$ select username, follow_status from public.follow_list(pg_temp.uid('pat'), 'followers') $$,
  $$ values ('fran_followed', 'pending') $$,
  'each list entry carries the viewer''s own follow status'
);
select throws_ok($$ select * from public.follow_list('00000000-0000-4000-a000-000000000001', 'friends') $$,
  '22023', null, 'unknown list kinds are rejected');

-- ---------------------------------------------------------------------------------------------
-- follow_requests: only the receiver sees them
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('fran');
select results_eq($$ select username from public.follow_requests() $$, $$ values ('priya_private') $$,
  'fran sees priya''s pending request');
select pg_temp.as_user('pat');
select is_empty($$ select * from public.follow_requests() $$, 'pat has none');

-- ---------------------------------------------------------------------------------------------
-- feed: own activity + accounts you follow (accepted), newest first, paged
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('pat');
select results_eq(
  $$ select bool_and(actor_id in (pg_temp.uid('pat'), pg_temp.uid('fran'))), count(*)::int > 0 from public.feed() $$,
  $$ values (true, true) $$,
  'pat''s feed has only his own and fran''s activity'
);
select ok(
  (select bool_and(created_at >= coalesce(next_at, created_at))
   from (select created_at, lead(created_at) over (order by created_at desc, id desc) as next_at from public.feed()) x),
  'newest first'
);
select results_eq(
  $$ select type, actor_username, target_username from public.feed() where type = 'follow_started' order by created_at $$,
  $$ values ('follow_started', 'pat_public', 'fran_followed'), ('follow_started', 'fran_followed', 'pat_public') $$,
  '"started following" items name both people'
);
select results_eq(
  $$ select headliner, artist_count, festival_name, festival_day_label, city, state from public.feed() where log_id = '10000000-0000-4000-a000-000000000004' $$,
  $$ values ('Fred again..', 3, 'Bonnaroo', 'Day 4', 'Manchester', 'TN') $$,
  'concert items carry what the card shows'
);
select is(
  (select count(*)::int from public.feed(
     (select created_at from public.feed(p_limit => 3) order by created_at, id limit 1),
     (select id from public.feed(p_limit => 3) order by created_at, id limit 1))),
  (select count(*)::int from public.feed()) - 3,
  'keyset paging continues exactly after the last item'
);
select pg_temp.as_user('priya');
select is((select count(*)::int from public.feed() where actor_id <> auth.uid()), 0,
  'priya follows nobody yet (her request is pending): only her own activity');
insert into public.follows (follower_id, followee_id) values (auth.uid(), pg_temp.uid('pat'));
select ok((select count(*) from public.feed() where actor_id = pg_temp.uid('pat')) > 0,
  'after following public pat, his activity appears');
select is((select count(*)::int from public.feed() where type = 'follow_started' and actor_id = auth.uid()), 1,
  'and her own "started following pat" item');

-- ---------------------------------------------------------------------------------------------
-- Avatars: own folder only; the profile can only point into it
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('pat');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values ('avatars', '00000000-0000-4000-a000-000000000001/a1.webp', auth.uid()::text) $$,
  'pat can store an avatar in his own folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id) values ('avatars', '00000000-0000-4000-a000-000000000002/a1.webp', auth.uid()::text) $$,
  '42501', null, 'but not in someone else''s'
);
select throws_ok(
  $$ update public.profiles set avatar_url = '00000000-0000-4000-a000-000000000002/a1.webp' where id = auth.uid() $$,
  '23514', null, 'a profile can''t point at someone else''s avatar'
);
select pg_temp.as_anon();
-- anon has table access to storage.objects (Supabase default); RLS returns no rows.
select is_empty($$ select * from storage.objects where bucket_id = 'avatars' $$,
  'signed-out visitors see no avatars (pat''s upload above is invisible to them)');

-- ---------------------------------------------------------------------------------------------
-- delete_account
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('fran');
select lives_ok($$ select public.delete_account() $$, 'fran deletes her account');
select pg_temp.as_postgres();
select is(
  (select count(*)::int from public.profiles where id = pg_temp.uid('fran'))
  + (select count(*)::int from public.concert_logs where user_id = pg_temp.uid('fran'))
  + (select count(*)::int from public.follows where pg_temp.uid('fran') in (follower_id, followee_id))
  + (select count(*)::int from public.activities where pg_temp.uid('fran') in (actor_id, target_user_id))
  + (select count(*)::int from auth.users where id = pg_temp.uid('fran')),
  0, 'her account, profile, logs, follows and feed items are gone'
);

select * from finish();
rollback;
