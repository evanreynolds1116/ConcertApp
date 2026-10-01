-- Who can write what, data-model constraints, sign-up, account deletion, and a guard that
-- nothing in the public schema is open to signed-out visitors by accident.

begin;
\ir _helpers.psql
select plan(33);

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

-- ---------------------------------------------------------------------------------------------
-- Guard: grants in the public schema (2)
-- ---------------------------------------------------------------------------------------------
select is_empty($$
  select p.proname from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and (has_function_privilege('public', p.oid, 'execute')
         or (has_function_privilege('anon', p.oid, 'execute') and p.proname <> 'is_username_available'))
$$, 'no public-schema function is executable by PUBLIC or anon (except is_username_available)');

select is_empty($$
  select c.relname from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm')
    and (has_table_privilege('anon', c.oid, 'select, insert, update, delete')
         or not c.relrowsecurity and c.relkind = 'r')
$$, 'every public table has RLS enabled and none is open to anon');

-- ---------------------------------------------------------------------------------------------
-- Concert logs and lineups (17)
-- ---------------------------------------------------------------------------------------------
select pg_temp.as_user('pat');

select throws_ok($$ insert into public.concert_logs (user_id, show_id, source) values ('00000000-0000-4000-a000-000000000002', '30000000-0000-4000-a000-000000000006', 'manual') $$,
  '42501', null, 'users cannot log a concert for someone else');

-- pat logs the Ryman show (show 6) with a one-artist lineup.
insert into public.concert_logs (id, user_id, show_id, source)
values ('10000000-0000-4000-a000-0000000000aa', auth.uid(), '30000000-0000-4000-a000-000000000006', 'manual');
select throws_ok('set constraints all immediate', '23514', 'a concert log needs at least one artist',
  'a log without any artists is rejected');
insert into public.log_artists (log_id, artist_id, position)
values ('10000000-0000-4000-a000-0000000000aa', '40000000-0000-4000-a000-000000000004', 1);
select lives_ok('set constraints all immediate', 'a log with one artist is accepted');
set constraints all deferred; -- an immediate check that succeeds stays in force until changed
select is((select count(*)::int from public.activities where log_id = '10000000-0000-4000-a000-0000000000aa' and type = 'concert_logged'),
  1, 'logging a concert writes a "logged" feed item');

select throws_ok($$ insert into public.concert_logs (user_id, show_id, source) values (auth.uid(), '30000000-0000-4000-a000-000000000006', 'manual') $$,
  '23505', null, 'a user cannot log the same show twice');
select throws_ok($$ update public.concert_logs set rating_tenths = 101 where id = '10000000-0000-4000-a000-0000000000aa' $$,
  '23514', null, 'ratings above 10.0 are rejected');
select lives_ok($$ update public.concert_logs set rating_tenths = 0, ticket_price_cents = 0 where id = '10000000-0000-4000-a000-0000000000aa' $$,
  'a 0.0 rating and a $0 price are real values');
select throws_ok($$ update public.concert_logs set ticket_price_cents = -1 where id = '10000000-0000-4000-a000-0000000000aa' $$,
  '23514', null, 'negative prices are rejected');
select throws_ok($$ update public.concert_logs set show_id = '30000000-0000-4000-a000-000000000002' where id = '10000000-0000-4000-a000-0000000000aa' $$,
  '42501', null, 'venue/date (show_id) cannot be changed after saving');
select throws_ok($$ update public.concert_logs set user_id = '00000000-0000-4000-a000-000000000003' where id = '10000000-0000-4000-a000-0000000000aa' $$,
  '42501', null, 'a log cannot be handed to another user');

-- Someone else's logs: priya's (invisible to pat) and fran's (visible to pat, not his).
select is(pg_temp.rows_changed($$ update public.concert_logs set notes = 'x' where user_id = '00000000-0000-4000-a000-000000000002' $$),
  0, 'pat cannot edit priya''s logs');
select is(pg_temp.rows_changed($$ update public.concert_logs set notes = 'x' where user_id = '00000000-0000-4000-a000-000000000003' $$),
  0, 'pat cannot edit fran''s logs even though he can see them');
select is(pg_temp.rows_changed($$ delete from public.concert_logs where user_id = '00000000-0000-4000-a000-000000000003' $$),
  0, 'pat cannot delete fran''s logs');
select throws_ok($$ insert into public.log_artists (log_id, artist_id, position) values ('10000000-0000-4000-a000-000000000007', '40000000-0000-4000-a000-000000000001', 3) $$,
  '42501', null, 'pat cannot add artists to fran''s lineup');

