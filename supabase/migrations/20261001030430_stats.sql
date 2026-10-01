-- Phase 4: stats (docs/spec.md, "Stats definitions").
-- Every function runs as the caller (security invoker), so stats are computed only from logs
-- the viewer can see: someone else's private stats come back as zeros / empty, exactly like
-- their log. That's the "Stats and leaderboards: can_view" row of the privacy table.
--
-- Also: user_log gains an exact artist filter (p_artist_id) for leaderboard links, so the
-- "Bush" row doesn't also match "Kate Bush" the way the substring search would.

-- ---------------------------------------------------------------------------------------------
-- user_stats: the five counts plus money spent
-- ---------------------------------------------------------------------------------------------
/*
  concerts         number of logs (a 3-day festival attended 3 days counts 3)
  artists          distinct artists across the user's (edited) lineups
  venues           distinct venues
  cities           distinct (city, state) pairs: Portland, OR and Portland, ME are two
  states           distinct state codes
  spent_cents      sum of ticket prices over logs that have one ($0 counts as a price;
                   logs without a price are skipped, not counted as $0)
  priced_concerts  how many logs have a price (the "18 of 25" coverage)
  first_show       earliest show date, for "since Mar 2019"
*/
create function public.user_stats(p_user_id uuid)
returns table (
  concerts integer,
  artists integer,
  venues integer,
  cities integer,
  states integer,
  spent_cents bigint,
  priced_concerts integer,
  first_show date
)
language sql
stable
security invoker
set search_path = ''
as $$
  with logs as (
    select l.id, l.ticket_price_cents, s.date, v.id as venue_id, lower(v.city) as city, v.state
    from public.concert_logs l
    join public.shows s on s.id = l.show_id
    join public.venues v on v.id = s.venue_id
    where l.user_id = p_user_id
  )
  select
    (select count(*)::integer from logs),
    (select count(distinct la.artist_id)::integer from public.log_artists la where la.log_id in (select id from logs)),
    (select count(distinct venue_id)::integer from logs),
    (select count(distinct (city, state))::integer from logs),
    (select count(distinct state)::integer from logs),
    (select coalesce(sum(ticket_price_cents), 0)::bigint from logs),
    (select count(ticket_price_cents)::integer from logs),
    (select min(date) from logs);
$$;
revoke execute on function public.user_stats(uuid) from public;
grant execute on function public.user_stats(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- stats_by_year: concerts and spend per calendar year of the show date
-- ---------------------------------------------------------------------------------------------
/*
  One row per year from the earliest show's year to the current year, empty years as 0.
  No rows when there are no (visible) logs. spent_cents / priced_concerts cover priced logs only.
*/
create function public.stats_by_year(p_user_id uuid)
returns table (year integer, concerts integer, spent_cents bigint, priced_concerts integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with logs as (
    select extract(year from s.date)::integer as year, l.ticket_price_cents
    from public.concert_logs l
    join public.shows s on s.id = l.show_id
    where l.user_id = p_user_id
  ),
  years as (
    select generate_series(min(year), greatest(max(year), extract(year from current_date)::integer)) as year
    from logs
    having count(*) > 0
  )
  select
    y.year,
    count(l.year)::integer,
    coalesce(sum(l.ticket_price_cents), 0)::bigint,
    count(l.ticket_price_cents)::integer
  from years y
  left join logs l on l.year = y.year
  group by y.year
  order by y.year;
$$;
revoke execute on function public.stats_by_year(uuid) from public;
grant execute on function public.stats_by_year(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- leaderboard: artists, venues, cities or states by number of logs, most first
-- ---------------------------------------------------------------------------------------------
/*
  p_kind: 'artist' | 'venue' | 'city' | 'state'. Every item with its count, sorted by count
  descending, then name A-Z (ignoring case). Columns:
    item_id  artist or venue uuid (as text); null for cities and states
    name     artist name, venue name, city name, or state code
    city, state  the venue's or city's location (null for artists; state only for states)
    concerts number of logs. Artists count logs whose saved lineup includes them, so an
             artist removed from a show doesn't count for it.
*/
create function public.leaderboard(p_user_id uuid, p_kind text)
returns table (item_id text, name text, city text, state text, concerts integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_kind not in ('artist', 'venue', 'city', 'state') then
    raise exception 'kind must be artist, venue, city or state' using errcode = '22023';
  end if;

  return query
  with logs as (
    select l.id, v.id as venue_id, v.name as venue_name, v.city, v.state
    from public.concert_logs l
    join public.shows s on s.id = l.show_id
    join public.venues v on v.id = s.venue_id
    where l.user_id = p_user_id
  ),
  items as (
    select a.id::text as item_id, a.name, null::text as city, null::text as state, count(distinct la.log_id)::integer as concerts
    from public.log_artists la
    join public.artists a on a.id = la.artist_id
    where p_kind = 'artist' and la.log_id in (select id from logs)
    group by a.id, a.name
    union all
    select venue_id::text, venue_name, min(logs.city), min(logs.state::text), count(*)::integer
    from logs where p_kind = 'venue'
    group by venue_id, venue_name
    union all
    -- A city is a (city, state) pair; show the most common spelling of the name.
    select null, mode() within group (order by logs.city), null, logs.state::text, count(*)::integer
    from logs where p_kind = 'city'
    group by lower(logs.city), logs.state
    union all
    select null, logs.state::text, null, logs.state::text, count(*)::integer
    from logs where p_kind = 'state'
    group by logs.state
  )
  select i.item_id, i.name, coalesce(i.city, case when p_kind = 'city' then i.name end), i.state, i.concerts
  from items i
  order by i.concerts desc, lower(i.name), i.name, i.state;
end;
$$;
revoke execute on function public.leaderboard(uuid, text) from public;
grant execute on function public.leaderboard(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- user_log: add an exact artist filter (leaderboard artist rows link here)
-- ---------------------------------------------------------------------------------------------
drop function public.user_log(uuid, text, integer, integer, text, text, uuid, integer, integer);

/*
  Runs as the caller (security invoker), so RLS decides what's visible: someone else's private
  log comes back empty. Filters combine (AND):
    p_artist     anyone in the lineup whose name contains this text, ignoring case
    p_artist_id  this exact artist is in the lineup
    p_year / p_month  the show's calendar year / month (either alone, or both)
    p_state      USPS code;  p_city  with p_state, the "City, ST" pair;  p_venue_id  one venue
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
  p_offset integer default 0,
  p_artist_id uuid default null
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
    and (p_artist_id is null or exists (
      select 1 from public.log_artists la where la.log_id = l.id and la.artist_id = p_artist_id
    ))
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
revoke execute on function public.user_log(uuid, text, integer, integer, text, text, uuid, integer, integer, uuid) from public;
grant execute on function public.user_log(uuid, text, integer, integer, text, text, uuid, integer, integer, uuid) to authenticated;
