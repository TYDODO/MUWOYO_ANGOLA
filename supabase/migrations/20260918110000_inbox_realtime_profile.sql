alter table public.whatsapp_contacts
  add column if not exists profile_picture_url text;

alter table public.messages
  add column if not exists delivery_status text not null default 'sent'
    check (delivery_status in ('pending', 'sent', 'delivered', 'read', 'failed')),
  add column if not exists read_at timestamptz;

create index if not exists messages_external_id_idx
  on public.messages(user_id, external_id)
  where external_id is not null;

alter table public.messages replica identity full;
alter table public.inbox_conversations replica identity full;
alter table public.whatsapp_contacts replica identity full;