create table if not exists public.community_toll_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  route_key text not null,
  distance_km numeric(10, 2) not null check (distance_km >= 0),
  toll_amount numeric(10, 2) not null check (toll_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, route_key)
);

create index if not exists community_toll_reports_route_key_idx
  on public.community_toll_reports(route_key);

alter table public.community_toll_reports enable row level security;

drop policy if exists "Authenticated users can read toll reports"
  on public.community_toll_reports;
create policy "Authenticated users can read toll reports"
  on public.community_toll_reports
  for select
  to authenticated
  using (true);

drop policy if exists "Users can insert their own toll reports"
  on public.community_toll_reports;
create policy "Users can insert their own toll reports"
  on public.community_toll_reports
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own toll reports"
  on public.community_toll_reports;
create policy "Users can update their own toll reports"
  on public.community_toll_reports
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own toll reports"
  on public.community_toll_reports;
create policy "Users can delete their own toll reports"
  on public.community_toll_reports
  for delete
  to authenticated
  using (auth.uid() = user_id);
