-- Repair migration: the historical custom-email migration was recorded as applied
-- while this column was missing from the remote profiles table.
alter table public.profiles
  add column if not exists email_verified boolean not null default false;

create index if not exists profiles_email_verified_idx
  on public.profiles(email_verified);

update public.profiles
set email_verified = true
where email_verified = false
  and exists (
    select 1
    from auth.users
    where auth.users.id = profiles.user_id
      and auth.users.email_confirmed_at is not null
  );