-- fran removes the only artist from her Crystal Ballroom log (log 9).
select pg_temp.as_user('fran');
delete from public.log_artists where log_id = '10000000-0000-4000-a000-000000000009';
select throws_ok('set constraints all immediate', '23514', 'a concert log needs at least one artist',
  'removing the last artist from a lineup is rejected');

-- Put the artist back so the queued check passes later.
insert into public.log_artists (log_id, artist_id, position)
values ('10000000-0000-4000-a000-000000000009', '40000000-0000-4000-a000-000000000009', 1);

-- Reordering swaps positions inside one transaction (log 7: Shakey Graves 1, Langhorne Slim 2).
select lives_ok($$
  update public.log_artists set position = case position when 1 then 2 else 1 end
  where log_id = '10000000-0000-4000-a000-000000000007';
  set constraints all immediate;
$$, 'a lineup can be reordered by swapping positions');
set constraints all deferred;

select pg_temp.as_user('pat');
select is(pg_temp.rows_changed($$ delete from public.concert_logs where id = '10000000-0000-4000-a000-000000000002' $$),
  1, 'pat deletes his own log');

-- ---------------------------------------------------------------------------------------------
-- Shared reference data and feed items are not writable by clients (5)
-- ---------------------------------------------------------------------------------------------
select throws_ok($$ insert into public.activities (actor_id, type, target_user_id) values (auth.uid(), 'follow_started', '00000000-0000-4000-a000-000000000002') $$,
  '42501', null, 'clients cannot write feed items');
select throws_ok($$ insert into public.shows (venue_id, date) values ('20000000-0000-4000-a000-000000000001', '2020-01-01') $$,
  '42501', null, 'clients cannot write shows directly');
select throws_ok($$ insert into public.venues (name, city, state) values ('X', 'Y', 'TN') $$,
  '42501', null, 'clients cannot write venues directly');
select throws_ok($$ insert into public.artists (name) values ('X') $$,
  '42501', null, 'clients cannot write artists directly');

select pg_temp.as_postgres();
select is((select count(*)::int from public.activities where log_id = '10000000-0000-4000-a000-000000000002'),
  0, 'deleting a log removes its feed item');

-- ---------------------------------------------------------------------------------------------
-- Data-model constraints checked as postgres (2)
-- ---------------------------------------------------------------------------------------------
select throws_ok($$ insert into public.venues (name, city, state) values ('Somewhere', 'Toronto', 'ON') $$,
  '23514', null, 'venues must be in a US state');
select throws_ok($$ insert into public.shows (venue_id, date) values ('20000000-0000-4000-a000-000000000001', '2023-10-31') $$,
  '23505', null, 'one show per venue per date');

-- ---------------------------------------------------------------------------------------------
-- Sign-up creates the profile (5)
-- ---------------------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
values ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-a000-0000000000b1', 'authenticated', 'authenticated',
  'new@example.com', '{"username": "New_User", "display_name": "  "}');
select results_eq(
  $$ select username::text, display_name, is_private from public.profiles where id = '00000000-0000-4000-a000-0000000000b1' $$,
  $$ values ('New_User', 'New_User', true) $$,
  'sign-up creates a private profile; a blank display name falls back to the username'
);
select ok(not public.is_username_available('new_user'), 'usernames are case-insensitive when checking availability');
select throws_ok($$ insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'dupe@example.com', '{"username": "PAT_PUBLIC"}') $$,
  '23505', null, 'a username that differs only by case is taken');
select throws_ok($$ insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'bad@example.com', '{"username": "no spaces!"}') $$,
  '23514', null, 'usernames are 3-30 letters, numbers or underscores');
select throws_ok($$ insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'none@example.com', '{}') $$,
  '23502', null, 'sign-up without a username fails');

-- ---------------------------------------------------------------------------------------------
-- Deleting an account deletes all of that user's logs, follows and activity (2)
-- ---------------------------------------------------------------------------------------------
delete from auth.users where id = pg_temp.uid('fran');
select results_eq(
  $$ select
       (select count(*) from public.profiles where id = '00000000-0000-4000-a000-000000000003')
     + (select count(*) from public.concert_logs where user_id = '00000000-0000-4000-a000-000000000003')
     + (select count(*) from public.follows where '00000000-0000-4000-a000-000000000003' in (follower_id, followee_id))
     + (select count(*) from public.activities where '00000000-0000-4000-a000-000000000003' in (actor_id, target_user_id)) $$,
  $$ values (0::bigint) $$,
  'deleting fran removes her profile, logs, follows and feed items'
);
select is((select count(*)::int from public.shows where id = '30000000-0000-4000-a000-000000000002'),
  1, 'shared shows stay when an attendee deletes their account');

select * from finish();
rollback;
