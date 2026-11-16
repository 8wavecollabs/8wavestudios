-- Vinyl crate. Run after schema.sql: Supabase → SQL Editor → New query → paste → Run.
-- Safe to run again.

create table if not exists records (id text primary key, data jsonb not null, created_at timestamptz default now());
alter table records enable row level security;

drop policy if exists records_read on records;
drop policy if exists records_admin on records;
-- Everyone sees listed and sold records (sold ones show a SOLD badge); hidden/draft ones only the producer sees
create policy records_read  on records for select using (coalesce(data ->> 'status', 'available') <> 'hidden' or is_admin());
create policy records_admin on records for all using (is_admin()) with check (is_admin());

-- Reserve records for a checkout so two buyers can't pay for the same one. Only the server functions may call these.
create or replace function reserve_records(p_ids text[], p_until bigint) returns setof records
language sql security definer set search_path = public as $$
  update records set data = data || jsonb_build_object('status', 'pending', 'pendingUntil', p_until)
  where id = any(p_ids)
    and (data ->> 'status' = 'available'
         or (data ->> 'status' = 'pending' and coalesce((data ->> 'pendingUntil')::bigint, 0) < (extract(epoch from now()) * 1000)::bigint))
  returning *;
$$;

-- Move records to a new status; p_only_if limits it to records currently in that status
create or replace function set_records_status(p_ids text[], p_status text, p_only_if text default null) returns void
language sql security definer set search_path = public as $$
  update records set data = (data - 'pendingUntil') || jsonb_build_object('status', p_status)
    || case when p_status = 'sold' then jsonb_build_object('soldAt', (extract(epoch from now()) * 1000)::bigint) else '{}'::jsonb end
  where id = any(p_ids) and (p_only_if is null or data ->> 'status' = p_only_if);
$$;

revoke execute on function reserve_records(text[], bigint) from public, anon, authenticated;
revoke execute on function set_records_status(text[], text, text) from public, anon, authenticated;

-- Listing photos: public to view, only the producer uploads
insert into storage.buckets (id, name, public) values ('crate', 'crate', true) on conflict (id) do nothing;
drop policy if exists crate_admin_select on storage.objects;
drop policy if exists crate_admin_insert on storage.objects;
drop policy if exists crate_admin_update on storage.objects;
drop policy if exists crate_admin_delete on storage.objects;
create policy crate_admin_select on storage.objects for select using (bucket_id = 'crate' and is_admin());
create policy crate_admin_insert on storage.objects for insert with check (bucket_id = 'crate' and is_admin());
create policy crate_admin_update on storage.objects for update using (bucket_id = 'crate' and is_admin());
create policy crate_admin_delete on storage.objects for delete using (bucket_id = 'crate' and is_admin());
