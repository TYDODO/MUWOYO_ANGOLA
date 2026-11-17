alter table public.store_orders
  add column if not exists delivery_status text not null default 'awaiting_pickup'
    check (delivery_status in ('awaiting_pickup', 'preparing', 'ready_for_delivery', 'in_delivery', 'delivered', 'failed_delivery', 'cancelled')),
  add column if not exists subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  add column if not exists delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  add column if not exists discount numeric(12,2) not null default 0 check (discount >= 0),
  add column if not exists delivery_distance_km numeric(8,2) check (delivery_distance_km is null or delivery_distance_km >= 0);

update public.store_orders
set subtotal = greatest(coalesce(total, 0), 0)
where subtotal = 0 and coalesce(total, 0) > 0;
update public.store_orders
set delivery_status = case
  when status = 'delivered' then 'delivered'
  when status = 'cancelled' then 'cancelled'
  else 'awaiting_pickup'
end;

create or replace function public.normalize_store_order_delivery_totals()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.subtotal = 0 and coalesce(new.total, 0) > 0 then
      new.subtotal := greatest(new.total - new.delivery_fee + new.discount, 0);
    end if;
    new.total := new.subtotal + new.delivery_fee - new.discount;
  elsif new.subtotal is distinct from old.subtotal
     or new.delivery_fee is distinct from old.delivery_fee
     or new.discount is distinct from old.discount then
    new.total := new.subtotal + new.delivery_fee - new.discount;
  elsif new.total is distinct from old.total then
    new.subtotal := greatest(coalesce(new.total, 0) - new.delivery_fee + new.discount, 0);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_normalize_store_order_delivery_totals on public.store_orders;
create trigger trg_normalize_store_order_delivery_totals
before insert or update of subtotal, delivery_fee, discount, total on public.store_orders
for each row execute function public.normalize_store_order_delivery_totals();

create table if not exists public.delivery_people (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  avatar_url text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, email)
);

create table if not exists public.delivery_order_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  delivery_person_id uuid not null references public.delivery_people(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  is_primary boolean not null default false,
  active boolean not null default true,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  unique (order_id, delivery_person_id, assigned_at)
);
create unique index if not exists delivery_order_one_active_assignment
  on public.delivery_order_assignments(order_id, delivery_person_id) where active;
create unique index if not exists delivery_order_one_active_lead
  on public.delivery_order_assignments(order_id) where active and is_primary;
create index if not exists delivery_assignments_person_active
  on public.delivery_order_assignments(delivery_person_id, order_id) where active;

create table if not exists public.delivery_fee_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  fee_type text not null default 'free' check (fee_type in ('free', 'fixed', 'per_order', 'distance')),
  default_fee numeric(12,2) not null default 0 check (default_fee >= 0),
  distance_rules jsonb not null default '[]'::jsonb check (jsonb_typeof(distance_rules) = 'array'),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.delivery_order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  delivery_status text not null check (delivery_status in ('awaiting_pickup', 'preparing', 'ready_for_delivery', 'in_delivery', 'delivered', 'failed_delivery', 'cancelled')),
  actor_user_id uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists delivery_status_history_order_time
  on public.delivery_order_status_history(order_id, created_at desc);

create or replace function public.touch_delivery_person()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_delivery_person_updated on public.delivery_people;
create trigger trg_delivery_person_updated before update on public.delivery_people
for each row execute function public.touch_delivery_person();

create or replace function public.activate_verified_delivery_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_verified is true and old.email_verified is distinct from true then
    update public.delivery_people
    set status = 'active'
    where user_id = new.user_id and status = 'pending';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_activate_verified_delivery_person on public.profiles;
create trigger trg_activate_verified_delivery_person
after update of email_verified on public.profiles
for each row execute function public.activate_verified_delivery_person();

alter table public.delivery_people enable row level security;
alter table public.delivery_order_assignments enable row level security;
alter table public.delivery_fee_settings enable row level security;
alter table public.delivery_order_status_history enable row level security;

drop policy if exists delivery_people_owner_manage on public.delivery_people;
create policy delivery_people_owner_manage on public.delivery_people
for all to authenticated
using (public.is_business_owner(business_id))
with check (public.is_business_owner(business_id));
drop policy if exists delivery_people_self_read on public.delivery_people;
create policy delivery_people_self_read on public.delivery_people
for select to authenticated using (user_id = auth.uid());

