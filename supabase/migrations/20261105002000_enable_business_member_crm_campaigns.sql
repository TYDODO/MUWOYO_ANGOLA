alter table public.campaigns
  add column if not exists created_by uuid references auth.users(id) on delete set null;

update public.campaigns
set created_by = user_id
where created_by is null;

drop policy if exists instances_member_read on public.instances;
create policy instances_member_read on public.instances
for select to authenticated using (
  public.is_business_data_visible(user_id, 'inbox.view')
  or public.is_business_data_visible(user_id, 'contacts.view')
  or public.is_business_data_visible(user_id, 'crm.view')
  or public.is_business_data_visible(user_id, 'campaigns.view')
);

drop policy if exists whatsapp_contacts_member_read on public.whatsapp_contacts;
create policy whatsapp_contacts_member_read on public.whatsapp_contacts
for select to authenticated using (
  public.is_business_data_visible(user_id, 'contacts.view')
  or public.is_business_data_visible(user_id, 'crm.view')
  or public.is_business_data_visible(user_id, 'campaigns.view')
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

drop policy if exists campaigns_member_read on public.campaigns;
create policy campaigns_member_read on public.campaigns
for select to authenticated using (
  exists (
    select 1 from public.businesses business
    where business.owner_id = campaigns.user_id
      and public.has_business_permission('campaigns.view', business.id)
      and (
        public.business_permission_scope('campaigns.view', business.id) = 'all'
        or campaigns.created_by = auth.uid()
      )
  )
);

drop policy if exists campaigns_member_insert on public.campaigns;
create policy campaigns_member_insert on public.campaigns
for insert to authenticated with check (
  created_by = auth.uid()
  and exists (
    select 1 from public.businesses business
    where business.owner_id = campaigns.user_id
      and public.has_business_permission('campaigns.manage', business.id)
  )
);

drop policy if exists campaigns_member_update on public.campaigns;
create policy campaigns_member_update on public.campaigns
for update to authenticated using (
  exists (
    select 1 from public.businesses business
    where business.owner_id = campaigns.user_id
      and public.has_business_permission('campaigns.manage', business.id)
      and (
        public.business_permission_scope('campaigns.manage', business.id) = 'all'
        or campaigns.created_by = auth.uid()
      )
  )
) with check (
  exists (
    select 1 from public.businesses business
    where business.owner_id = campaigns.user_id
      and public.has_business_permission('campaigns.manage', business.id)
      and (
        public.business_permission_scope('campaigns.manage', business.id) = 'all'
        or campaigns.created_by = auth.uid()
      )
  )
);

drop policy if exists campaigns_member_delete on public.campaigns;
create policy campaigns_member_delete on public.campaigns
for delete to authenticated using (
  exists (
    select 1 from public.businesses business
    where business.owner_id = campaigns.user_id
      and public.has_business_permission('campaigns.manage', business.id)
      and (
        public.business_permission_scope('campaigns.manage', business.id) = 'all'
        or campaigns.created_by = auth.uid()
      )
  )
);

drop policy if exists campaign_contacts_member_read on public.campaign_contacts;
create policy campaign_contacts_member_read on public.campaign_contacts
for select to authenticated using (
  exists (
    select 1
    from public.campaigns campaign
    join public.businesses business on business.owner_id = campaign.user_id
    where campaign.id = campaign_contacts.campaign_id
      and campaign.user_id = campaign_contacts.user_id
      and public.has_business_permission('campaigns.view', business.id)
      and (
        public.business_permission_scope('campaigns.view', business.id) = 'all'
        or campaign.created_by = auth.uid()
      )
  )
);

drop policy if exists campaign_contacts_member_insert on public.campaign_contacts;
create policy campaign_contacts_member_insert on public.campaign_contacts
for insert to authenticated with check (
  exists (
    select 1
    from public.campaigns campaign
    join public.businesses business on business.owner_id = campaign.user_id
    join public.whatsapp_contacts contact
      on contact.id = campaign_contacts.contact_id
     and contact.user_id = campaign.user_id
    where campaign.id = campaign_contacts.campaign_id
      and campaign.user_id = campaign_contacts.user_id
      and public.has_business_permission('campaigns.manage', business.id)
      and (
        public.business_permission_scope('campaigns.manage', business.id) = 'all'
        or campaign.created_by = auth.uid()
      )
  )
);

drop policy if exists campaign_contacts_member_delete on public.campaign_contacts;
create policy campaign_contacts_member_delete on public.campaign_contacts
for delete to authenticated using (
  exists (
    select 1
    from public.campaigns campaign
    join public.businesses business on business.owner_id = campaign.user_id
    where campaign.id = campaign_contacts.campaign_id
      and campaign.user_id = campaign_contacts.user_id
      and public.has_business_permission('campaigns.manage', business.id)
      and (
        public.business_permission_scope('campaigns.manage', business.id) = 'all'
        or campaign.created_by = auth.uid()
      )
  )
);

create or replace function public.get_business_plan_name()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_plan_name text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  select business.owner_id into v_owner_id
  from public.businesses business
  join public.business_members member on member.business_id = business.id
  where member.user_id = auth.uid()
    and member.status = 'active'
  limit 1;

  select coalesce(plan.name, 'Muwoyo Start') into v_plan_name
  from public.profiles profile
  left join public.subscription_plans plan on plan.id = profile.plan_id
  where profile.user_id = coalesce(v_owner_id, auth.uid());

  return coalesce(v_plan_name, 'Muwoyo Start');
end;
$$;

revoke all on function public.get_business_plan_name() from public, anon;
grant execute on function public.get_business_plan_name() to authenticated;

notify pgrst, 'reload schema';
