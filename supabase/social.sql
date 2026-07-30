-- Motorly profiles and friendships.
-- Run this entire file once in Supabase > SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique
    check (username = lower(username))
    check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null
    check (char_length(display_name) between 1 and 80),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

-- Only one relationship can exist between the same two users, regardless of
-- who sent the request.
create unique index if not exists friendships_unique_pair_idx
  on public.friendships (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  );

create index if not exists friendships_requester_idx
  on public.friendships(requester_id);
create index if not exists friendships_addressee_idx
  on public.friendships(addressee_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists friendships_set_updated_at on public.friendships;
create trigger friendships_set_updated_at
before update on public.friendships
for each row execute function public.set_updated_at();

-- Create the searchable profile at the same time as the Auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
  safe_username text;
  safe_display_name text;
begin
  requested_username := lower(trim(new.raw_user_meta_data ->> 'username'));
  safe_username := case
    when requested_username ~ '^[a-z0-9_]{3,20}$'
      then requested_username
    else 'driver_' || substr(replace(new.id::text, '-', ''), 1, 8)
  end;
  safe_display_name := coalesce(
    nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 80), ''),
    safe_username
  );

  insert into public.profiles (id, username, display_name)
  values (new.id, safe_username, safe_display_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill profiles for accounts that existed before this schema was added.
insert into public.profiles (id, username, display_name)
select
  users.id,
  case
    when lower(trim(users.raw_user_meta_data ->> 'username'))
      ~ '^[a-z0-9_]{3,20}$'
      then lower(trim(users.raw_user_meta_data ->> 'username'))
    else 'driver_' || substr(replace(users.id::text, '-', ''), 1, 8)
  end,
  coalesce(
    nullif(
      left(trim(users.raw_user_meta_data ->> 'display_name'), 80),
      ''
    ),
    case
      when lower(trim(users.raw_user_meta_data ->> 'username'))
        ~ '^[a-z0-9_]{3,20}$'
        then lower(trim(users.raw_user_meta_data ->> 'username'))
      else 'Driver'
    end
  )
from auth.users as users
on conflict do nothing;

alter table public.profiles enable row level security;
alter table public.friendships enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (username, display_name, avatar_url) on table public.profiles
  to authenticated;

revoke all on table public.friendships from anon, authenticated;
grant select, insert, delete on table public.friendships to authenticated;
grant update (status) on table public.friendships to authenticated;

drop policy if exists "Authenticated users can find profiles"
  on public.profiles;
create policy "Authenticated users can find profiles"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "Users can update their own profile"
  on public.profiles;
create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Participants can read friendships"
  on public.friendships;
create policy "Participants can read friendships"
on public.friendships
for select
to authenticated
using (
  (select auth.uid()) = requester_id
  or (select auth.uid()) = addressee_id
);

drop policy if exists "Users can send friend requests"
  on public.friendships;
create policy "Users can send friend requests"
on public.friendships
for insert
to authenticated
with check (
  (select auth.uid()) = requester_id
  and requester_id <> addressee_id
  and status = 'pending'
);

drop policy if exists "Recipients can accept friend requests"
  on public.friendships;
create policy "Recipients can accept friend requests"
on public.friendships
for update
to authenticated
using (
  (select auth.uid()) = addressee_id
  and status = 'pending'
)
with check (
  (select auth.uid()) = addressee_id
  and status = 'accepted'
);

drop policy if exists "Participants can remove friendships"
  on public.friendships;
create policy "Participants can remove friendships"
on public.friendships
for delete
to authenticated
using (
  (select auth.uid()) = requester_id
  or (select auth.uid()) = addressee_id
);

-- Friend requests and responses appear without requiring a manual refresh.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'friendships'
  ) then
    alter publication supabase_realtime add table public.friendships;
  end if;
end
$$;