drop policy if exists delivery_assignments_owner_manage on public.delivery_order_assignments;
create policy delivery_assignments_owner_manage on public.delivery_order_assignments
for all to authenticated
using (exists (
  select 1 from public.store_orders order_row
  where order_row.id = delivery_order_assignments.order_id
    and public.is_business_owner(public.current_business_id())
    and order_row.user_id = (select owner_id from public.businesses where id = public.current_business_id())
))
with check (exists (
  select 1 from public.store_orders order_row
  join public.delivery_people person on person.id = delivery_order_assignments.delivery_person_id
  where order_row.id = delivery_order_assignments.order_id
    and person.business_id = public.current_business_id()
    and order_row.user_id = (select owner_id from public.businesses where id = public.current_business_id())
    and public.is_business_owner(person.business_id)
));
drop policy if exists delivery_assignments_person_read on public.delivery_order_assignments;
create policy delivery_assignments_person_read on public.delivery_order_assignments
for select to authenticated using (exists (
  select 1 from public.delivery_people person
  where person.id = delivery_order_assignments.delivery_person_id
    and person.user_id = auth.uid() and person.status = 'active'
));

drop policy if exists delivery_fee_owner_manage on public.delivery_fee_settings;
create policy delivery_fee_owner_manage on public.delivery_fee_settings
for all to authenticated using (public.is_business_owner(business_id))
with check (public.is_business_owner(business_id));

drop policy if exists delivery_status_history_owner_read on public.delivery_order_status_history;
create policy delivery_status_history_owner_read on public.delivery_order_status_history
for select to authenticated using (public.is_business_owner(business_id));
drop policy if exists delivery_status_history_person_read on public.delivery_order_status_history;
create policy delivery_status_history_person_read on public.delivery_order_status_history
for select to authenticated using (exists (
  select 1 from public.delivery_order_assignments assignment
  join public.delivery_people person on person.id = assignment.delivery_person_id
  where assignment.order_id = delivery_order_status_history.order_id
    and assignment.active and person.user_id = auth.uid() and person.status = 'active'
));

drop policy if exists delivery_person_orders_read on public.store_orders;
create policy delivery_person_orders_read on public.store_orders
for select to authenticated using (exists (
  select 1 from public.delivery_order_assignments assignment
  join public.delivery_people person on person.id = assignment.delivery_person_id
  where assignment.order_id = store_orders.id
    and assignment.active and person.user_id = auth.uid() and person.status = 'active'
));

revoke all on public.delivery_people, public.delivery_order_assignments, public.delivery_fee_settings, public.delivery_order_status_history from anon, authenticated;
grant select on public.delivery_people, public.delivery_order_assignments, public.delivery_fee_settings, public.delivery_order_status_history to authenticated;
grant insert, update, delete on public.delivery_fee_settings to authenticated;
grant select on public.store_orders to authenticated;

create or replace function public.assign_delivery_people(
  p_order_id uuid,
  p_delivery_person_ids uuid[],
  p_primary_delivery_person_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_owner uuid;
  business_uuid uuid;
  person_count integer;
begin
  select order_row.user_id, business.id into order_owner, business_uuid
  from public.store_orders order_row
  join public.businesses business on business.owner_id = order_row.user_id
  where order_row.id = p_order_id;
  if order_owner is null or order_owner <> auth.uid() then
    raise exception 'order_not_found_or_forbidden' using errcode = '42501';
  end if;

  select count(distinct requested.person_id) into person_count
  from unnest(coalesce(p_delivery_person_ids, '{}'::uuid[])) as requested(person_id);
  if person_count > 0 and not exists (
    select 1 from public.delivery_people person
    where person.business_id = business_uuid
      and person.id = p_primary_delivery_person_id
      and person.id = any(p_delivery_person_ids)
      and person.status = 'active'
  ) then
    raise exception 'active_primary_delivery_person_required' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_delivery_person_ids, '{}'::uuid[])) requested(id)
    left join public.delivery_people person on person.id = requested.id
      and person.business_id = business_uuid and person.status = 'active'
    where person.id is null
  ) then
    raise exception 'invalid_delivery_person' using errcode = '22023';
  end if;

  update public.delivery_order_assignments
  set active = false, is_primary = false, unassigned_at = now()
  where order_id = p_order_id and active
    and not (delivery_person_id = any(coalesce(p_delivery_person_ids, '{}'::uuid[])));

  update public.delivery_order_assignments
  set is_primary = false
  where order_id = p_order_id and active
    and delivery_person_id = any(coalesce(p_delivery_person_ids, '{}'::uuid[]));

  update public.delivery_order_assignments
  set is_primary = true
  where order_id = p_order_id and active
    and delivery_person_id = p_primary_delivery_person_id;

  insert into public.delivery_order_assignments(order_id, delivery_person_id, assigned_by, is_primary)
  select p_order_id, requested.id, auth.uid(), requested.id = p_primary_delivery_person_id
  from (select distinct unnest(coalesce(p_delivery_person_ids, '{}'::uuid[])) id) requested
  where not exists (
    select 1 from public.delivery_order_assignments existing
    where existing.order_id = p_order_id and existing.delivery_person_id = requested.id and existing.active
  );
