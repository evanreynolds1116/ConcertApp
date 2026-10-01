-- Phase 3: browsing, editing and shared history.
--   * shows.festival_day_label ("Day 3"), saved by log_concert from the festival search
--   * artist matching moved into private.resolve_artist, shared by log_concert and update_log
--   * update_log: replace a log's lineup and details in one transaction
--   * user_log / log_filter_options: one user's log with filters, read through RLS
--   * also_here: people the viewer follows who logged the same show

alter table public.shows
  add column festival_day_label text
    constraint shows_festival_day_label_length check (char_length(festival_day_label) <= 40);

-- ---------------------------------------------------------------------------------------------
-- Artist matching (was inline in log_concert)
-- ---------------------------------------------------------------------------------------------
/*
  setlist.fm artists (with an MBID) match by MBID, adopting a manually added twin with the same
  name. Manual artists match any artist by name, ignoring case, preferring one from setlist.fm.
  Otherwise a new artist is created.
*/
create function private.resolve_artist(p_name text, p_mbid text, p_setlistfm_url text)
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
    select id into v_id from public.artists where mbid = v_mbid;
    if v_id is null then
      update public.artists
      set mbid = v_mbid, setlistfm_url = private.setlistfm_url_or_null(p_setlistfm_url)
      where mbid is null and lower(name) = lower(v_name)
      returning id into v_id;
    end if;
    if v_id is null then
      insert into public.artists (name, mbid, setlistfm_url)
      values (v_name, v_mbid, private.setlistfm_url_or_null(p_setlistfm_url))
      on conflict (mbid) do update set mbid = excluded.mbid
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
-- log_concert, now with the festival day label
-- ---------------------------------------------------------------------------------------------
drop function public.log_concert(text, date, jsonb, jsonb, text, text, smallint, integer, text);

