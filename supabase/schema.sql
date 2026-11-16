-- Beat Store database. Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run again: it replaces the rules instead of failing.

-- Documents are stored as JSON so the site code can stay simple.
create table if not exists tracks      (id text primary key, data jsonb not null, created_at timestamptz default now());
create table if not exists orders      (id text primary key, data jsonb not null, created_at timestamptz default now());
create table if not exists subscribers (email text primary key, data jsonb not null, created_at timestamptz default now());
create table if not exists settings    (id text primary key, data jsonb not null);
create table if not exists events (
  id bigint generated always as identity primary key,
  type text not null,
  track_id text not null,
  ts bigint not null,
  data jsonb not null default '{}'
);
create index if not exists events_track_ts on events (track_id, ts);
create table if not exists admins (email text primary key);

-- Who counts as the producer (back office access)
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where email = auth.jwt() ->> 'email');
$$;

alter table tracks      enable row level security;
alter table orders      enable row level security;
alter table subscribers enable row level security;
alter table settings    enable row level security;
alter table events      enable row level security;
alter table admins      enable row level security;

drop policy if exists tracks_read on tracks;          drop policy if exists tracks_admin on tracks;
drop policy if exists settings_read on settings;      drop policy if exists settings_admin on settings;
drop policy if exists events_insert on events;        drop policy if exists events_admin on events;
drop policy if exists orders_insert on orders;        drop policy if exists orders_admin on orders;
drop policy if exists subscribers_admin on subscribers; drop policy if exists admins_self on admins;
drop policy if exists previews_admin_select on storage.objects;
drop policy if exists previews_admin_insert on storage.objects;
drop policy if exists previews_admin_update on storage.objects;
drop policy if exists previews_admin_delete on storage.objects;

-- Tracks: everyone sees visible tracks; only the producer edits
create policy tracks_read  on tracks for select using (coalesce((data ->> 'hidden')::boolean, false) = false or is_admin());
create policy tracks_admin on tracks for all using (is_admin()) with check (is_admin());

-- Settings (brand name, prices, Stripe links): public read, producer writes
create policy settings_read  on settings for select using (true);
create policy settings_admin on settings for all using (is_admin()) with check (is_admin());

-- Plays and cart adds: guests can record them, only the producer reads them
create policy events_insert on events for insert with check (type in ('play', 'cart'));
create policy events_admin  on events for all using (is_admin()) with check (is_admin());

-- Orders: guests create a record when sent to Stripe; only the producer reads them
create policy orders_insert on orders for insert with check (data ->> 'status' = 'sent-to-stripe');
create policy orders_admin  on orders for all using (is_admin()) with check (is_admin());

-- Subscribers: private to the producer; guests join through subscribe() below
create policy subscribers_admin on subscribers for all using (is_admin()) with check (is_admin());
create policy admins_self on admins for select using (is_admin());

create or replace function subscribe(p_email text, p_name text, p_prefs text[], p_source text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 254 then raise exception 'invalid email'; end if;
  insert into subscribers (email, data)
  values (lower(p_email), jsonb_build_object('email', lower(p_email), 'name', left(coalesce(p_name, ''), 100),
          'prefs', to_jsonb(coalesce(p_prefs, '{}')), 'source', left(coalesce(p_source, ''), 30),
          'ts', (extract(epoch from now()) * 1000)::bigint))
  on conflict (email) do update set data = subscribers.data
    || jsonb_build_object('prefs', to_jsonb(coalesce(p_prefs, '{}')))
    || case when coalesce(p_name, '') <> '' then jsonb_build_object('name', left(p_name, 100)) else '{}'::jsonb end;
end $$;

-- Public play counts for the store (total and last 7 days) without exposing raw events
create or replace function track_stats() returns table (track_id text, total bigint, recent bigint)
language sql stable security definer set search_path = public as $$
  select track_id, count(*), count(*) filter (where ts > (extract(epoch from now()) * 1000)::bigint - 7 * 86400000)
  from events where type = 'play' group by track_id;
$$;

grant execute on function subscribe(text, text, text[], text) to anon, authenticated;
grant execute on function track_stats() to anon, authenticated;
grant execute on function is_admin() to anon, authenticated;

-- Audio previews: public to stream, only the producer uploads
insert into storage.buckets (id, name, public) values ('previews', 'previews', true) on conflict (id) do nothing;
create policy previews_admin_select on storage.objects for select using (bucket_id = 'previews' and is_admin());
create policy previews_admin_insert on storage.objects for insert with check (bucket_id = 'previews' and is_admin());
create policy previews_admin_update on storage.objects for update using (bucket_id = 'previews' and is_admin());
create policy previews_admin_delete on storage.objects for delete using (bucket_id = 'previews' and is_admin());

-- The producer's back office login (must match the user in Authentication → Users)
insert into admins (email) values ('8wavecollabs@gmail.com') on conflict do nothing;