end;
$$;
revoke all on function public.assign_delivery_people(uuid, uuid[], uuid) from public, anon;
grant execute on function public.assign_delivery_people(uuid, uuid[], uuid) to authenticated;

create or replace function public.update_delivery_order_status(
  p_order_id uuid,
  p_status text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_owner uuid;
  business_uuid uuid;
  current_status text;
  is_owner boolean;
  is_lead boolean;
  allowed boolean := false;
begin
  if p_status not in ('awaiting_pickup', 'preparing', 'ready_for_delivery', 'in_delivery', 'delivered', 'failed_delivery', 'cancelled') then
    raise exception 'invalid_delivery_status' using errcode = '22023';
  end if;

  select order_row.user_id, business.id, order_row.delivery_status
  into order_owner, business_uuid, current_status
  from public.store_orders order_row
  join public.businesses business on business.owner_id = order_row.user_id
  where order_row.id = p_order_id for update of order_row;
  if order_owner is null then raise exception 'order_not_found' using errcode = 'P0002'; end if;
  is_owner := order_owner = auth.uid();
  select exists (
    select 1 from public.delivery_order_assignments assignment
    join public.delivery_people person on person.id = assignment.delivery_person_id
    where assignment.order_id = p_order_id and assignment.active and assignment.is_primary
      and person.user_id = auth.uid() and person.status = 'active'
  ) into is_lead;

  if not is_owner and not is_lead then
    raise exception 'delivery_status_forbidden' using errcode = '42501';
  end if;
  if not is_owner then
    allowed := case current_status
      when 'awaiting_pickup' then p_status in ('preparing', 'ready_for_delivery', 'cancelled')
      when 'preparing' then p_status in ('ready_for_delivery', 'cancelled')
      when 'ready_for_delivery' then p_status in ('in_delivery', 'cancelled')
      when 'in_delivery' then p_status in ('delivered', 'failed_delivery')
      when 'failed_delivery' then p_status in ('ready_for_delivery', 'in_delivery')
      else false
    end;
    if not allowed then raise exception 'invalid_delivery_status_transition' using errcode = '22023'; end if;
  end if;

  perform set_config('app.delivery_status_notes', coalesce(nullif(trim(p_notes), ''), ''), true);
  update public.store_orders
  set delivery_status = p_status,
      status = case when p_status = 'delivered' then 'delivered' when p_status = 'cancelled' then 'cancelled' else status end
  where id = p_order_id;
end;
$$;
revoke all on function public.update_delivery_order_status(uuid, text, text) from public, anon;
grant execute on function public.update_delivery_order_status(uuid, text, text) to authenticated;

create or replace function public.record_delivery_order_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  business_uuid uuid;
begin
  if new.delivery_status is not distinct from old.delivery_status then return new; end if;
  select id into business_uuid from public.businesses where owner_id = new.user_id;
  if business_uuid is not null then
    insert into public.delivery_order_status_history(order_id, business_id, delivery_status, actor_user_id, notes)
    values (
      new.id,
      business_uuid,
      new.delivery_status,
      auth.uid(),
      nullif(current_setting('app.delivery_status_notes', true), '')
    );
  end if;
  return new;
end;
$$;
drop trigger if exists trg_record_delivery_order_status on public.store_orders;
create trigger trg_record_delivery_order_status
after update of delivery_status on public.store_orders
for each row execute function public.record_delivery_order_status();

create or replace function public.notify_delivery_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  person_user_id uuid;
  order_label text;
begin
  if not new.active then return new; end if;
  select person.user_id into person_user_id
  from public.delivery_people person
  where person.id = new.delivery_person_id and person.status = 'active';
  if person_user_id is null then return new; end if;

  select coalesce(nullif(order_row.customer_name, ''), 'Cliente')
  into order_label from public.store_orders order_row where order_row.id = new.order_id;
  insert into public.notifications(user_id, title, message, type, link)
  values (person_user_id, 'Novo pedido atribuído', 'Foi-lhe atribuído um pedido de ' || order_label || '.', 'delivery_assignment', '/entregador');
  return new;
end;
$$;
drop trigger if exists trg_notify_delivery_assignment on public.delivery_order_assignments;
create trigger trg_notify_delivery_assignment
after insert on public.delivery_order_assignments
for each row execute function public.notify_delivery_assignment();

insert into public.delivery_order_status_history(order_id, business_id, delivery_status)
select order_row.id, business.id, order_row.delivery_status
from public.store_orders order_row
join public.businesses business on business.owner_id = order_row.user_id
where not exists (
  select 1 from public.delivery_order_status_history history where history.order_id = order_row.id
);

notify pgrst, 'reload schema';
