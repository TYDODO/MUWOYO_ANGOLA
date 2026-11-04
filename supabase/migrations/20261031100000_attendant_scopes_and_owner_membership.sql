alter table public.business_member_permissions
  add column if not exists data_scope text not null default 'all'
  check (data_scope in ('all', 'own'));

create or replace function public.business_permission_scope(
  p_permission text,
  p_business_id uuid default public.current_business_id()
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_business_owner(p_business_id) then 'all'
    else coalesce((
      select permission.data_scope
      from public.business_member_permissions permission
      join public.business_members member on member.id = permission.member_id
      where member.business_id = p_business_id
        and member.user_id = auth.uid()
        and member.role = 'attendant'
        and member.status = 'active'
        and permission.permission = p_permission
        and permission.enabled
      limit 1
    ), 'none')
  end;
$$;

grant execute on function public.business_permission_scope(text, uuid) to authenticated;

create or replace function public.ensure_business_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  business_uuid uuid;
begin
  if new.created_by is not null then
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

drop trigger if exists trg_ensure_business_owner_membership on public.profiles;
create trigger trg_ensure_business_owner_membership
after insert or update of created_by, business_name, full_name, email on public.profiles
for each row execute function public.ensure_business_owner_membership();

insert into public.businesses(owner_id, name)
select profile.user_id, coalesce(nullif(profile.business_name, ''), profile.full_name, 'Minha empresa')
from public.profiles profile
where profile.created_by is null
on conflict (owner_id) do nothing;

insert into public.business_members(business_id, user_id, role, status, name, email)
select business.id, business.owner_id, 'owner', 'active', profile.full_name, coalesce(profile.email, '')
from public.businesses business
join public.profiles profile on profile.user_id = business.owner_id
where profile.created_by is null
on conflict (user_id) do update
  set business_id = excluded.business_id,
      role = 'owner',
      status = 'active',
      name = excluded.name,
      email = excluded.email;

alter table public.store_orders add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table public.appointments add column if not exists assigned_to uuid references auth.users(id) on delete set null;
alter table public.products add column if not exists assigned_to uuid references auth.users(id) on delete set null;

create or replace function public.is_business_data_visible(
  p_owner_id uuid,
  p_permission text,
  p_assigned_to uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.businesses business
    join public.business_members member on member.business_id = business.id
    where business.owner_id = p_owner_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and public.has_business_permission(p_permission, business.id)
      and (
        public.business_permission_scope(p_permission, business.id) = 'all'
        or p_assigned_to = auth.uid()
      )
  );
$$;

grant execute on function public.is_business_data_visible(uuid, text, uuid) to authenticated;

drop policy if exists instances_member_read on public.instances;
create policy instances_member_read on public.instances
for select to authenticated using (
  public.is_business_data_visible(user_id, 'inbox.view')
  or public.is_business_data_visible(user_id, 'contacts.view')
);

create policy whatsapp_contacts_member_read on public.whatsapp_contacts
for select to authenticated using (
  public.is_business_data_visible(user_id, 'contacts.view')
  or exists (
    select 1
    from public.inbox_conversations conversation
    join public.businesses business on business.owner_id = whatsapp_contacts.user_id
    where conversation.user_id = whatsapp_contacts.user_id
      and conversation.contact_id = whatsapp_contacts.id
      and conversation.instance_name = whatsapp_contacts.instance_name
      and public.has_business_permission('inbox.view', business.id)
      and (
        public.business_permission_scope('inbox.view', business.id) = 'all'
        or conversation.assigned_to = auth.uid()
        or (conversation.assigned_to is null and public.has_business_permission('inbox.view_unassigned', business.id))
      )
  )
);

create policy whatsapp_contacts_member_insert on public.whatsapp_contacts
for insert to authenticated with check (
  public.is_business_data_visible(user_id, 'contacts.edit')
);
create policy whatsapp_contacts_member_update on public.whatsapp_contacts
for update to authenticated using (
  public.is_business_data_visible(user_id, 'contacts.edit')
) with check (
  public.is_business_data_visible(user_id, 'contacts.edit')
);
create policy whatsapp_contacts_member_delete on public.whatsapp_contacts
for delete to authenticated using (
  public.is_business_data_visible(user_id, 'contacts.delete')
);

drop policy if exists inbox_member_select on public.inbox_conversations;
create policy inbox_member_select on public.inbox_conversations
for select to authenticated using (
  user_id = auth.uid() and public.has_business_permission('inbox.view')
  or public.is_business_owner() and user_id = (select owner_id from public.businesses where id = public.current_business_id())
  or exists (
    select 1 from public.businesses business
    where business.owner_id = inbox_conversations.user_id
      and public.has_business_permission('inbox.view', business.id)
      and (
        public.business_permission_scope('inbox.view', business.id) = 'all'
        or inbox_conversations.assigned_to = auth.uid()
        or (inbox_conversations.assigned_to is null and public.has_business_permission('inbox.view_unassigned', business.id))
      )
  )
);

create policy inbox_member_insert on public.inbox_conversations
for insert to authenticated with check (
  exists (select 1 from public.businesses business where business.owner_id = inbox_conversations.user_id and public.has_business_permission('inbox.manage', business.id))
);
create policy inbox_member_update on public.inbox_conversations
for update to authenticated using (
  exists (select 1 from public.businesses business where business.owner_id = inbox_conversations.user_id and public.has_business_permission('inbox.assign', business.id) and (public.business_permission_scope('inbox.assign', business.id) = 'all' or inbox_conversations.assigned_to = auth.uid()))
) with check (
  exists (select 1 from public.businesses business where business.owner_id = inbox_conversations.user_id and public.has_business_permission('inbox.assign', business.id) and (public.business_permission_scope('inbox.assign', business.id) = 'all' or inbox_conversations.assigned_to = auth.uid()))
);

 drop policy if exists messages_member_select on public.messages;
create policy messages_member_select on public.messages
for select to authenticated using (
  user_id = auth.uid() and public.has_business_permission('inbox.view')
  or exists (
    select 1
    from public.whatsapp_contacts contact
    join public.inbox_conversations conversation
      on conversation.user_id = contact.user_id
     and conversation.contact_id = contact.id
     and conversation.instance_name = contact.instance_name
    join public.businesses business on business.owner_id = contact.user_id
    where contact.user_id = messages.user_id
      and contact.instance_name = messages.whatsapp_instance_id
      and contact.phone_number = messages.phone_number
      and public.has_business_permission('inbox.view', business.id)
      and (
        public.business_permission_scope('inbox.view', business.id) = 'all'
        or conversation.assigned_to = auth.uid()
        or (conversation.assigned_to is null and public.has_business_permission('inbox.view_unassigned', business.id))
      )
  )
);

create policy store_orders_member_read on public.store_orders
for select to authenticated using (public.is_business_data_visible(user_id, 'orders.view', assigned_to));
create policy store_orders_member_insert on public.store_orders
for insert to authenticated with check (
  assigned_to = auth.uid()
  and exists (select 1 from public.businesses business where business.owner_id = store_orders.user_id and public.has_business_permission('orders.create', business.id))
);
create policy store_orders_member_update on public.store_orders
for update to authenticated using (public.is_business_data_visible(user_id, 'orders.edit', assigned_to))
with check (public.is_business_data_visible(user_id, 'orders.edit', assigned_to));
create policy store_orders_member_delete on public.store_orders
for delete to authenticated using (public.is_business_data_visible(user_id, 'orders.delete', assigned_to));

create policy appointments_member_read on public.appointments
for select to authenticated using (public.is_business_data_visible(user_id, 'agenda.view', assigned_to));
create policy appointments_member_insert on public.appointments
for insert to authenticated with check (
  assigned_to = auth.uid()
  and exists (select 1 from public.businesses business where business.owner_id = appointments.user_id and public.has_business_permission('agenda.create', business.id))
);
create policy appointments_member_update on public.appointments
for update to authenticated using (public.is_business_data_visible(user_id, 'agenda.edit', assigned_to))
with check (public.is_business_data_visible(user_id, 'agenda.edit', assigned_to));
create policy appointments_member_delete on public.appointments
for delete to authenticated using (public.is_business_data_visible(user_id, 'agenda.delete', assigned_to));

create policy products_member_read on public.products
for select to authenticated using (public.is_business_data_visible(user_id, 'products.view', assigned_to));
create policy products_member_insert on public.products
for insert to authenticated with check (
  assigned_to = auth.uid()
  and exists (select 1 from public.businesses business where business.owner_id = products.user_id and public.has_business_permission('products.create', business.id))
);
create policy products_member_update on public.products
for update to authenticated using (public.is_business_data_visible(user_id, 'products.edit', assigned_to))
with check (public.is_business_data_visible(user_id, 'products.edit', assigned_to));
create policy products_member_delete on public.products
for delete to authenticated using (public.is_business_data_visible(user_id, 'products.delete', assigned_to));

create policy crm_stages_member_read on public.crm_stages
for select to authenticated using (public.is_business_data_visible(user_id, 'crm.view'));
create policy crm_tags_member_read on public.crm_tags
for select to authenticated using (public.is_business_data_visible(user_id, 'crm.view'));
create policy crm_contact_metadata_member_read on public.crm_contact_metadata
for select to authenticated using (
  public.is_business_data_visible(user_id, 'crm.view')
  and (public.business_permission_scope('crm.view') = 'all' or owner_id = auth.uid())
);
create policy crm_contact_metadata_member_insert on public.crm_contact_metadata
for insert to authenticated with check (
  public.is_business_data_visible(user_id, 'crm.edit')
  and (public.business_permission_scope('crm.edit') = 'all' or owner_id = auth.uid())
);
create policy crm_contact_metadata_member_update on public.crm_contact_metadata
for update to authenticated using (
  public.is_business_data_visible(user_id, 'crm.edit')
  and (public.business_permission_scope('crm.edit') = 'all' or owner_id = auth.uid())
) with check (
  public.is_business_data_visible(user_id, 'crm.edit')
  and (public.business_permission_scope('crm.edit') = 'all' or owner_id = auth.uid())
);
create policy crm_contact_metadata_member_delete on public.crm_contact_metadata
for delete to authenticated using (
  public.is_business_data_visible(user_id, 'crm.edit')
  and (public.business_permission_scope('crm.edit') = 'all' or owner_id = auth.uid())
);
create policy crm_contact_tags_member_read on public.crm_contact_tags
for select to authenticated using (public.is_business_data_visible(user_id, 'crm.view'));
create policy crm_contact_tags_member_insert on public.crm_contact_tags
for insert to authenticated with check (public.is_business_data_visible(user_id, 'crm.edit'));
create policy crm_contact_tags_member_delete on public.crm_contact_tags
for delete to authenticated using (public.is_business_data_visible(user_id, 'crm.edit'));
create policy crm_activities_member_read on public.crm_activities
for select to authenticated using (public.is_business_data_visible(user_id, 'crm.view'));
create policy crm_activities_member_insert on public.crm_activities
for insert to authenticated with check (public.is_business_data_visible(user_id, 'crm.edit'));