/*
  p_venue:   { "name", "city", "state", "setlistfmId"? }
  p_artists: [ { "name", "mbid"?, "setlistfmUrl"? }, ... ] in lineup order, headliner first
  Returns the new log's id. If the user already logged this show, raises SQLSTATE 23505 with
  message 'already_logged' and the existing log's id as the DETAIL.
*/
create function public.log_concert(
  p_source text,
  p_date date,
  p_venue jsonb,
  p_artists jsonb,
  p_festival_name text default null,
  p_setlistfm_url text default null,
  p_rating_tenths smallint default null,
  p_ticket_price_cents integer default null,
  p_notes text default null,
  p_festival_day_label text default null
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
  v_lineup uuid[] := '{}';
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

  -- Venue. setlist.fm venues match by ID (adopting a manually added twin if there is one);
  -- manual venues match by name + city + state.
  v_setlistfm_venue_id := case when v_from_setlistfm then nullif(btrim(p_venue ->> 'setlistfmId'), '') end;
  if v_setlistfm_venue_id is not null then
    select id into v_venue_id from public.venues where setlistfm_venue_id = v_setlistfm_venue_id;
    if v_venue_id is null then
      update public.venues set setlistfm_venue_id = v_setlistfm_venue_id
      where setlistfm_venue_id is null
        and lower(name) = lower(v_venue_name) and lower(city) = lower(v_city) and state = v_state
      returning id into v_venue_id;
    end if;
    if v_venue_id is null then
      insert into public.venues (name, city, state, setlistfm_venue_id)
      values (v_venue_name, v_city, v_state, v_setlistfm_venue_id)
      on conflict (setlistfm_venue_id) do update set setlistfm_venue_id = excluded.setlistfm_venue_id
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

  -- Show: a venue on a date, shared by everyone who attended. Fill in festival name, day
  -- label and setlist.fm link if the show didn't have them yet.
  insert into public.shows (venue_id, date, festival_name, festival_day_label, setlistfm_url)
  values (v_venue_id, p_date, v_festival_name, v_day_label,
          case when v_from_setlistfm then private.setlistfm_url_or_null(p_setlistfm_url) end)
  on conflict (venue_id, date) do update set
    festival_name = coalesce(public.shows.festival_name, excluded.festival_name),
    festival_day_label = coalesce(public.shows.festival_day_label, excluded.festival_day_label),
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

  -- Lineup in order. Manual logs never carry setlist.fm IDs. The same artist twice counts once.
  for v_artist in select value from jsonb_array_elements(p_artists) loop
    v_artist_id := private.resolve_artist(
      v_artist ->> 'name',
      case when v_from_setlistfm then v_artist ->> 'mbid' end,
      case when v_from_setlistfm then v_artist ->> 'setlistfmUrl' end
    );
    if not v_artist_id = any (v_lineup) then
      v_lineup := v_lineup || v_artist_id;
      insert into public.log_artists (log_id, artist_id, position)
      values (v_log_id, v_artist_id, cardinality(v_lineup));
    end if;
  end loop;

  return v_log_id;
end;
$$;
revoke execute on function public.log_concert(text, date, jsonb, jsonb, text, text, smallint, integer, text, text) from public;
grant execute on function public.log_concert(text, date, jsonb, jsonb, text, text, smallint, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- update_log: edit a log's lineup and details (venue and date stay; delete and re-add instead)
-- ---------------------------------------------------------------------------------------------
/*
  p_artists: [ { "artistId": uuid } | { "name": text }, ... ] in lineup order. Existing lineup
  entries are passed by id; artists added while editing by name (matched like manual entries).
  Rating, price and notes are replaced as given: null clears them.
*/
create function public.update_log(
  p_log_id uuid,
  p_artists jsonb,
  p_rating_tenths smallint,
  p_ticket_price_cents integer,
  p_notes text
)
returns void
language plpgsql
security definer -- may create artists, which clients can't write directly
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_artist jsonb;
  v_artist_id uuid;
  v_lineup uuid[] := '{}';
begin
  if v_user is null then
    raise exception 'sign in to edit a concert' using errcode = '42501';
  end if;
  -- Only the owner can edit; someone else's log looks the same as a missing one.
  if not exists (select 1 from public.concert_logs where id = p_log_id and user_id = v_user) then
    raise exception 'log not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_artists) is distinct from 'array' or jsonb_array_length(p_artists) = 0 then
    raise exception 'a concert needs at least one artist' using errcode = '22023';
  end if;
  if jsonb_array_length(p_artists) > 200 then
    raise exception 'too many artists' using errcode = '22023';
  end if;

  update public.concert_logs
  set rating_tenths = p_rating_tenths,
      ticket_price_cents = p_ticket_price_cents,
      notes = nullif(btrim(p_notes), '')
  where id = p_log_id;

  -- Replace the lineup. The "at least one artist" check runs at commit, after the inserts.
  delete from public.log_artists where log_id = p_log_id;
  for v_artist in select value from jsonb_array_elements(p_artists) loop
    if v_artist ? 'artistId' then
      select id into v_artist_id from public.artists where id = (v_artist ->> 'artistId')::uuid;
      if v_artist_id is null then
        raise exception 'unknown artist' using errcode = '22023';
      end if;
    else
      v_artist_id := private.resolve_artist(v_artist ->> 'name', null, null);
    end if;
    if not v_artist_id = any (v_lineup) then
      v_lineup := v_lineup || v_artist_id;
      insert into public.log_artists (log_id, artist_id, position)
      values (p_log_id, v_artist_id, cardinality(v_lineup));
    end if;
  end loop;
end;
$$;
revoke execute on function public.update_log(uuid, jsonb, smallint, integer, text) from public;
grant execute on function public.update_log(uuid, jsonb, smallint, integer, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- user_log: one user's concert log, newest show first, with filters
-- ---------------------------------------------------------------------------------------------
/*
  Runs as the caller (security invoker), so RLS decides what's visible: someone else's private
  log comes back empty. Filters combine (AND):
    p_artist  anyone in the lineup whose name contains this text, ignoring case
    p_year / p_month  the show's calendar year / month (either alone, or both)
    p_state   USPS code;  p_city  with p_state, the "City, ST" pair;  p_venue_id  one venue
  total_count is the number of matching logs before paging.
*/
create function public.user_log(
  p_user_id uuid,
  p_artist text default null,
  p_year integer default null,
  p_month integer default null,
  p_state text default null,
  p_city text default null,
  p_venue_id uuid default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  log_id uuid,
  show_date date,
  festival_name text,
  festival_day_label text,
  venue_id uuid,
  venue_name text,
  city text,
  state text,
  rating_tenths smallint,
  artists text[],
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    l.id, s.date, s.festival_name, s.festival_day_label, v.id, v.name, v.city, v.state, l.rating_tenths,
    (select array_agg(a.name order by la.position)
       from public.log_artists la join public.artists a on a.id = la.artist_id
      where la.log_id = l.id),
    count(*) over ()
  from public.concert_logs l
  join public.shows s on s.id = l.show_id
  join public.venues v on v.id = s.venue_id
  where l.user_id = p_user_id
    and (p_year is null or extract(year from s.date) = p_year)
    and (p_month is null or extract(month from s.date) = p_month)
    and (p_state is null or v.state = upper(p_state))
    and (p_city is null or lower(v.city) = lower(btrim(p_city)))
    and (p_venue_id is null or v.id = p_venue_id)
    and (
      coalesce(btrim(p_artist), '') = ''
      or exists (
        select 1 from public.log_artists la join public.artists a on a.id = la.artist_id
        where la.log_id = l.id and strpos(lower(a.name), lower(btrim(p_artist))) > 0
      )
    )
  order by s.date desc, l.created_at desc, l.id
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;
revoke execute on function public.user_log(uuid, text, integer, integer, text, text, uuid, integer, integer) from public;
grant execute on function public.user_log(uuid, text, integer, integer, text, text, uuid, integer, integer) to authenticated;

/* The years and states a user's (visible) log covers, for the filter dropdowns. */
create function public.log_filter_options(p_user_id uuid)
returns table (years integer[], states text[])
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(array_agg(distinct extract(year from s.date)::integer order by extract(year from s.date)::integer desc), '{}'),
    coalesce(array_agg(distinct v.state::text order by v.state::text), '{}')
  from public.concert_logs l
  join public.shows s on s.id = l.show_id
  join public.venues v on v.id = s.venue_id
  where l.user_id = p_user_id;
$$;
revoke execute on function public.log_filter_options(uuid) from public;
grant execute on function public.log_filter_options(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- also_here: shared history on a concert page
-- ---------------------------------------------------------------------------------------------
/*
  People the viewer follows (accepted) who logged the same show as this log, not counting the
  viewer or the log's owner. Runs as the caller, so the log itself must be visible.
*/
create function public.also_here(p_log_id uuid)
returns table (user_id uuid, username text, display_name text, avatar_url text)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.username::text, p.display_name, p.avatar_url
  from public.concert_logs target
  join public.concert_logs other on other.show_id = target.show_id and other.user_id <> target.user_id
  join public.follows f
    on f.followee_id = other.user_id and f.follower_id = (select auth.uid()) and f.status = 'accepted'
  join public.profiles p on p.id = other.user_id
  where target.id = p_log_id
    and other.user_id <> (select auth.uid())
  order by p.display_name, p.username;
$$;
revoke execute on function public.also_here(uuid) from public;
grant execute on function public.also_here(uuid) to authenticated;
