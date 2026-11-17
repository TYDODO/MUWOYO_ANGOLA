create table if not exists private.attendant_assignment_cursor (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  last_attendant_user_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
revoke all on table private.attendant_assignment_cursor from public, anon, authenticated, service_role;

create or replace function public.auto_assign_new_inbox_conversation()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  business_id_value uuid;
  previous_assignee uuid;
  next_assignee uuid;
  assigned_count integer;
  max_attendants integer;
begin
  if new.assigned_to is not null or new.response_mode <> 'ai' then
    return new;
  end if;

  select id into business_id_value
  from public.businesses
  where owner_id = new.user_id;
  if business_id_value is null or not public.has_plan_feature(new.user_id, 'shared_inbox') then
    return new;
  end if;

  select case plan.name
    when 'Muwoyo Growth' then 2
    when 'Muwoyo Big' then 9
    when 'Enterprise' then 2147483647
    else 0
  end into max_attendants
  from public.profiles profile
  left join public.subscription_plans plan on plan.id = profile.plan_id
  where profile.user_id = new.user_id;
  if coalesce(max_attendants, 0) = 0 then
    return new;
  end if;

  perform pg_advisory_xact_lock(0, hashtext(new.user_id::text));
  select last_attendant_user_id into previous_assignee
  from private.attendant_assignment_cursor
  where business_id = business_id_value;

  select count(distinct assigned_to)::integer into assigned_count
  from public.inbox_conversations
  where user_id = new.user_id
    and assigned_to is not null
    and assigned_to <> new.user_id;

  select member.user_id into next_assignee
  from public.business_members member
  join public.business_member_permissions can_view
    on can_view.member_id = member.id
   and can_view.permission = 'inbox.view'
   and can_view.enabled
  join public.business_member_permissions can_send
    on can_send.member_id = member.id
   and can_send.permission = 'inbox.send'
   and can_send.enabled
  where member.business_id = business_id_value
    and member.role = 'attendant'
    and member.status = 'active'
    and (
      coalesce(assigned_count, 0) < max_attendants
      or exists (
        select 1 from public.inbox_conversations existing
        where existing.user_id = new.user_id and existing.assigned_to = member.user_id
      )
    )
  order by case when previous_assignee is null or member.user_id > previous_assignee then 0 else 1 end,
    member.created_at,
    member.user_id
  limit 1;

  if next_assignee is null then
    return new;
  end if;

  new.assigned_to := next_assignee;
  new.response_mode := 'human';
  new.status := 'human';
  insert into private.attendant_assignment_cursor(business_id, last_attendant_user_id, updated_at)
  values (business_id_value, next_assignee, now())
  on conflict (business_id) do update
  set last_attendant_user_id = excluded.last_attendant_user_id,
      updated_at = excluded.updated_at;
  return new;
end;
$$;

drop trigger if exists trg_auto_assign_new_inbox_conversation on public.inbox_conversations;
create trigger trg_auto_assign_new_inbox_conversation
before insert on public.inbox_conversations
for each row execute function public.auto_assign_new_inbox_conversation();

create or replace function public.audit_inbox_conversation_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  business_id_value uuid;
begin
  select id into business_id_value
  from public.businesses
  where owner_id = new.user_id;
  if business_id_value is null then return new; end if;

  if tg_op = 'INSERT' and new.assigned_to is not null then
    insert into public.business_audit_log(business_id, actor_user_id, action, target_user_id, conversation_id, metadata)
    values (business_id_value, new.user_id, 'inbox_auto_assigned', new.assigned_to, new.id, '{"source":"round_robin"}'::jsonb);
  elsif tg_op = 'UPDATE' and old.assigned_to is distinct from new.assigned_to then
    insert into public.business_audit_log(business_id, actor_user_id, action, target_user_id, conversation_id, metadata)
    values (
      business_id_value,
      coalesce(auth.uid(), new.user_id),
      case when new.assigned_to is null then 'inbox_conversation_unassigned' else 'inbox_conversation_assigned' end,
      new.assigned_to,
      new.id,
      '{"source":"manual"}'::jsonb
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_inbox_conversation_assignment on public.inbox_conversations;
create trigger trg_audit_inbox_conversation_assignment
after insert or update of assigned_to on public.inbox_conversations
for each row execute function public.audit_inbox_conversation_assignment();

create or replace function public.audit_inbox_message_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_row record;
begin
  if new.direction <> 'inbound' or coalesce(new.is_historical, false) then
    return new;
  end if;

  select conversation.id, conversation.assigned_to, business.id as business_id
  into conversation_row
  from public.whatsapp_contacts contact
  join public.inbox_conversations conversation
    on conversation.user_id = contact.user_id
   and conversation.contact_id = contact.id
   and conversation.instance_name = contact.instance_name
  join public.businesses business on business.owner_id = conversation.user_id
  where contact.user_id = new.user_id
    and contact.instance_name = new.whatsapp_instance_id
    and contact.phone_number = new.phone_number
  limit 1;

  if conversation_row.id is not null and conversation_row.assigned_to is not null then
    insert into public.business_audit_log(business_id, actor_user_id, action, target_user_id, conversation_id, metadata)
    values (
      conversation_row.business_id,
      conversation_row.assigned_to,
      'inbox_message_assigned',
      conversation_row.assigned_to,
      conversation_row.id,
      jsonb_build_object('message_id', new.id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_audit_inbox_message_assignment on public.messages;
create trigger trg_audit_inbox_message_assignment
after insert on public.messages
for each row execute function public.audit_inbox_message_assignment();

create or replace function public.get_attendant_message_stats(p_business_id uuid)
returns table (
  attendant_user_id uuid,
  assigned_messages bigint,
  answered_messages bigint,
  unanswered_messages bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'owner_required';
  end if;

  return query
  with inbound as (
    select
      entry.target_user_id,
      entry.conversation_id,
      entry.created_at,
      lead(entry.created_at) over (
        partition by entry.target_user_id, entry.conversation_id
        order by entry.created_at, entry.id
      ) as next_inbound_at
    from public.business_audit_log entry
    where entry.business_id = p_business_id
      and entry.action = 'inbox_message_assigned'
      and entry.target_user_id is not null
      and entry.conversation_id is not null
  ),
  answered as (
    select
      message.target_user_id,
      exists (
        select 1
        from public.business_audit_log response
        where response.business_id = p_business_id
          and response.action = 'inbox_message_sent'
          and response.target_user_id = message.target_user_id
          and response.conversation_id = message.conversation_id
          and response.created_at >= message.created_at
          and (message.next_inbound_at is null or response.created_at < message.next_inbound_at)
      ) as was_answered
    from inbound message
  )
  select
    answered.target_user_id,
    count(*)::bigint,
    count(*) filter (where answered.was_answered)::bigint,
    count(*) filter (where not answered.was_answered)::bigint
  from answered
  group by answered.target_user_id;
end;
$$;
revoke all on function public.get_attendant_message_stats(uuid) from public, anon;
grant execute on function public.get_attendant_message_stats(uuid) to authenticated;

create table if not exists public.business_member_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  is_online boolean not null default false,
  last_seen_at timestamptz not null default now()
);
create index if not exists business_member_presence_business_seen_idx
  on public.business_member_presence(business_id, last_seen_at desc);
alter table public.business_member_presence enable row level security;
grant select, insert, update on public.business_member_presence to authenticated;

create policy business_member_presence_read on public.business_member_presence
for select to authenticated using (
  business_id = public.current_business_id()
  and (user_id = auth.uid() or public.is_business_owner(business_id))
);
create policy business_member_presence_self_insert on public.business_member_presence
for insert to authenticated with check (
  user_id = auth.uid()
  and business_id = public.current_business_id()
  and exists (
    select 1 from public.business_members member
    where member.user_id = auth.uid()
      and member.business_id = business_member_presence.business_id
      and member.role = 'attendant'
      and member.status = 'active'
  )
);
create policy business_member_presence_self_update on public.business_member_presence
for update to authenticated using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and business_id = public.current_business_id()
);
