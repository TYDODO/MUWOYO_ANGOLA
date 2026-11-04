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

  if coalesce(account_metadata->>'is_subadmin', 'false') = 'true'
    or account_metadata->>'business_member_role' = 'attendant' then
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

insert into public.businesses(owner_id, name)
select profile.user_id, coalesce(nullif(profile.business_name, ''), profile.full_name, 'Minha empresa')
from public.profiles profile
join public.user_roles role on role.user_id = profile.user_id and role.role = 'client'
where profile.created_by is not null
on conflict (owner_id) do nothing;

insert into public.business_members(business_id, user_id, role, status, name, email)
select business.id, profile.user_id, 'owner', 'active', profile.full_name, coalesce(profile.email, '')
from public.profiles profile
join public.user_roles role on role.user_id = profile.user_id and role.role = 'client'
join public.businesses business on business.owner_id = profile.user_id
where profile.created_by is not null
on conflict (user_id) do update
  set business_id = excluded.business_id,
      role = 'owner',
      status = 'active',
      name = excluded.name,
      email = excluded.email;

drop policy if exists instances_member_read on public.instances;
create policy instances_member_read on public.instances
for select to authenticated using (
  exists (
    select 1
    from public.businesses business
    where business.owner_id = instances.user_id
      and (
        public.is_business_owner(business.id)
        or public.has_business_permission('inbox.view', business.id)
        or public.has_business_permission('contacts.view', business.id)
      )
  )
);