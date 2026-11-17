create or replace function public.is_active_delivery_person_assigned(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.delivery_order_assignments assignment
    join public.delivery_people person
      on person.id = assignment.delivery_person_id
    where assignment.order_id = p_order_id
      and assignment.active
      and person.user_id = auth.uid()
      and person.status = 'active'
  );
$$;

revoke all on function public.is_active_delivery_person_assigned(uuid) from public, anon;
grant execute on function public.is_active_delivery_person_assigned(uuid) to authenticated;

drop policy if exists delivery_person_orders_read on public.store_orders;
create policy delivery_person_orders_read on public.store_orders
for select to authenticated
using (public.is_active_delivery_person_assigned(id));
