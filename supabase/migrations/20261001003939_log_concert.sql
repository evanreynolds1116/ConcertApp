-- log_concert: save a concert in one transaction (docs/spec.md, Phase 2).
-- Creates or matches the venue, artists and show, then writes the user's log and lineup.

-- Manual entries match existing rows by case-insensitive name (plus city and state for
-- venues) so stats don't double-count. These unique indexes make that hold even when two
-- people add the same new venue or artist at the same moment.
create unique index artists_manual_name_key on public.artists (lower(name)) where mbid is null;
create unique index venues_manual_match_key on public.venues (lower(name), lower(city), state)
  where setlistfm_venue_id is null;

-- Only keep setlist.fm links we generated ourselves; they're rendered as links in the app.
create function private.setlistfm_url_or_null(url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when url ~ '^https://www\.setlist\.fm/[A-Za-z0-9/._-]+$' then url end;
$$;

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
  p_notes text default null
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
  v_venue_id uuid;
  v_show_id uuid;
  v_log_id uuid;
  v_existing uuid;
  v_artist jsonb;
  v_artist_name text;
  v_mbid text;
  v_artist_id uuid;
  v_lineup uuid[] := '{}';
begin
  -- Validate. Table constraints also check rating, price, notes and state.
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

  -- Show: a venue on a date, shared by everyone who attended. Fill in festival name and
  -- setlist.fm link if the show didn't have them yet.
  insert into public.shows (venue_id, date, festival_name, setlistfm_url)
  values (v_venue_id, p_date, v_festival_name,
          case when v_from_setlistfm then private.setlistfm_url_or_null(p_setlistfm_url) end)
  on conflict (venue_id, date) do update set
    festival_name = coalesce(public.shows.festival_name, excluded.festival_name),
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

  -- Artists, in lineup order. setlist.fm artists match by MusicBrainz ID (adopting a manual
  -- twin); manual artists match any artist by name, preferring one from setlist.fm.
  for v_artist in select value from jsonb_array_elements(p_artists) loop
    v_artist_name := btrim(v_artist ->> 'name');
    if coalesce(v_artist_name, '') = '' or char_length(v_artist_name) > 200 then
      raise exception 'each artist needs a name of up to 200 characters' using errcode = '22023';
    end if;
    v_mbid := case when v_from_setlistfm then nullif(btrim(v_artist ->> 'mbid'), '') end;
    v_artist_id := null;

    if v_mbid is not null then
      select id into v_artist_id from public.artists where mbid = v_mbid;
      if v_artist_id is null then
        update public.artists
        set mbid = v_mbid, setlistfm_url = private.setlistfm_url_or_null(v_artist ->> 'setlistfmUrl')
        where mbid is null and lower(name) = lower(v_artist_name)
        returning id into v_artist_id;
      end if;
      if v_artist_id is null then
        insert into public.artists (name, mbid, setlistfm_url)
        values (v_artist_name, v_mbid, private.setlistfm_url_or_null(v_artist ->> 'setlistfmUrl'))
        on conflict (mbid) do update set mbid = excluded.mbid
        returning id into v_artist_id;
      end if;
    else
      select id into v_artist_id from public.artists
      where lower(name) = lower(v_artist_name)
      order by (mbid is null), id
      limit 1;
      if v_artist_id is null then
        insert into public.artists (name)
        values (v_artist_name)
        on conflict ((lower(name))) where mbid is null do update set name = public.artists.name
        returning id into v_artist_id;
      end if;
    end if;

    -- The same artist twice in a lineup counts once.
    if not v_artist_id = any (v_lineup) then
      v_lineup := v_lineup || v_artist_id;
      insert into public.log_artists (log_id, artist_id, position)
      values (v_log_id, v_artist_id, cardinality(v_lineup));
    end if;
  end loop;

  return v_log_id;
end;
$$;

revoke execute on function public.log_concert(text, date, jsonb, jsonb, text, text, smallint, integer, text) from public;
grant execute on function public.log_concert(text, date, jsonb, jsonb, text, text, smallint, integer, text) to authenticated;
