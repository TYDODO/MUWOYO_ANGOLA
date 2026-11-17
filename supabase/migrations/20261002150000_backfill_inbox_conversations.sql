with contact_stats as (
  select
    contact.user_id,
    contact.id as contact_id,
    contact.instance_name,
    contact.last_message_at,
    coalesce(max(message.created_at), contact.last_message_at) as latest_message_at,
    count(message.id) filter (
      where message.direction = 'inbound'
        and not coalesce(message.is_historical, false)
        and message.delivery_status <> 'read'
        and message.read_at is null
    )::integer as unread_count
  from public.whatsapp_contacts as contact
  left join public.messages as message
    on message.user_id = contact.user_id
   and message.whatsapp_instance_id = contact.instance_name
   and message.phone_number = contact.phone_number
  where contact.instance_name is not null
    and not coalesce(contact.is_group, false)
  group by contact.user_id, contact.id, contact.instance_name, contact.last_message_at
)
insert into public.inbox_conversations(
  user_id, contact_id, instance_name, last_message_at, unread_count
)
select
  user_id,
  contact_id,
  instance_name,
  latest_message_at,
  unread_count
from contact_stats
on conflict (user_id, instance_name, contact_id) do nothing;

update public.inbox_conversations as conversation
set
  last_message_at = greatest(
    conversation.last_message_at,
    (
      select max(message.created_at)
      from public.messages as message
      join public.whatsapp_contacts as contact
        on contact.user_id = message.user_id
       and contact.instance_name = message.whatsapp_instance_id
       and contact.phone_number = message.phone_number
      where contact.id = conversation.contact_id
        and message.user_id = conversation.user_id
        and message.whatsapp_instance_id = conversation.instance_name
    )
  ),
  unread_count = (
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
      and not coalesce(message.is_historical, false)
      and message.delivery_status <> 'read'
      and message.read_at is null
  );