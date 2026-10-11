-- Security hardening from SECURITY_AUDIT.md (2026-10-11).
--   M1  setlist.fm details in a log must be signed by the setlist-search Edge Function
--   M3  per-user search quota, enforced by the Edge Function
--   L2  can_view only answers for the signed-in viewer
--   L3  shows, venues and artists are visible only through a log the viewer can see
--   L6  deleting an account needs a recent password sign-in and no avatar files left
--   L9  avatars: WebP only; readable only by their owner or when a profile shows them

-- ---------------------------------------------------------------------------------------------
-- M1: signing key. Random per database, generated here (never in git). The Edge Function
-- reads it with the service role; the database uses it to check signatures.
-- ---------------------------------------------------------------------------------------------
create table private.app_secrets (
  name text primary key,
  value text not null
);
alter table private.app_secrets enable row level security;
revoke all on private.app_secrets from public, anon, authenticated;

insert into private.app_secrets (name, value)
values ('lineup_signing_key', encode(extensions.gen_random_bytes(32), 'hex'));

/*
  HMAC-SHA256 of the kind and the fields, each trimmed, joined by the unit separator (chr 31).
  Must match signLineupFields() in supabase/functions/_shared/setlistfm/signing.ts.
    show:   setlistfmId, venue name, city, state, date, festival name, day label
    artist: mbid, name, setlistfmUrl, setlistUrl, date
*/
create function private.lineup_signature(p_kind text, p_fields text[])
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(
    extensions.hmac(
      p_kind || chr(31) || array_to_string(
        array(select btrim(coalesce(f, '')) from unnest(p_fields) with ordinality as t(f, i) order by i),
        chr(31)
      ),
      (select value from private.app_secrets where name = 'lineup_signing_key'),
      'sha256'
    ),
    'hex'
  );
$$;

create function public.lineup_signing_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select value from private.app_secrets where name = 'lineup_signing_key';
$$;
revoke execute on function public.lineup_signing_key() from public, anon, authenticated;
grant execute on function public.lineup_signing_key() to service_role;

