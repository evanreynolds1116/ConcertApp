-- Local seed data. Loaded by `pnpm db:reset` (supabase db reset).
--
-- Three users, one per privacy case in docs/spec.md:
--   pat_public     public account
--   priya_private  private account, no followers (has a PENDING request to fran)
--   fran_followed  private account with an accepted follower (pat)
-- Plus: fran follows pat (pat is public, so it's accepted immediately).
--
-- All three sign in with password "musicjunkie-dev" (local development only):
--   pat@example.com, priya@example.com, fran@example.com
--
-- Fixed IDs so tests can refer to rows directly:
--   users   00000000-0000-4000-a000-00000000000{1,2,3}  (pat, priya, fran)
--   venues  20000000-..., shows 30000000-..., artists 40000000-..., logs 10000000-...

begin;

-- ---------------------------------------------------------------------------------------------
-- Users (auth.users + auth.identities). The on_auth_user_created trigger creates profiles.
-- ---------------------------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('musicjunkie-dev', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('username', u.username, 'display_name', u.display_name),
  now(), now(), '', '', '', ''
from (values
  ('00000000-0000-4000-a000-000000000001'::uuid, 'pat@example.com', 'pat_public', 'Pat Public'),
  ('00000000-0000-4000-a000-000000000002'::uuid, 'priya@example.com', 'priya_private', 'Priya Private'),
  ('00000000-0000-4000-a000-000000000003'::uuid, 'fran@example.com', 'fran_followed', 'Fran Followed')
) as u (id, email, username, display_name);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), now(), now(), now()
from auth.users u
where u.id in (
  '00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003'
);

update public.profiles set is_private = false where id = '00000000-0000-4000-a000-000000000001';

-- ---------------------------------------------------------------------------------------------
-- Follows. The insert trigger decides the status from the followee's privacy.
-- ---------------------------------------------------------------------------------------------
insert into public.follows (follower_id, followee_id) values
  ('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000003'), -- pat -> fran: pending
  ('00000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000003'), -- priya -> fran: pending
  ('00000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000001'); -- fran -> pat: accepted
-- fran accepts pat; priya's request stays pending.
update public.follows set status = 'accepted'
where follower_id = '00000000-0000-4000-a000-000000000001' and followee_id = '00000000-0000-4000-a000-000000000003';

-- ---------------------------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------------------------
insert into public.venues (id, name, city, state, setlistfm_venue_id) values
  ('20000000-0000-4000-a000-000000000001', 'Hollywood Bowl', 'Los Angeles', 'CA', '33d62cf9'),
  ('20000000-0000-4000-a000-000000000002', 'The Basement East', 'Nashville', 'TN', '23d09c67'),
  ('20000000-0000-4000-a000-000000000003', 'Crystal Ballroom', 'Portland', 'OR', null),
  ('20000000-0000-4000-a000-000000000004', 'State Theatre', 'Portland', 'ME', null),
  ('20000000-0000-4000-a000-000000000005', 'Great Stage Park', 'Manchester', 'TN', '2bd6181e'),
  ('20000000-0000-4000-a000-000000000006', 'Ryman Auditorium', 'Nashville', 'TN', null);

insert into public.shows (id, venue_id, date, festival_name, setlistfm_url) values
  ('30000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000001', '2023-10-31', null,
   'https://www.setlist.fm/setlist/boygenius/2023/hollywood-bowl-los-angeles-ca-4ba05b2e.html'),
  ('30000000-0000-4000-a000-000000000002', '20000000-0000-4000-a000-000000000002', '2026-09-17', null, null),
  ('30000000-0000-4000-a000-000000000003', '20000000-0000-4000-a000-000000000003', '2022-05-14', null, null),
  ('30000000-0000-4000-a000-000000000004', '20000000-0000-4000-a000-000000000004', '2022-08-20', null, null),
  ('30000000-0000-4000-a000-000000000005', '20000000-0000-4000-a000-000000000005', '2024-06-16', 'Bonnaroo', null),
  ('30000000-0000-4000-a000-000000000006', '20000000-0000-4000-a000-000000000006', '2024-03-02', null, null);
update public.shows set festival_day_label = 'Day 4' where id = '30000000-0000-4000-a000-000000000005';

insert into public.artists (id, name, mbid) values
  ('40000000-0000-4000-a000-000000000001', 'boygenius', '3ceeddbd-fba5-4bdb-99f7-2d028ed5afda'),
  ('40000000-0000-4000-a000-000000000002', '100 gecs', 'd6d45dda-2377-4faa-947b-e071efa085c0'),
  ('40000000-0000-4000-a000-000000000003', 'Sloppy Jane', 'dfa3f308-ca2c-48f8-b866-3392fbfe5bca'),
  ('40000000-0000-4000-a000-000000000004', 'Shakey Graves', '24ca022c-653e-4379-812a-71f729b900ef'),
  ('40000000-0000-4000-a000-000000000005', 'Langhorne Slim', '0bc5259b-bf08-40ad-9f6a-20462f652e83'),
  ('40000000-0000-4000-a000-000000000006', 'Megan Thee Stallion', 'ee27b2d8-648c-4a9d-a68c-e55066959975'),
  ('40000000-0000-4000-a000-000000000007', 'Fred again..', 'bca46a0c-25c9-42ca-98c2-e64c8a5e337e'),
  ('40000000-0000-4000-a000-000000000008', 'Chappell Roan', '56a55378-f155-48de-80a5-d80104221267'),
  ('40000000-0000-4000-a000-000000000009', 'The Local Openers', null); -- a manual artist

-- ---------------------------------------------------------------------------------------------
-- Logs and lineups (position 1 = headliner). The insert trigger writes feed activities.
-- Ratings are tenths (92 = 9.2); prices are cents. Null = not set; 0 is a real value.
-- ---------------------------------------------------------------------------------------------
insert into public.concert_logs (id, user_id, show_id, rating_tenths, notes, ticket_price_cents, source) values
  -- pat (public): Hollywood Bowl, both Portlands, Bonnaroo day
  ('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', 92, 'Halloween show, everyone in costume.', 8500, 'setlistfm'),
  ('10000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000003', null, null, 0, 'manual'),
  ('10000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000004', 75, null, null, 'manual'),
  ('10000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000005', 88, 'Sunday at Bonnaroo.', 35000, 'setlistfm'),
  -- priya (private, no followers): Hollywood Bowl (same show as pat), Ryman
  ('10000000-0000-4000-a000-000000000005', '00000000-0000-4000-a000-000000000002', '30000000-0000-4000-a000-000000000001', 0, 'Rating 0.0 on purpose: a real value, not "unrated".', 9900, 'setlistfm'),
  ('10000000-0000-4000-a000-000000000006', '00000000-0000-4000-a000-000000000002', '30000000-0000-4000-a000-000000000006', null, null, null, 'manual'),
  -- fran (private, pat follows): Basement East, Bonnaroo day (same show as pat), Crystal Ballroom
  ('10000000-0000-4000-a000-000000000007', '00000000-0000-4000-a000-000000000003', '30000000-0000-4000-a000-000000000002', 81, null, 3200, 'setlistfm'),
  ('10000000-0000-4000-a000-000000000008', '00000000-0000-4000-a000-000000000003', '30000000-0000-4000-a000-000000000005', 95, 'Chappell Roan stole the day.', 34000, 'setlistfm'),
  ('10000000-0000-4000-a000-000000000009', '00000000-0000-4000-a000-000000000003', '30000000-0000-4000-a000-000000000003', null, null, null, 'manual');

insert into public.log_artists (log_id, artist_id, position) values
  ('10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000001', 1),
  ('10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000002', 2),
  ('10000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000003', 3),
  ('10000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000009', 1),
  ('10000000-0000-4000-a000-000000000003', '40000000-0000-4000-a000-000000000005', 1),
  ('10000000-0000-4000-a000-000000000004', '40000000-0000-4000-a000-000000000007', 1),
  ('10000000-0000-4000-a000-000000000004', '40000000-0000-4000-a000-000000000006', 2),
  ('10000000-0000-4000-a000-000000000004', '40000000-0000-4000-a000-000000000008', 3),
  ('10000000-0000-4000-a000-000000000005', '40000000-0000-4000-a000-000000000001', 1),
  ('10000000-0000-4000-a000-000000000005', '40000000-0000-4000-a000-000000000002', 2),
  ('10000000-0000-4000-a000-000000000006', '40000000-0000-4000-a000-000000000004', 1),
  ('10000000-0000-4000-a000-000000000006', '40000000-0000-4000-a000-000000000009', 2),
  ('10000000-0000-4000-a000-000000000007', '40000000-0000-4000-a000-000000000004', 1),
  ('10000000-0000-4000-a000-000000000007', '40000000-0000-4000-a000-000000000005', 2),
  ('10000000-0000-4000-a000-000000000008', '40000000-0000-4000-a000-000000000008', 1),
  ('10000000-0000-4000-a000-000000000008', '40000000-0000-4000-a000-000000000006', 2),
  ('10000000-0000-4000-a000-000000000009', '40000000-0000-4000-a000-000000000009', 1);

commit;
