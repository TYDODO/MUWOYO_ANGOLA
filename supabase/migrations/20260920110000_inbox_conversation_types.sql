alter table public.inbox_conversations
  add column if not exists conversation_type text not null default 'individual'
  check (conversation_type in ('individual', 'group'));

update public.inbox_conversations conversation
set conversation_type = 'group'
from public.whatsapp_contacts contact
where contact.id = conversation.contact_id
  and contact.is_group = true;

create index if not exists inbox_individual_conversations_idx
  on public.inbox_conversations(user_id, whatsapp_instance_id, last_message_at desc)
  where conversation_type = 'individual';
