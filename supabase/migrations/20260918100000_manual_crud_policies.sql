-- Allow each authenticated tenant to manage the records created by the UI.
drop policy if exists "appointments owner all" on public.appointments;
create policy "appointments owner all" on public.appointments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "orders owner all" on public.store_orders;
create policy "orders owner all" on public.store_orders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "crm activities owner all" on public.crm_activities;
create policy "crm activities owner all" on public.crm_activities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);