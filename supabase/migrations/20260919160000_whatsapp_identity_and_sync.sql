-- Establishes a durable WhatsApp identity without deleting legacy data.
alter table public.whatsapp_contacts
  add column if not exists whatsapp_instance_id uuid references public.instances(id) on delete set null,
  add column if not exists canonical_remote_jid text,
  add column if not exists identity_type text not null default 'phone',
  add column if not exists identity_status text not null default 'resolved';

alter table public.whatsapp_contacts alter column phone_number drop not null;

alter table public.inbox_conversations
  add column if not exists whatsapp_instance_id uuid references public.instances(id) on delete set null,
  add column if not exists conversation_key text;

alter table public.messages
  add column if not exists whatsapp_instance_uuid uuid references public.instances(id) on delete set null,
  add column if not exists conversation_id uuid references public.inbox_conversations(id) on delete set null,
  add column if not exists sender_type text not null default 'customer',
  add column if not exists sender_user_id uuid references auth.users(id) on delete set null,
  add column if not exists message_timestamp timestamptz,
  add column if not exists remote_jid text,
  add column if not exists identity_type text,
  add column if not exists sync_source text;

update public.whatsapp_contacts c
set whatsapp_instance_id = i.id
from public.instances i
where c.whatsapp_instance_id is null
  and c.user_id = i.user_id
  and c.instance_name = i.instance_name;

update public.inbox_conversations c
set whatsapp_instance_id = i.id
from public.instances i
where c.whatsapp_instance_id is null
  and c.user_id = i.user_id
  and c.instance_name = i.instance_name;

update public.messages m
set whatsapp_instance_uuid = i.id
from public.instances i
where m.whatsapp_instance_uuid is null
  and m.user_id = i.user_id
  and m.whatsapp_instance_id = i.instance_name;

update public.messages
set message_timestamp = created_at
where message_timestamp is null;

update public.whatsapp_contacts
set canonical_remote_jid = remote_jid
where canonical_remote_jid is null and remote_jid is not null;

create index if not exists whatsapp_contacts_instance_identity_idx
  on public.whatsapp_contacts(whatsapp_instance_id, canonical_remote_jid);

create unique index if not exists whatsapp_contacts_instance_canonical_unique
  on public.whatsapp_contacts(whatsapp_instance_id, canonical_remote_jid)
  where canonical_remote_jid is not null;

create index if not exists inbox_conversations_instance_key_idx
  on public.inbox_conversations(whatsapp_instance_id, conversation_key);

create index if not exists messages_instance_external_idx
  on public.messages(whatsapp_instance_uuid, external_id)
  where external_id is not null;

create unique index if not exists messages_instance_external_unique
  on public.messages(whatsapp_instance_uuid, external_id)
  where whatsapp_instance_uuid is not null and external_id is not null;

create index if not exists messages_conversation_timestamp_idx
  on public.messages(conversation_id, message_timestamp desc, created_at desc);

create table if not exists public.whatsapp_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  whatsapp_instance_id uuid not null references public.instances(id) on delete cascade,
  sync_type text not null default 'history',
  status text not null default 'pending' check (status in ('pending','running','completed','partial','failed','cancelled')),
  progress integer not null default 0 check (progress between 0 and 100),
  chats_found integer not null default 0,
  contacts_found integer not null default 0,
  messages_found integer not null default 0,
  messages_imported integer not null default 0,
  messages_skipped integer not null default 0,
  errors jsonb not null default '[]'::jsonb,
  last_cursor text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_sync_jobs enable row level security;

create policy whatsapp_sync_jobs_owner_all on public.whatsapp_sync_jobs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep the existing n8n table and its established session convention:
-- session_id = user_id + '_' + phone_number.
