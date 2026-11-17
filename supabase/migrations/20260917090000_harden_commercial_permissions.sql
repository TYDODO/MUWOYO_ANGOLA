-- Harden commercial features without duplicating the existing contact/message tables.
create or replace function public.has_plan_feature(p_user_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.subscription_plans sp on sp.id = p.plan_id
    where p.user_id = p_user_id
      and (
        sp.name = 'Enterprise'
        or (p_feature = 'campaigns' and sp.name in ('Muwoyo Growth', 'Muwoyo Big'))
        or (p_feature = 'follow_up' and sp.name in ('Muwoyo Growth', 'Muwoyo Big'))
        or (p_feature = 'shared_inbox' and sp.name in ('Muwoyo Growth', 'Muwoyo Big'))
        or (sp.features ? p_feature)
      )
      and (
        p.account_status = 'active'
        and coalesce(p.subscription_expires_at, now()) > now()
        or p.account_status = 'trial'
        and coalesce(p.trial_expires_at, now()) > now()
          and p_feature in ('crm', 'inbox')
      )
  );
$$;

create or replace function public.enforce_inbox_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_count integer;
  max_users integer;
begin
  if new.assigned_to is null then
    return new;
  end if;

  if new.assigned_to <> new.user_id then
    if not public.has_plan_feature(new.user_id, 'shared_inbox') then
      raise exception 'shared_inbox_not_available_for_plan';
    end if;

    select case sp.name
      when 'Muwoyo Growth' then 3
      when 'Muwoyo Big' then 10
      when 'Enterprise' then 2147483647
      else 1
    end
    into max_users
    from public.profiles p
    left join public.subscription_plans sp on sp.id = p.plan_id
    where p.user_id = new.user_id;

    select count(distinct assigned_to)::integer
    into assigned_count
    from public.inbox_conversations
    where user_id = new.user_id
      and assigned_to is not null
      and assigned_to <> new.assigned_to;

    if coalesce(assigned_count, 0) >= coalesce(max_users, 1) - 1 then
      raise exception 'shared_inbox_user_limit_reached:%', coalesce(max_users, 1);
    end if;

    if not exists (
      select 1 from public.profiles
      where user_id = new.assigned_to
    ) then
      raise exception 'assigned_user_must_belong_to_business';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_inbox_assignment on public.inbox_conversations;
create trigger trg_enforce_inbox_assignment
before insert or update of assigned_to on public.inbox_conversations
for each row execute function public.enforce_inbox_assignment();

create or replace function public.ensure_crm_contact_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_stage uuid;
begin
  select id into default_stage
  from public.crm_stages
  where user_id = new.user_id and name = 'Novo'
  order by position
  limit 1;

  insert into public.crm_contact_metadata(contact_id, user_id, stage_id)
  values (new.id, new.user_id, default_stage)
  on conflict (contact_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_ensure_crm_contact_defaults on public.whatsapp_contacts;
create trigger trg_ensure_crm_contact_defaults
after insert on public.whatsapp_contacts
for each row execute function public.ensure_crm_contact_defaults();

create or replace function public.record_message_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  contact_id uuid;
  activity_type text;
begin
  select id into contact_id
  from public.whatsapp_contacts
  where user_id = new.user_id and phone_number = new.phone_number
  limit 1;

  if contact_id is null then
    return new;
  end if;

  activity_type := case when new.direction = 'inbound' then 'message_received' else 'message_sent' end;
  insert into public.crm_activities(user_id, contact_id, activity_type, description, metadata)
  values (new.user_id, contact_id, activity_type, 'Mensagem registrada', jsonb_build_object('message_id', new.id));

  return new;
end;
$$;

drop trigger if exists trg_record_message_activity on public.messages;
create trigger trg_record_message_activity
after insert on public.messages
for each row execute function public.record_message_activity();

create or replace function public.user_can_use_commercial_feature(p_feature text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.has_plan_feature(auth.uid(), p_feature);
$$;

revoke all on function public.has_plan_feature(uuid, text) from public;
grant execute on function public.has_plan_feature(uuid, text) to authenticated;
revoke all on function public.user_can_use_commercial_feature(text) from public;
grant execute on function public.user_can_use_commercial_feature(text) to authenticated;
