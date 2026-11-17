create sequence if not exists public.store_orders_order_number_seq
  as bigint
  minvalue 1
  maxvalue 99999
  start with 1
  increment by 1
  no cycle;

alter table public.store_orders
  add column if not exists order_number text;

do $$
declare
  order_count bigint;
begin
  select count(*) into order_count from public.store_orders;
  if order_count > 99999 then
    raise exception 'Cannot assign five-digit MWY order numbers to % existing orders; expand the order number format first.', order_count;
  end if;

  with numbered_orders as (
    select id, row_number() over (order by created_at, id) as sequence_number
    from public.store_orders
    where order_number is null
  )
  update public.store_orders orders
  set order_number = 'MWY-' || lpad(numbered_orders.sequence_number::text, 5, '0')
  from numbered_orders
  where orders.id = numbered_orders.id;

  select coalesce(max(substring(order_number from 5)::bigint), 0)
    into order_count
  from public.store_orders;

  if order_count = 0 then
    perform setval('public.store_orders_order_number_seq', 1, false);
  else
    perform setval('public.store_orders_order_number_seq', order_count, true);
  end if;
end;
$$;

alter table public.store_orders
  alter column order_number set not null;

alter table public.store_orders
  add constraint store_orders_order_number_format
  check (order_number ~ '^MWY-[0-9]{5}$');

create unique index if not exists store_orders_order_number_unique
  on public.store_orders(order_number);

create or replace function public.assign_store_order_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.order_number := 'MWY-' || lpad(nextval('public.store_orders_order_number_seq')::text, 5, '0');
  elsif new.order_number is distinct from old.order_number then
    raise exception 'order_number_is_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_store_order_number on public.store_orders;
create trigger trg_assign_store_order_number
before insert or update of order_number on public.store_orders
for each row execute function public.assign_store_order_number();
