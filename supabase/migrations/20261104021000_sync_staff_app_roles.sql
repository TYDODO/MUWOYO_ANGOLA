create or replace function public.ensure_business_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  business_uuid uuid;
  account_metadata jsonb;
begin
  select raw_user_meta_data into account_metadata
  from auth.users
  where id = new.user_id;

  if new.created_by is not null
    or coalesce(account_metadata->>'is_subadmin', 'false') = 'true'
    or account_metadata->>'business_member_role' = 'attendant'
    or account_metadata->>'account_type' = 'delivery_person' then
    return new;
  end if;

  insert into public.businesses(owner_id, name)
  values (new.user_id, coalesce(nullif(new.business_name, ''), new.full_name, 'Minha empresa'))
  on conflict (owner_id) do update
    set name = coalesce(nullif(excluded.name, ''), public.businesses.name)
  returning id into business_uuid;

  insert into public.business_members(business_id, user_id, role, status, name, email)
  values (business_uuid, new.user_id, 'owner', 'active', new.full_name, coalesce(new.email, ''))
  on conflict (user_id) do update
    set business_id = excluded.business_id,
        role = 'owner',
        status = 'active',
        name = excluded.name,
        email = excluded.email;

  return new;
end;
$$;

create or replace function public.sync_attendant_app_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'attendant' then
    delete from public.user_roles
    where user_id = new.user_id and role = 'client';

    insert into public.user_roles(user_id, role)
    values (new.user_id, 'attendant')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_attendant_app_role on public.business_members;
create trigger trg_sync_attendant_app_role
after insert or update of user_id, role on public.business_members
for each row execute function public.sync_attendant_app_role();

create or replace function public.sync_delivery_person_app_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.user_roles
  where user_id = new.user_id and role = 'client';

  insert into public.user_roles(user_id, role)
  values (new.user_id, 'delivery_person')
  on conflict (user_id, role) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_sync_delivery_person_app_role on public.delivery_people;
create trigger trg_sync_delivery_person_app_role
after insert or update of user_id on public.delivery_people
for each row execute function public.sync_delivery_person_app_role();

insert into public.user_roles(user_id, role)
select member.user_id, 'attendant'
from public.business_members member
where member.role = 'attendant'
on conflict (user_id, role) do nothing;

delete from public.user_roles roles
using public.business_members member
where member.user_id = roles.user_id
  and member.role = 'attendant'
  and roles.role = 'client';

insert into public.user_roles(user_id, role)
select person.user_id, 'delivery_person'
from public.delivery_people person
on conflict (user_id, role) do nothing;

delete from public.user_roles roles
using public.delivery_people person
where person.user_id = roles.user_id
  and roles.role = 'client';

delete from public.business_members member
using public.businesses business, public.delivery_people person
where member.business_id = business.id
  and member.user_id = person.user_id
  and business.owner_id = person.user_id
  and member.role = 'owner';
