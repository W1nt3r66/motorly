-- Motorly cross-device garage sync.
-- Run this entire file once in Supabase > SQL Editor.

create table if not exists public.user_garages (
  user_id uuid primary key references auth.users(id) on delete cascade,
  garage_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_garages enable row level security;

revoke all on table public.user_garages from anon;
grant select, insert, update, delete on table public.user_garages to authenticated;

drop policy if exists "Users can read their own garage" on public.user_garages;
create policy "Users can read their own garage"
on public.user_garages
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own garage" on public.user_garages;
create policy "Users can create their own garage"
on public.user_garages
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own garage" on public.user_garages;
create policy "Users can update their own garage"
on public.user_garages
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own garage" on public.user_garages;
create policy "Users can delete their own garage"
on public.user_garages
for delete
to authenticated
using ((select auth.uid()) = user_id);

-- Enable live changes so an open phone and desktop stay in sync.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_garages'
  ) then
    alter publication supabase_realtime add table public.user_garages;
  end if;
end
$$;
