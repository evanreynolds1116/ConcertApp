-- Music Junkie schema: tables and constraints. See docs/spec.md, "Data model".
-- Privacy (can_view, grants, RLS) and triggers live in the next migration.

create extension if not exists citext with schema extensions;

-- Internal helpers (trigger functions etc.). Not exposed through the API.
create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------------------------
-- profiles: one per auth user
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username extensions.citext not null unique
    constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,30}$'),
  display_name text not null
    constraint profiles_display_name_length check (char_length(btrim(display_name)) between 1 and 50),
  avatar_url text,
  is_private boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- artists, venues, shows: shared reference data
-- ---------------------------------------------------------------------------------------------
create table public.artists (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint artists_name_not_blank check (btrim(name) <> ''),
  mbid text unique, -- MusicBrainz ID from setlist.fm; null for manual artists
  setlistfm_url text
);
-- Manual entry matches existing artists by case-insensitive name (Phase 2).
create index artists_name_lower_idx on public.artists (lower(name));

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null constraint venues_name_not_blank check (btrim(name) <> ''),
  city text not null constraint venues_city_not_blank check (btrim(city) <> ''),
  state char(2) not null constraint venues_state_us check (state in (
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY',
    'LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH',
    'OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
  )),
  setlistfm_venue_id text unique -- null for manual venues
);
-- Manual entry matches existing venues by case-insensitive name + city + state (Phase 2).
create index venues_match_idx on public.venues (lower(name), lower(city), state);

-- A venue on a date, shared by everyone who attended. One row per festival day.
create table public.shows (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id),
  date date not null,
  festival_name text,
  setlistfm_url text,
  constraint shows_venue_date_key unique (venue_id, date)
);
create index shows_date_idx on public.shows (date);

-- ---------------------------------------------------------------------------------------------
-- concert_logs, log_artists: one user's attendance and their edited lineup
-- ---------------------------------------------------------------------------------------------
create table public.concert_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  show_id uuid not null references public.shows (id),
  rating_tenths smallint constraint concert_logs_rating_range check (rating_tenths between 0 and 100),
  notes text constraint concert_logs_notes_length check (char_length(notes) <= 5000),
  ticket_price_cents integer constraint concert_logs_price_nonnegative check (ticket_price_cents >= 0),
  source text not null constraint concert_logs_source check (source in ('setlistfm', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint concert_logs_user_show_key unique (user_id, show_id)
);
create index concert_logs_show_id_idx on public.concert_logs (show_id);

create table public.log_artists (
  log_id uuid not null references public.concert_logs (id) on delete cascade,
  artist_id uuid not null references public.artists (id),
  position smallint not null constraint log_artists_position_positive check (position >= 1),
  primary key (log_id, artist_id),
  -- Deferred so a reorder can swap positions inside one transaction.
  constraint log_artists_position_key unique (log_id, position) deferrable initially deferred
);
create index log_artists_artist_id_idx on public.log_artists (artist_id);

-- ---------------------------------------------------------------------------------------------
-- follows, activities: social graph and feed events
-- ---------------------------------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' constraint follows_status check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (follower_id, followee_id),
  constraint follows_not_self check (follower_id <> followee_id)
);
create index follows_followee_idx on public.follows (followee_id, status);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles (id) on delete cascade,
  type text not null constraint activities_type check (type in ('concert_logged', 'follow_started')),
  log_id uuid references public.concert_logs (id) on delete cascade,
  target_user_id uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint activities_shape check (
    (type = 'concert_logged' and log_id is not null and target_user_id is null)
    or (type = 'follow_started' and target_user_id is not null and log_id is null)
  )
);
create index activities_actor_created_idx on public.activities (actor_id, created_at desc);