-- ---------------------------------------------------------------------------------------------
-- M1: resolve_artist. An MBID now always comes from a signed artist, so setlist.fm's name for
-- it wins: this also repairs any name set before signing existed.
-- ---------------------------------------------------------------------------------------------
create or replace function private.resolve_artist(p_name text, p_mbid text, p_setlistfm_url text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_mbid text := nullif(btrim(p_mbid), '');
  v_id uuid;
begin
  if coalesce(v_name, '') = '' or char_length(v_name) > 200 then
    raise exception 'each artist needs a name of up to 200 characters' using errcode = '22023';
  end if;

  if v_mbid is not null then
    update public.artists
    set name = v_name,
        setlistfm_url = coalesce(private.setlistfm_url_or_null(p_setlistfm_url), setlistfm_url)
    where mbid = v_mbid
    returning id into v_id;
    if v_id is null then
      update public.artists
      set mbid = v_mbid, setlistfm_url = private.setlistfm_url_or_null(p_setlistfm_url)
      where mbid is null and lower(name) = lower(v_name)
      returning id into v_id;
    end if;
    if v_id is null then
      insert into public.artists (name, mbid, setlistfm_url)
      values (v_name, v_mbid, private.setlistfm_url_or_null(p_setlistfm_url))
      on conflict (mbid) do update set name = excluded.name
      returning id into v_id;
    end if;
  else
    select id into v_id from public.artists
    where lower(name) = lower(v_name)
    order by (mbid is null), id
    limit 1;
    if v_id is null then
      insert into public.artists (name)
      values (v_name)
      on conflict ((lower(name))) where mbid is null do update set name = public.artists.name
      returning id into v_id;
    end if;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- M1: log_concert checks signatures. The show's setlist.fm link now comes from the signed
-- headliner, so p_setlistfm_url is gone and p_show_signature is new.
-- ---------------------------------------------------------------------------------------------
drop function public.log_concert(text, date, jsonb, jsonb, text, text, smallint, integer, text, text);

/*
  p_venue:   { "name", "city", "state", "setlistfmId"? }
  p_artists: [ { "name", "mbid"?, "setlistfmUrl"?, "setlistUrl"?, "signature"? }, ... ] in
             lineup order, headliner first.
  setlist.fm logs (p_source 'setlistfm') must carry p_show_signature, the setlist-search
  function's signature over the venue, date, festival name and day label; anything else is
  refused. Each artist keeps its MBID and setlist.fm links only with a valid signature;
  unsigned artists (added by hand in the lineup editor) are matched by name like manual ones.
  Signed details are setlist.fm's, so they win over what's stored: a verified venue name,
  artist name or festival label replaces an older one.
  Returns the new log's id. If the user already logged this show, raises SQLSTATE 23505 with
  message 'already_logged' and the existing log's id as the DETAIL.
*/
create function public.log_concert(
  p_source text,
  p_date date,
  p_venue jsonb,
  p_artists jsonb,
  p_festival_name text default null,
  p_rating_tenths smallint default null,
  p_ticket_price_cents integer default null,
  p_notes text default null,
  p_festival_day_label text default null,
  p_show_signature text default null
)
returns uuid
language plpgsql
security definer -- writes shared venues/artists/shows, which clients can't write directly
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_from_setlistfm boolean := p_source = 'setlistfm';
  v_venue_name text := btrim(p_venue ->> 'name');
  v_city text := btrim(p_venue ->> 'city');
  v_state text := upper(btrim(p_venue ->> 'state'));
  v_setlistfm_venue_id text;
  v_festival_name text := nullif(btrim(p_festival_name), '');
  v_day_label text := case when v_festival_name is not null then nullif(btrim(p_festival_day_label), '') end;
  v_venue_id uuid;
  v_show_id uuid;
  v_log_id uuid;
  v_existing uuid;
  v_artist jsonb;
  v_artist_id uuid;
  v_signed boolean;
  v_lineup uuid[] := '{}';
  v_setlist_url text;
  v_show_url text;
begin
  -- Validate. Table constraints also check rating, price, notes, state and label length.
  if v_user is null then
    raise exception 'sign in to log a concert' using errcode = '42501';
  end if;
  if p_source is null or p_source not in ('setlistfm', 'manual') then
    raise exception 'source must be setlistfm or manual' using errcode = '22023';
  end if;
  -- current_date is UTC, which is never behind a US date, so a US "today" always passes.
  if p_date is null or p_date > current_date or p_date < date '1960-01-01' then
    raise exception 'date must be between 1960 and today (upcoming shows are not supported)' using errcode = '22023';
  end if;
  if coalesce(v_venue_name, '') = '' or coalesce(v_city, '') = '' or coalesce(v_state, '') = '' then
    raise exception 'venue name, city and state are required' using errcode = '22023';
  end if;
  if char_length(v_venue_name) > 200 or char_length(v_city) > 100 or char_length(v_festival_name) > 200 then
    raise exception 'venue, city or festival name is too long' using errcode = '22023';
  end if;
  if jsonb_typeof(p_artists) is distinct from 'array' or jsonb_array_length(p_artists) = 0 then
    raise exception 'a concert needs at least one artist' using errcode = '22023';
  end if;
  if jsonb_array_length(p_artists) > 200 then
    raise exception 'too many artists' using errcode = '22023';
  end if;

  v_setlistfm_venue_id := case when v_from_setlistfm then nullif(btrim(p_venue ->> 'setlistfmId'), '') end;
  if v_from_setlistfm and p_show_signature is distinct from private.lineup_signature('show', array[
    v_setlistfm_venue_id, v_venue_name, v_city, v_state, p_date::text, v_festival_name, v_day_label
  ]) then
    raise exception 'setlist.fm details could not be verified; search again' using errcode = '22023';
  end if;

  -- Venue. setlist.fm venues match by ID (adopting a manually added twin if there is one) and
  -- take setlist.fm's name; manual venues match by name + city + state.
  if v_setlistfm_venue_id is not null then
    update public.venues set name = v_venue_name, city = v_city, state = v_state
    where setlistfm_venue_id = v_setlistfm_venue_id
    returning id into v_venue_id;
    if v_venue_id is null then
      update public.venues set setlistfm_venue_id = v_setlistfm_venue_id
      where setlistfm_venue_id is null
        and lower(name) = lower(v_venue_name) and lower(city) = lower(v_city) and state = v_state
      returning id into v_venue_id;
    end if;
    if v_venue_id is null then
      insert into public.venues (name, city, state, setlistfm_venue_id)
      values (v_venue_name, v_city, v_state, v_setlistfm_venue_id)
      on conflict (setlistfm_venue_id) do update set name = excluded.name
      returning id into v_venue_id;
    end if;
  else
    select id into v_venue_id from public.venues
    where lower(name) = lower(v_venue_name) and lower(city) = lower(v_city) and state = v_state
    order by (setlistfm_venue_id is null), id
    limit 1;
    if v_venue_id is null then
      insert into public.venues (name, city, state)
      values (v_venue_name, v_city, v_state)
      on conflict ((lower(name)), (lower(city)), state) where setlistfm_venue_id is null
        do update set name = public.venues.name
      returning id into v_venue_id;
    end if;
  end if;

  -- The show's setlist.fm link: the first signed artist's setlist (the headliner's, normally).
  if v_from_setlistfm then
    for v_artist in select value from jsonb_array_elements(p_artists) loop
      v_setlist_url := private.setlistfm_url_or_null(v_artist ->> 'setlistUrl');
      if v_setlist_url ~ '^https://www\.setlist\.fm/setlist/'
         and v_artist ->> 'signature' = private.lineup_signature('artist', array[
           v_artist ->> 'mbid', v_artist ->> 'name', v_artist ->> 'setlistfmUrl', v_artist ->> 'setlistUrl', p_date::text
         ]) then
        v_show_url := v_setlist_url;
        exit;
      end if;
    end loop;
  end if;

  -- Show: a venue on a date, shared by everyone who attended. A signed festival name and day
  -- label replace stored ones; a manual log only fills in what's missing.
  insert into public.shows (venue_id, date, festival_name, festival_day_label, setlistfm_url)
  values (v_venue_id, p_date, v_festival_name, v_day_label, v_show_url)
  on conflict (venue_id, date) do update set
    festival_name = case when v_from_setlistfm
      then coalesce(excluded.festival_name, public.shows.festival_name)
      else coalesce(public.shows.festival_name, excluded.festival_name) end,
    festival_day_label = case when v_from_setlistfm
      then coalesce(excluded.festival_day_label, public.shows.festival_day_label)
      else coalesce(public.shows.festival_day_label, excluded.festival_day_label) end,
    setlistfm_url = coalesce(public.shows.setlistfm_url, excluded.setlistfm_url)
  returning id into v_show_id;

  select id into v_existing from public.concert_logs where user_id = v_user and show_id = v_show_id;
  if v_existing is not null then
    raise exception 'already_logged' using errcode = '23505', detail = v_existing::text,
      hint = 'You already logged this show.';
  end if;

  insert into public.concert_logs (user_id, show_id, rating_tenths, notes, ticket_price_cents, source)
  values (v_user, v_show_id, p_rating_tenths, nullif(btrim(p_notes), ''), p_ticket_price_cents, p_source)
  returning id into v_log_id;

  -- Lineup in order. Only signed artists keep setlist.fm IDs and links. The same artist twice
  -- counts once.
  for v_artist in select value from jsonb_array_elements(p_artists) loop
    v_signed := v_from_setlistfm and v_artist ->> 'signature' = private.lineup_signature('artist', array[
      v_artist ->> 'mbid', v_artist ->> 'name', v_artist ->> 'setlistfmUrl', v_artist ->> 'setlistUrl', p_date::text
    ]);
    v_artist_id := private.resolve_artist(
      v_artist ->> 'name',
      case when v_signed then v_artist ->> 'mbid' end,
      case when v_signed then v_artist ->> 'setlistfmUrl' end
    );
    v_setlist_url := case when v_signed then private.setlistfm_url_or_null(v_artist ->> 'setlistUrl') end;
    if v_setlist_url !~ '^https://www\.setlist\.fm/setlist/' then
      v_setlist_url := null;
    end if;
    if not v_artist_id = any (v_lineup) then
      v_lineup := v_lineup || v_artist_id;
      insert into public.log_artists (log_id, artist_id, position, setlistfm_url)
      values (v_log_id, v_artist_id, cardinality(v_lineup), v_setlist_url);
    end if;
  end loop;

  return v_log_id;
end;
$$;
revoke execute on function public.log_concert(text, date, jsonb, jsonb, text, smallint, integer, text, text, text) from public;
grant execute on function public.log_concert(text, date, jsonb, jsonb, text, smallint, integer, text, text, text) to authenticated;

-- Clients could insert lineup rows with a setlist link of their choosing; now only
-- log_concert and update_log (which carry over signed links) set it.
revoke insert on public.log_artists from authenticated;
grant insert (log_id, artist_id, position) on public.log_artists to authenticated;

-- ---------------------------------------------------------------------------------------------
-- M3: search quota. The Edge Function calls this (service role) before each request.
-- ---------------------------------------------------------------------------------------------
create table private.search_usage (
  user_id uuid not null,
  bucket text not null check (bucket in ('minute', 'day')),
  window_start timestamptz not null,
  requests integer not null default 0,
  primary key (user_id, bucket, window_start)
);
alter table private.search_usage enable row level security;
revoke all on private.search_usage from public, anon, authenticated;

/*
  Counts one setlist-search request for a user and says whether it's within the limits:
  30 a minute and 600 a day. Old windows are cleaned up as it goes.
*/
create function public.consume_search_quota(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_minute integer;
  v_day integer;
begin
  if p_user_id is null then
    return false;
  end if;
  delete from private.search_usage
  where user_id = p_user_id and window_start < now() - interval '2 days';

  insert into private.search_usage as u (user_id, bucket, window_start, requests)
  values (p_user_id, 'minute', date_trunc('minute', now()), 1)
  on conflict (user_id, bucket, window_start) do update set requests = u.requests + 1
  returning requests into v_minute;

  insert into private.search_usage as u (user_id, bucket, window_start, requests)
  values (p_user_id, 'day', date_trunc('day', now()), 1)
  on conflict (user_id, bucket, window_start) do update set requests = u.requests + 1
  returning requests into v_day;

  return v_minute <= 30 and v_day <= 600;
end;
$$;
revoke execute on function public.consume_search_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_search_quota(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------
-- L2: can_view answers only for the signed-in viewer, so it can't be used to probe whether
-- one private user follows another.
-- ---------------------------------------------------------------------------------------------
create or replace function public.can_view(viewer_id uuid, owner_id uuid)
returns boolean
language sql
stable
security definer -- reads profiles/follows without recursing into their own policies
set search_path = ''
as $$
  select viewer_id is not null and viewer_id = (select auth.uid()) and (
    viewer_id = owner_id
    or exists (select 1 from public.profiles p where p.id = owner_id and not p.is_private)
    or exists (
      select 1 from public.follows f
      where f.follower_id = viewer_id and f.followee_id = owner_id and f.status = 'accepted'
    )
  );
$$;

-- ---------------------------------------------------------------------------------------------
-- L3: shared reference data is visible only through a log the viewer can see. RLS on the
-- table each policy looks into does the filtering (shows -> concert_logs, venues -> shows,
-- artists -> log_artists).
-- ---------------------------------------------------------------------------------------------
drop policy "shows: signed-in users can read" on public.shows;
create policy "shows: through a visible log" on public.shows
  for select to authenticated using (
    exists (select 1 from public.concert_logs l where l.show_id = shows.id)
  );
drop policy "venues: signed-in users can read" on public.venues;
create policy "venues: through a visible show" on public.venues
  for select to authenticated using (
    exists (select 1 from public.shows s where s.venue_id = venues.id)
  );
drop policy "artists: signed-in users can read" on public.artists;
create policy "artists: through a visible lineup" on public.artists
  for select to authenticated using (
    exists (select 1 from public.log_artists la where la.artist_id = artists.id)
  );

-- ---------------------------------------------------------------------------------------------
-- L6: delete_account needs a password sign-in in the last 5 minutes (the JWT's amr claim) and
-- no avatar files left (the app removes them first; storage files aren't deleted by SQL).
-- ---------------------------------------------------------------------------------------------
create or replace function public.delete_account()
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
  if not exists (
    select 1 from jsonb_array_elements(coalesce((select auth.jwt()) -> 'amr', '[]'::jsonb)) as e
    where e ->> 'method' = 'password'
      and (e ->> 'timestamp')::bigint >= extract(epoch from now())::bigint - 300
  ) then
    raise exception 'confirm your password to delete your account' using errcode = '42501';
  end if;
  if exists (
    select 1 from storage.objects
    where bucket_id = 'avatars' and (storage.foldername(name))[1] = v_user::text
  ) then
    raise exception 'remove your profile photo files first' using errcode = '55000';
  end if;
  delete from auth.users where id = v_user;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- L9: avatars are WebP only (the app re-encodes every photo to WebP), and a file is readable
-- by its owner or when a profile shows it. Nobody can list other people's folders.
-- ---------------------------------------------------------------------------------------------
update storage.buckets set allowed_mime_types = array['image/webp'] where id = 'avatars';

drop policy "avatars: signed-in users can read" on storage.objects;
create policy "avatars: owners and profile photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'avatars' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (select 1 from public.profiles p where p.avatar_url = objects.name)
    )
  );
