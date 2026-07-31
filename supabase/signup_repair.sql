-- Motorly signup reliability repair.
-- Run this file in Supabase > SQL Editor.

create or replace function public.is_username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    candidate is not null
    and lower(trim(candidate)) ~ '^[a-z0-9_]{3,20}$'
    and not exists (
      select 1
      from public.profiles
      where username = lower(trim(candidate))
    );
$$;

revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text)
  to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_username text;
  final_username text;
  safe_display_name text;
begin
  requested_username := lower(trim(new.raw_user_meta_data ->> 'username'));

  if requested_username ~ '^[a-z0-9_]{3,20}$'
     and not exists (
       select 1 from public.profiles where username = requested_username
     ) then
    final_username := requested_username;
  else
    final_username :=
      'driver_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  safe_display_name := coalesce(
    nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 80), ''),
    final_username
  );

  insert into public.profiles (id, username, display_name)
  values (new.id, final_username, safe_display_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
