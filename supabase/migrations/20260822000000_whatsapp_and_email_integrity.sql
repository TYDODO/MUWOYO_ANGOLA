-- Harden account creation and WhatsApp pairing so a single phone or email cannot be reused across accounts.
-- The checks are enforced at the database layer, not only in the UI, to prevent abuse and duplicate registrations.

create or replace function public.normalize_phone_number(p_phone text)
returns text
language sql
immutable
security invoker
set search_path = public
as $$
  select nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g'), '')
$$;

create or replace function public.normalize_email_address(p_email text)
returns text
language sql
immutable
security invoker
set search_path = public
as $$
  select nullif(lower(trim(coalesce(p_email, ''))), '')
$$;

create unique index if not exists profiles_email_unique_idx
  on public.profiles (public.normalize_email_address(email))
  where email is not null;

create unique index if not exists instances_phone_number_unique_idx
  on public.instances (public.normalize_phone_number(phone_number))
  where phone_number is not null;

create or replace function public.guard_profile_email_uniqueness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
begin
  normalized_email := public.normalize_email_address(new.email);
  if normalized_email is null then
    return new;
  end if;

  if exists (
    select 1
    from public.profiles p
    where public.normalize_email_address(p.email) = normalized_email
      and p.user_id <> coalesce(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    raise exception 'email_already_in_use';
  end if;

  new.email := normalized_email;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_email_uniqueness on public.profiles;
create trigger trg_guard_profile_email_uniqueness
before insert or update of email on public.profiles
for each row execute function public.guard_profile_email_uniqueness();

create or replace function public.guard_instance_phone_uniqueness()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_phone text;
begin
  normalized_phone := public.normalize_phone_number(new.phone_number);
  if normalized_phone is null then
    return new;
  end if;

  if exists (
    select 1
    from public.instances i
    where public.normalize_phone_number(i.phone_number) = normalized_phone
      and i.user_id <> coalesce(new.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    raise exception 'whatsapp_number_already_in_use';
  end if;

  new.phone_number := normalized_phone;
  return new;
end;
$$;

drop trigger if exists trg_guard_instance_phone_uniqueness on public.instances;
create trigger trg_guard_instance_phone_uniqueness
before insert or update of phone_number on public.instances
for each row execute function public.guard_instance_phone_uniqueness();

create or replace function public.enforce_single_connection_for_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.instances i
    where i.user_id = new.user_id
      and i.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) then
    raise exception 'user_already_has_connected_instance';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_single_connection_for_user on public.instances;
create trigger trg_enforce_single_connection_for_user
before insert or update of user_id on public.instances
for each row execute function public.enforce_single_connection_for_user();
