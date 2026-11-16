-- 8 Wave Studios store: database setup, recovered from Supabase project mchpykpjjingtbmwqxjl on 2026-11-16.
-- Tables (all have row-level security on)

create table public.tracks      (id text primary key, data jsonb, created_at timestamptz default now());
create table public.orders      (id text primary key, data jsonb, created_at timestamptz default now());
create table public.subscribers (email text primary key, data jsonb, created_at timestamptz default now());
create table public.settings    (id text primary key, data jsonb);
create table public.events      (id bigint generated always as identity primary key, type text, track_id text, ts bigint, data jsonb default '{}'::jsonb);
create table public.admins      (email text primary key);
create table public.records     (id text primary key, data jsonb, created_at timestamptz default now());

alter table public.tracks enable row level security;
alter table public.orders enable row level security;
alter table public.subscribers enable row level security;
alter table public.settings enable row level security;
alter table public.events enable row level security;
alter table public.admins enable row level security;
alter table public.records enable row level security;

-- Functions

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists (select 1 from admins where email = auth.jwt() ->> 'email');
$function$;

CREATE OR REPLACE FUNCTION public.track_stats()
 RETURNS TABLE(track_id text, total bigint, recent bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select track_id, count(*), count(*) filter (where ts > (extract(epoch from now()) * 1000)::bigint - 7 * 86400000)
  from events where type = 'play' group by track_id;
$function$;

CREATE OR REPLACE FUNCTION public.subscribe(p_email text, p_name text, p_prefs text[], p_source text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 254 then raise exception 'invalid email'; end if;
  insert into subscribers (email, data)
  values (lower(p_email), jsonb_build_object('email', lower(p_email), 'name', left(coalesce(p_name, ''), 100),
          'prefs', to_jsonb(coalesce(p_prefs, '{}')), 'source', left(coalesce(p_source, ''), 30),
          'ts', (extract(epoch from now()) * 1000)::bigint))
  on conflict (email) do update set data = subscribers.data
    || jsonb_build_object('prefs', to_jsonb(coalesce(p_prefs, '{}')))
    || case when coalesce(p_name, '') <> '' then jsonb_build_object('name', left(p_name, 100)) else '{}'::jsonb end;
end $function$;

CREATE OR REPLACE FUNCTION public.reserve_records(p_ids text[], p_until bigint)
 RETURNS SETOF records LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  update records set data = data || jsonb_build_object('status', 'pending', 'pendingUntil', p_until)
  where id = any(p_ids)
    and (data ->> 'status' = 'available'
         or (data ->> 'status' = 'pending' and coalesce((data ->> 'pendingUntil')::bigint, 0) < (extract(epoch from now()) * 1000)::bigint))
  returning *;
$function$;

CREATE OR REPLACE FUNCTION public.set_records_status(p_ids text[], p_status text, p_only_if text DEFAULT NULL::text)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  update records set data = (data - 'pendingUntil') || jsonb_build_object('status', p_status)
    || case when p_status = 'sold' then jsonb_build_object('soldAt', (extract(epoch from now()) * 1000)::bigint) else '{}'::jsonb end
  where id = any(p_ids) and (p_only_if is null or data ->> 'status' = p_only_if);
$function$;

-- Table policies

create policy tracks_admin on public.tracks for all using (is_admin()) with check (is_admin());
create policy tracks_read on public.tracks for select using ((coalesce((data ->> 'hidden')::boolean, false) = false) or is_admin());
create policy orders_admin on public.orders for all using (is_admin()) with check (is_admin());
create policy orders_insert on public.orders for insert with check ((data ->> 'status') = 'sent-to-stripe');
create policy subscribers_admin on public.subscribers for all using (is_admin()) with check (is_admin());
create policy settings_admin on public.settings for all using (is_admin()) with check (is_admin());
create policy settings_read on public.settings for select using (true);
create policy events_admin on public.events for all using (is_admin()) with check (is_admin());
create policy events_insert on public.events for insert with check (type = any (array['play', 'cart']));
create policy admins_self on public.admins for select using (is_admin());
create policy records_admin on public.records for all using (is_admin()) with check (is_admin());
create policy records_read on public.records for select using ((coalesce(data ->> 'status', 'available') <> 'hidden') or is_admin());

-- Storage: two public buckets, "previews" (beat audio previews) and "crate" (vinyl photos)

insert into storage.buckets (id, name, public) values ('previews', 'previews', true), ('crate', 'crate', true);

create policy previews_admin_select on storage.objects for select using (bucket_id = 'previews' and is_admin());
create policy previews_admin_insert on storage.objects for insert with check (bucket_id = 'previews' and is_admin());
create policy previews_admin_update on storage.objects for update using (bucket_id = 'previews' and is_admin());
create policy previews_admin_delete on storage.objects for delete using (bucket_id = 'previews' and is_admin());
create policy crate_admin_select on storage.objects for select using (bucket_id = 'crate' and is_admin());
create policy crate_admin_insert on storage.objects for insert with check (bucket_id = 'crate' and is_admin());
create policy crate_admin_update on storage.objects for update using (bucket_id = 'crate' and is_admin());
create policy crate_admin_delete on storage.objects for delete using (bucket_id = 'crate' and is_admin());
