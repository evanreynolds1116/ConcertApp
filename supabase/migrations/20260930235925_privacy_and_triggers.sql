-- Privacy and automation. See docs/spec.md, "Privacy & social rules".
--
-- One rule decides visibility: can_view(viewer, owner) is true when the viewer IS the owner,
-- the owner is public, or the viewer is an accepted follower. Every read policy on user data
-- goes through it. Signed-out visitors (the anon role) get no table access at all.

-- ---------------------------------------------------------------------------------------------
-- Grants: deny by default, then grant exactly what the app needs.
-- Supabase's defaults grant everything on public tables to anon and authenticated. Turn that
-- off for this schema, including future tables: each new table must be granted explicitly.
-- Functions: Postgres also lets PUBLIC (which includes anon) execute every new function, and a
-- per-schema default can't remove that. So every function in public must
-- `revoke execute ... from public` and then grant to the roles that need it.
-- ---------------------------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant select on
  public.profiles, public.artists, public.venues, public.shows,
  public.concert_logs, public.log_artists, public.follows, public.activities
to authenticated;

-- Profiles are created by a trigger on sign-up; users edit their own.
grant update (username, display_name, avatar_url, is_private) on public.profiles to authenticated;
-- Logs: venue/date (show_id) and owner can't change after saving; delete and re-add instead.
grant insert, delete on public.concert_logs to authenticated;
grant update (rating_tenths, notes, ticket_price_cents) on public.concert_logs to authenticated;
grant insert, delete on public.log_artists to authenticated;
grant update (position) on public.log_artists to authenticated;
-- Follows: status is set by a trigger on insert; only the followee can accept.
grant insert (follower_id, followee_id), delete on public.follows to authenticated;
grant update (status) on public.follows to authenticated;
-- activities: written only by triggers. artists/venues/shows: written by log_concert (Phase 2).

-- ---------------------------------------------------------------------------------------------
-- can_view
-- ---------------------------------------------------------------------------------------------
create function public.can_view(viewer_id uuid, owner_id uuid)
returns boolean
language sql
stable
security definer -- reads profiles/follows without recursing into their own policies
set search_path = ''
as $$
  select viewer_id is not null and (
    viewer_id = owner_id
    or exists (select 1 from public.profiles p where p.id = owner_id and not p.is_private)
    or exists (
      select 1 from public.follows f
      where f.follower_id = viewer_id and f.followee_id = owner_id and f.status = 'accepted'
    )
  );
$$;
revoke execute on function public.can_view(uuid, uuid) from public;
grant execute on function public.can_view(uuid, uuid) to authenticated;

