-- Phase 5: social (docs/spec.md, "Privacy & social rules").
--   * avatars: a private storage bucket. Signed-in users can read; each user writes only in
--     their own folder ("<user id>/..."). profiles.avatar_url holds the storage path.
--   * search_people, profile_overview, follow_list, follow_requests, feed: run as the caller
--     (security invoker), so RLS and can_view decide what's visible
--   * delete_account: deletes the caller's auth user; everything they own cascades
-- Following itself (insert/accept/delete on follows) was built in the Phase 1 migrations.

-- ---------------------------------------------------------------------------------------------
-- Avatars
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Username, display name, avatar: every signed-in user (signed-out visitors get nothing).
create policy "avatars: signed-in users can read" on storage.objects
  for select to authenticated using (bucket_id = 'avatars');
create policy "avatars: users upload to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: users update their own files" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: users delete their own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- A profile can only point at an avatar in its own folder.
alter table public.profiles
  add constraint profiles_avatar_in_own_folder
  check (avatar_url is null or avatar_url ~ ('^' || id::text || '/[A-Za-z0-9_-]{1,64}\.(webp|jpg|png)$'));

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------
-- The viewer's follow toward someone: 'none', 'pending' or 'accepted'.
create function public.my_follow_status(p_user_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select status from public.follows where follower_id = (select auth.uid()) and followee_id = p_user_id),
    'none'
  );
$$;
revoke execute on function public.my_follow_status(uuid) from public;
grant execute on function public.my_follow_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- search_people
-- ---------------------------------------------------------------------------------------------
/*
  Signed-in users find each other by username or display name (part of either, ignoring case).
  Best matches first: exact username, then usernames and names that start with the query.
  Excludes the viewer. At most 20 results.
*/
create function public.search_people(p_query text)
returns table (
  id uuid, username text, display_name text, avatar_url text, is_private boolean, follow_status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select lower(btrim(p_query)) as q)
  select p.id, p.username::text, p.display_name, p.avatar_url, p.is_private, public.my_follow_status(p.id)
  from public.profiles p, q
  where q.q <> ''
    and p.id <> (select auth.uid())
    and (strpos(lower(p.username::text), q.q) > 0 or strpos(lower(p.display_name), q.q) > 0)
  order by
    case
      when lower(p.username::text) = q.q then 0
      when starts_with(lower(p.username::text), q.q) then 1
      when starts_with(lower(p.display_name), q.q) then 2
      else 3
    end,
    lower(p.display_name), lower(p.username::text)
  limit 20;
