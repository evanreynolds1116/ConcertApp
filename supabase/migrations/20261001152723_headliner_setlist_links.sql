-- Each lineup entry can carry that artist's setlist at the show, so a concert page links the
-- headliner's setlist instead of whichever set the show's first logger got (decided 2026-10-01).

alter table public.log_artists
  add column setlistfm_url text
    constraint log_artists_setlistfm_url_format
    check (setlistfm_url ~ '^https://www\.setlist\.fm/setlist/[A-Za-z0-9/._-]+$');

-- ---------------------------------------------------------------------------------------------
-- log_concert: p_artists items may carry "setlistUrl"
-- ---------------------------------------------------------------------------------------------
/*
  p_venue:   { "name", "city", "state", "setlistfmId"? }
  p_artists: [ { "name", "mbid"?, "setlistfmUrl"?, "setlistUrl"? }, ... ] in lineup order,
             headliner first. setlistfmUrl is the artist's setlist.fm page; setlistUrl is their
             setlist at this show.
  Returns the new log's id. If the user already logged this show, raises SQLSTATE 23505 with
  message 'already_logged' and the existing log's id as the DETAIL.
*/
create or replace function public.log_concert(
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
  v_setlist_url text;
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
    -- That artist's setlist at this show; anything but a setlist.fm setlist page is dropped.
    v_setlist_url := case when v_from_setlistfm then private.setlistfm_url_or_null(v_artist ->> 'setlistUrl') end;
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
revoke execute on function public.log_concert(text, date, jsonb, jsonb, text, text, smallint, integer, text, text) from public;
grant execute on function public.log_concert(text, date, jsonb, jsonb, text, text, smallint, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- update_log: keeps each artist's setlist link
-- ---------------------------------------------------------------------------------------------
create or replace function public.update_log(
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
  v_setlist_urls jsonb;
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

  -- Replace the lineup, keeping each artist's setlist link. The "at least one artist" check runs
  -- at commit, after the inserts.
  select coalesce(jsonb_object_agg(artist_id, setlistfm_url), '{}') into v_setlist_urls
  from public.log_artists where log_id = p_log_id and setlistfm_url is not null;
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
      insert into public.log_artists (log_id, artist_id, position, setlistfm_url)
      values (p_log_id, v_artist_id, cardinality(v_lineup), v_setlist_urls ->> v_artist_id::text);
    end if;
  end loop;
end;
$$;
revoke execute on function public.update_log(uuid, jsonb, smallint, integer, text) from public;
grant execute on function public.update_log(uuid, jsonb, smallint, integer, text) to authenticated;
