create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'attendant')),
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'removed')),
  name text,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, email)
);

create table if not exists public.business_member_permissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  member_id uuid not null references public.business_members(id) on delete cascade,
  permission text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, permission)
);

create table if not exists public.business_audit_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.inbox_conversations(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists business_members_business_idx on public.business_members(business_id, status);
create index if not exists business_permissions_member_idx on public.business_member_permissions(member_id, permission);
create index if not exists business_audit_business_idx on public.business_audit_log(business_id, created_at desc);

insert into public.businesses(owner_id, name)
select p.user_id, coalesce(nullif(p.business_name, ''), p.full_name, 'Minha empresa')
from public.profiles p
where p.created_by is null
on conflict (owner_id) do update set name = coalesce(public.businesses.name, excluded.name);

insert into public.business_members(business_id, user_id, role, status, name, email)
select b.id, b.owner_id, 'owner', 'active', p.full_name, coalesce(p.email, u.email, '')
from public.businesses b
join public.profiles p on p.user_id = b.owner_id
join auth.users u on u.id = b.owner_id
on conflict (user_id) do update set role = 'owner', status = 'active', business_id = excluded.business_id;

insert into public.businesses(owner_id, name)
select distinct p.created_by, coalesce(owner.business_name, 'Minha empresa')
from public.profiles p
left join public.profiles owner on owner.user_id = p.created_by
where p.created_by is not null
on conflict (owner_id) do nothing;

insert into public.business_members(business_id, user_id, role, status, name, email)
select b.id, p.user_id, 'attendant',
  case when coalesce(p.is_suspended, false) or p.status = 'suspended' then 'suspended' else 'active' end,
  p.full_name, coalesce(p.email, u.email, '')
from public.profiles p
join public.businesses b on b.owner_id = p.created_by
join auth.users u on u.id = p.user_id
where p.created_by is not null
on conflict (user_id) do update set business_id = excluded.business_id, role = 'attendant', name = excluded.name, email = excluded.email;

insert into public.business_member_permissions(business_id, member_id, permission, enabled)
select m.business_id, m.id, permission, true
from public.business_members m
cross join unnest(array['inbox.view','inbox.send','contacts.view','orders.view','orders.create','agenda.view','crm.view','products.view']) permission
where m.role = 'attendant'
on conflict (member_id, permission) do nothing;

create or replace function public.current_business_id()
returns uuid language sql stable security definer set search_path=public as $$
  select business_id from public.business_members where user_id = auth.uid() and status = 'active' limit 1;
$$;

create or replace function public.is_business_owner(p_business_id uuid default public.current_business_id())
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.business_members where business_id = p_business_id and user_id = auth.uid() and role = 'owner' and status = 'active');
$$;

create or replace function public.has_business_permission(p_permission text, p_business_id uuid default public.current_business_id())
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_business_owner(p_business_id) or exists(
    select 1 from public.business_member_permissions p
    join public.business_members m on m.id = p.member_id
    where m.business_id = p_business_id and m.user_id = auth.uid() and m.role = 'attendant' and m.status = 'active' and p.permission = p_permission and p.enabled
  );
$$;

grant execute on function public.current_business_id() to authenticated;
grant execute on function public.is_business_owner(uuid) to authenticated;
grant execute on function public.has_business_permission(text, uuid) to authenticated;

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.business_member_permissions enable row level security;
alter table public.business_audit_log enable row level security;

create policy businesses_member_read on public.businesses for select to authenticated using (id = public.current_business_id());
create policy business_members_self_or_owner_read on public.business_members for select to authenticated using (business_id = public.current_business_id());
create policy business_permissions_self_or_owner_read on public.business_member_permissions for select to authenticated using (business_id = public.current_business_id());
create policy business_audit_owner_read on public.business_audit_log for select to authenticated using (business_id = public.current_business_id() and public.is_business_owner(business_id));

-- Keep the existing row model while enforcing member visibility server-side.
drop policy if exists inbox_member_select on public.inbox_conversations;
create policy inbox_member_select on public.inbox_conversations for select to authenticated using (
  (user_id = auth.uid() and public.has_business_permission('inbox.view'))
  or (public.is_business_owner() and user_id = (select owner_id from public.businesses where id = public.current_business_id()))
  or (assigned_to = auth.uid() and public.has_business_permission('inbox.view'))
  or (assigned_to is null and public.has_business_permission('inbox.view_unassigned'))
);

create policy messages_member_select on public.messages for select to authenticated using (
  user_id = auth.uid() and public.has_business_permission('inbox.view')
  or exists (
    select 1 from public.whatsapp_contacts c
    join public.inbox_conversations ic on ic.contact_id = c.id
    where c.user_id = messages.user_id and c.phone_number = messages.phone_number
      and (ic.assigned_to = auth.uid() or public.is_business_owner() or (ic.assigned_to is null and public.has_business_permission('inbox.view_unassigned')))
  )
);

alter table public.inbox_conversations add column if not exists response_mode text not null default 'ai' check (response_mode in ('ai','human'));