$$;
revoke execute on function public.search_people(text) from public;
grant execute on function public.search_people(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- profile_overview
-- ---------------------------------------------------------------------------------------------
/*
  Everything a profile header needs. Names and avatar are always there (every signed-in user
  can see them); counts are null unless the viewer can see this user's data (can_view).
    follow_status  viewer -> them: 'none' | 'pending' | 'accepted'
    follows_viewer them -> viewer is accepted
*/
create function public.profile_overview(p_username text)
returns table (
  id uuid, username text, display_name text, avatar_url text, is_private boolean,
  is_self boolean, can_view boolean, follow_status text, follows_viewer boolean,
  concerts integer, followers integer, following integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id, p.username::text, p.display_name, p.avatar_url, p.is_private,
    p.id = (select auth.uid()),
    v.can_view,
    public.my_follow_status(p.id),
    exists (select 1 from public.follows f
            where f.follower_id = p.id and f.followee_id = (select auth.uid()) and f.status = 'accepted'),
    case when v.can_view then (select count(*)::integer from public.concert_logs l where l.user_id = p.id) end,
    case when v.can_view then (select count(*)::integer from public.follows f where f.followee_id = p.id and f.status = 'accepted') end,
    case when v.can_view then (select count(*)::integer from public.follows f where f.follower_id = p.id and f.status = 'accepted') end
  from public.profiles p
  cross join lateral (select public.can_view((select auth.uid()), p.id) as can_view) v
  -- A bare `=` would be case-sensitive here (search_path = ''); use citext's operator.
  where p.username operator(extensions.=) p_username::extensions.citext;
$$;
revoke execute on function public.profile_overview(text) from public;
grant execute on function public.profile_overview(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- follow_list / follow_requests
-- ---------------------------------------------------------------------------------------------
/*
  A user's followers or following (accepted), with the viewer's own follow status toward each.
  Empty unless can_view(viewer, user): follows rows are also visible through the *other*
  side's lists, so this explicit check keeps a private user's list private.
*/
create function public.follow_list(p_user_id uuid, p_kind text)
returns table (
  id uuid, username text, display_name text, avatar_url text, is_private boolean, follow_status text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_kind not in ('followers', 'following') then
    raise exception 'kind must be followers or following' using errcode = '22023';
  end if;
  return query
  select p.id, p.username::text, p.display_name, p.avatar_url, p.is_private, public.my_follow_status(p.id)
  from public.follows f
  join public.profiles p on p.id = case when p_kind = 'followers' then f.follower_id else f.followee_id end
  where f.status = 'accepted'
    and (case when p_kind = 'followers' then f.followee_id else f.follower_id end) = p_user_id
    and public.can_view((select auth.uid()), p_user_id)
  order by lower(p.display_name), lower(p.username::text);
end;
$$;
revoke execute on function public.follow_list(uuid, text) from public;
grant execute on function public.follow_list(uuid, text) to authenticated;

/* Pending requests to follow the viewer, oldest first. */
create function public.follow_requests()
returns table (id uuid, username text, display_name text, avatar_url text, requested_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.username::text, p.display_name, p.avatar_url, f.created_at
  from public.follows f
  join public.profiles p on p.id = f.follower_id
  where f.followee_id = (select auth.uid()) and f.status = 'pending'
  order by f.created_at, p.id;
$$;
revoke execute on function public.follow_requests() from public;
grant execute on function public.follow_requests() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- feed
-- ---------------------------------------------------------------------------------------------
/*
  The viewer's activity plus activity from accounts they follow (accepted), newest first.
  Keyset paging: pass the last item's created_at and id to get the next page.
  Concert items carry what a feed card shows; follow items carry the target's names.
*/
create function public.feed(
  p_before_created_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 20
)
returns table (
  id uuid,
  created_at timestamptz,
  type text,
  actor_id uuid,
  actor_username text,
  actor_display_name text,
  actor_avatar_url text,
  target_id uuid,
  target_username text,
  target_display_name text,
  log_id uuid,
  show_date date,
  festival_name text,
  festival_day_label text,
  venue_name text,
  city text,
  state text,
  headliner text,
  artist_count integer,
  rating_tenths smallint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    a.id, a.created_at, a.type,
    actor.id, actor.username::text, actor.display_name, actor.avatar_url,
    target.id, target.username::text, target.display_name,
    l.id, s.date, s.festival_name, s.festival_day_label, v.name, v.city, v.state,
    (select ar.name from public.log_artists la join public.artists ar on ar.id = la.artist_id
      where la.log_id = l.id order by la.position limit 1),
    (select count(*)::integer from public.log_artists la where la.log_id = l.id),
    l.rating_tenths
  from public.activities a
  join public.profiles actor on actor.id = a.actor_id
  left join public.profiles target on target.id = a.target_user_id
  left join public.concert_logs l on l.id = a.log_id
  left join public.shows s on s.id = l.show_id
  left join public.venues v on v.id = s.venue_id
  where (
      a.actor_id = (select auth.uid())
      or exists (select 1 from public.follows f
                 where f.follower_id = (select auth.uid()) and f.followee_id = a.actor_id and f.status = 'accepted')
    )
    -- A concert item whose log the viewer can't see (shouldn't happen: same owner) is skipped.
    and (a.type <> 'concert_logged' or l.id is not null)
    and (p_before_created_at is null or (a.created_at, a.id) < (p_before_created_at, p_before_id))
  order by a.created_at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke execute on function public.feed(timestamptz, uuid, integer) from public;
grant execute on function public.feed(timestamptz, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- delete_account
-- ---------------------------------------------------------------------------------------------
/*
  Deletes the caller's account and, through cascades, their profile, logs, lineups, follows
  (both directions) and feed items. Shared shows, venues and artists stay. The app removes
  the user's avatar files from storage first (storage objects aren't deleted by SQL).
*/
create function public.delete_account()
returns void
language plpgsql
security definer -- the auth schema isn't writable by clients
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'sign in to delete your account' using errcode = '42501';
  end if;
  delete from auth.users where id = v_user;
end;
$$;
revoke execute on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