-- Sign-up form check. Callable signed out, so it reveals only whether a username is taken.
create function public.is_username_available(name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- With search_path = '', a bare `=` resolves to case-sensitive text equality. Name citext's
  -- operator so the check is case-insensitive like the unique constraint.
  select not exists (
    select 1 from public.profiles where username operator(extensions.=) name::extensions.citext
  );
$$;
revoke execute on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.artists enable row level security;
alter table public.venues enable row level security;
alter table public.shows enable row level security;
alter table public.concert_logs enable row level security;
alter table public.log_artists enable row level security;
alter table public.follows enable row level security;
alter table public.activities enable row level security;

-- Username, display name, avatar: every signed-in user (so people can be found and followed).
create policy "profiles: signed-in users can read" on public.profiles
  for select to authenticated using (true);
create policy "profiles: users update their own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Shared reference data. Nothing here says who attended what.
create policy "artists: signed-in users can read" on public.artists
  for select to authenticated using (true);
create policy "venues: signed-in users can read" on public.venues
  for select to authenticated using (true);
create policy "shows: signed-in users can read" on public.shows
  for select to authenticated using (true);

-- Concert logs, lineups, ratings, notes, prices: can_view.
create policy "concert_logs: can_view" on public.concert_logs
  for select to authenticated using (public.can_view((select auth.uid()), user_id));
create policy "concert_logs: owners insert" on public.concert_logs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "concert_logs: owners update" on public.concert_logs
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "concert_logs: owners delete" on public.concert_logs
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "log_artists: can_view the log owner" on public.log_artists
  for select to authenticated using (
    exists (
      select 1 from public.concert_logs l
      where l.id = log_id and public.can_view((select auth.uid()), l.user_id)
    )
  );
create policy "log_artists: log owners insert" on public.log_artists
  for insert to authenticated with check (
    exists (select 1 from public.concert_logs l where l.id = log_id and l.user_id = (select auth.uid()))
  );
create policy "log_artists: log owners update" on public.log_artists
  for update to authenticated
  using (exists (select 1 from public.concert_logs l where l.id = log_id and l.user_id = (select auth.uid())))
  with check (exists (select 1 from public.concert_logs l where l.id = log_id and l.user_id = (select auth.uid())));
create policy "log_artists: log owners delete" on public.log_artists
  for delete to authenticated using (
    exists (select 1 from public.concert_logs l where l.id = log_id and l.user_id = (select auth.uid()))
  );

-- Follows. Accepted rows are on someone's follower/following list, visible when can_view is
-- true for either side. Pending requests: only the receiver, plus the sender (who needs it for
-- the "Requested" button and to cancel).
create policy "follows: own rows and visible lists" on public.follows
  for select to authenticated using (
    follower_id = (select auth.uid())
    or followee_id = (select auth.uid())
    or (
      status = 'accepted'
      and (public.can_view((select auth.uid()), follower_id) or public.can_view((select auth.uid()), followee_id))
    )
  );
create policy "follows: users follow as themselves" on public.follows
  for insert to authenticated with check (follower_id = (select auth.uid()));
create policy "follows: followee accepts a pending request" on public.follows
  for update to authenticated
  using (followee_id = (select auth.uid()) and status = 'pending')
  with check (followee_id = (select auth.uid()) and status = 'accepted');
-- Follower unfollows or cancels; followee declines or removes a follower.
create policy "follows: either side deletes" on public.follows
  for delete to authenticated using (
    follower_id = (select auth.uid()) or followee_id = (select auth.uid())
  );

-- Feed items: can_view on the actor.
create policy "activities: can_view the actor" on public.activities
  for select to authenticated using (public.can_view((select auth.uid()), actor_id));

-- ---------------------------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------------------------

-- Create the profile when someone signs up. The sign-up form sends username and display_name
-- as user metadata; a missing or invalid username fails the sign-up.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), new.raw_user_meta_data ->> 'username')
  );
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Following a public account is accepted immediately; a private account gets a pending request.
-- Whatever status the client sends is ignored.
create function private.follows_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select case when p.is_private then 'pending' else 'accepted' end
    into new.status
    from public.profiles p where p.id = new.followee_id;
  new.created_at := now();
  new.accepted_at := case when new.status = 'accepted' then now() end;
  return new;
end;
$$;
create trigger follows_before_insert
  before insert on public.follows
  for each row execute function private.follows_before_insert();

create function private.follows_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'accepted' and new.status <> 'accepted' then
    raise exception 'an accepted follow cannot go back to pending' using errcode = '23514';
  end if;
  if old.status = 'pending' and new.status = 'accepted' then
    new.accepted_at := now();
  end if;
  return new;
end;
$$;
create trigger follows_before_update
  before update on public.follows
  for each row execute function private.follows_before_update();

-- Feed event when a follow becomes accepted (immediately for public accounts, or on accept).
create function private.follows_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status <> 'accepted') then
    insert into public.activities (actor_id, type, target_user_id)
    values (new.follower_id, 'follow_started', new.followee_id);
  end if;
  return null;
end;
$$;
create trigger follows_activity
  after insert or update of status on public.follows
  for each row execute function private.follows_activity();

-- Switching private -> public auto-accepts all pending requests. Public -> private keeps followers.
create function private.profiles_went_public()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.follows set status = 'accepted'
  where followee_id = new.id and status = 'pending';
  return null;
end;
$$;
create trigger profiles_went_public
  after update of is_private on public.profiles
  for each row when (old.is_private and not new.is_private)
  execute function private.profiles_went_public();

-- Feed event for each new log. Deleting the log removes it through the cascade.
create function private.concert_logs_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activities (actor_id, type, log_id)
  values (new.user_id, 'concert_logged', new.id);
  return null;
end;
$$;
create trigger concert_logs_activity
  after insert on public.concert_logs
  for each row execute function private.concert_logs_activity();

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger concert_logs_set_updated_at
  before update on public.concert_logs
  for each row execute function private.set_updated_at();

-- At least one artist per log, checked at commit so a log and its lineup can be written in
-- one transaction (and a lineup can be replaced by delete + insert).
create function private.check_log_has_artists()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log_id uuid;
begin
  if tg_table_name = 'concert_logs' then
    v_log_id := new.id;
  else
    v_log_id := old.log_id;
  end if;
  if exists (select 1 from public.concert_logs where id = v_log_id)
     and not exists (select 1 from public.log_artists where log_id = v_log_id) then
    raise exception 'a concert log needs at least one artist' using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger concert_logs_has_artists
  after insert on public.concert_logs
  deferrable initially deferred
  for each row execute function private.check_log_has_artists();
create constraint trigger log_artists_keeps_one
  after delete on public.log_artists
  deferrable initially deferred
  for each row execute function private.check_log_has_artists();
