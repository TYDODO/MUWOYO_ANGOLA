update public.messages
set direction = 'outbound', from_me = true
where from_me is true and direction is distinct from 'outbound';

update public.messages
set from_me = true
where direction = 'outbound' and from_me is distinct from true;

create or replace function public.sync_message_to_inbox()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_instance_name text;
  v_phone_number text;
  v_contact_id uuid;
  v_unread_delta integer := 0;
  v_was_unread boolean := false;
  v_is_unread boolean := false;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
    v_instance_name := old.whatsapp_instance_id;
    v_phone_number := old.phone_number;
    v_was_unread := old.direction = 'inbound'
      and not coalesce(old.from_me, false)
      and not coalesce(old.is_historical, false)
      and old.delivery_status is distinct from 'read'
      and old.read_at is null;
    v_unread_delta := case when v_was_unread then -1 else 0 end;
  else
    v_user_id := new.user_id;
    v_instance_name := new.whatsapp_instance_id;
    v_phone_number := new.phone_number;
    v_is_unread := new.direction = 'inbound'
      and not coalesce(new.from_me, false)
      and not coalesce(new.is_historical, false)
      and new.delivery_status is distinct from 'read'
      and new.read_at is null;

    if tg_op = 'INSERT' then
      v_unread_delta := case when v_is_unread then 1 else 0 end;
    else
      v_was_unread := old.direction = 'inbound'
        and not coalesce(old.from_me, false)
        and not coalesce(old.is_historical, false)
        and old.delivery_status is distinct from 'read'
        and old.read_at is null;
      v_unread_delta := (case when v_is_unread then 1 else 0 end)
        - (case when v_was_unread then 1 else 0 end);
    end if;
  end if;

  if v_instance_name is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select contact.id into v_contact_id
  from public.whatsapp_contacts as contact
  where contact.user_id = v_user_id
    and contact.instance_name = v_instance_name
    and contact.phone_number = v_phone_number
  limit 1;
  if v_contact_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.inbox_conversations(
      user_id, contact_id, instance_name, last_message_at, unread_count
    ) values (
      v_user_id, v_contact_id, v_instance_name, new.created_at, greatest(0, v_unread_delta)
    ) on conflict (user_id, instance_name, contact_id) do update
      set last_message_at = greatest(public.inbox_conversations.last_message_at, excluded.last_message_at),
          unread_count = greatest(0, public.inbox_conversations.unread_count + v_unread_delta);
  elsif v_unread_delta <> 0 then
    update public.inbox_conversations
    set unread_count = greatest(0, unread_count + v_unread_delta)
    where user_id = v_user_id
      and instance_name = v_instance_name
      and contact_id = v_contact_id;
  end if;

  if tg_op <> 'DELETE' and new.direction = 'inbound'
    and new.delivery_status = 'read' and new.read_at is not null then
    update public.inbox_conversations
    set last_read_message_id = new.id,
        last_read_at = new.read_at
    where user_id = v_user_id
      and instance_name = v_instance_name
      and contact_id = v_contact_id
      and (last_read_at is null or last_read_at <= new.read_at);
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_message_inbox on public.messages;
create trigger trg_sync_message_inbox
  after insert or delete or update of direction, from_me, is_historical, delivery_status, read_at
  on public.messages
  for each row execute function public.sync_message_to_inbox();

update public.inbox_conversations as conversation
set unread_count = (
  select count(*)::integer
  from public.messages as message
  join public.whatsapp_contacts as contact
    on contact.user_id = message.user_id
   and contact.instance_name = message.whatsapp_instance_id
   and contact.phone_number = message.phone_number
  where contact.id = conversation.contact_id
    and message.user_id = conversation.user_id
    and message.whatsapp_instance_id = conversation.instance_name
    and message.direction = 'inbound'
    and not coalesce(message.from_me, false)
    and not coalesce(message.is_historical, false)
    and message.delivery_status is distinct from 'read'
    and message.read_at is null
);

create or replace function public.mark_inbox_conversation_read(p_conversation_id uuid)
returns table (
  message_id uuid,
  user_id uuid,
  whatsapp_instance_id text,
  phone_number text,
  external_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_instance_name text;
  v_phone_number text;
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  select conversation.user_id, conversation.instance_name, contact.phone_number
    into v_owner_id, v_instance_name, v_phone_number
  from public.inbox_conversations as conversation
  join public.whatsapp_contacts as contact
    on contact.id = conversation.contact_id
   and contact.user_id = conversation.user_id
   and contact.instance_name = conversation.instance_name
  where conversation.id = p_conversation_id
    and (
      conversation.user_id = auth.uid()
      or exists (
        select 1
        from public.businesses as business
        join public.business_members as member
          on member.business_id = business.id
         and member.user_id = auth.uid()
         and member.status = 'active'
        where business.owner_id = conversation.user_id
          and public.has_business_permission('inbox.view', business.id)
          and (
            member.role = 'owner'
            or conversation.assigned_to = auth.uid()
            or (
              conversation.assigned_to is null
              and public.has_business_permission('inbox.view_unassigned', business.id)
            )
          )
      )
    )
  for update of conversation;

  if v_owner_id is null then raise exception 'conversation_not_accessible'; end if;

  return query
  update public.messages as message
  set delivery_status = 'read',
      read_at = coalesce(message.read_at, now())
  where message.user_id = v_owner_id
    and message.whatsapp_instance_id = v_instance_name
    and message.phone_number = v_phone_number
    and message.direction = 'inbound'
    and not coalesce(message.from_me, false)
    and not coalesce(message.is_historical, false)
    and (message.delivery_status is distinct from 'read' or message.read_at is null)
  returning message.id, message.user_id, message.whatsapp_instance_id, message.phone_number, message.external_id;

  update public.inbox_conversations
  set unread_count = 0
  where id = p_conversation_id
    and user_id = v_owner_id;
end;
$$;

revoke all on function public.mark_inbox_conversation_read(uuid) from public, anon;
grant execute on function public.mark_inbox_conversation_read(uuid) to authenticated;
