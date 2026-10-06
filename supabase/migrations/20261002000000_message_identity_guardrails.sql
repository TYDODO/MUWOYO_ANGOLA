alter table public.messages
  add column if not exists from_me boolean not null default false,
  add column if not exists is_historical boolean not null default false,
  add column if not exists caption text,
  add column if not exists file_size_bytes bigint,
  add column if not exists media_width integer,
  add column if not exists media_height integer,
  add column if not exists thumbnail_url text,
  add column if not exists edited boolean not null default false,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists is_favorite boolean not null default false,
  add column if not exists sent_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists failed_at timestamptz;

create unique index if not exists messages_instance_external_id_unique
  on public.messages(user_id, whatsapp_instance_id, external_id)
  where whatsapp_instance_id is not null and external_id is not null;

create index if not exists messages_instance_phone_delivery_idx
  on public.messages(user_id, whatsapp_instance_id, phone_number, delivery_status, created_at desc);

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  whatsapp_instance_id text not null,
  message_id uuid not null references public.messages(id) on delete cascade,
  emoji text not null,
  user_phone text not null default '',
  created_at timestamptz not null default now(),
  unique(user_id, whatsapp_instance_id, message_id, user_phone)
);

alter table public.message_reactions enable row level security;

create or replace function public.normalize_message_delivery_status(raw_status text)
returns text
language sql
security definer
set search_path = public
as $$
  select lower(coalesce(raw_status, ''));
$$;

drop trigger if exists trg_sync_message_inbox on public.messages;

create or replace function public.sync_message_to_inbox()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  contact_id uuid;
  unread_delta integer := 0;
begin
  if new.whatsapp_instance_id is null then
    return new;
  end if;

  select c.id into contact_id
  from public.whatsapp_contacts as c
  where c.user_id = new.user_id
    and c.instance_name = new.whatsapp_instance_id
    and c.phone_number = new.phone_number
  limit 1;

  if contact_id is null then
    return new;
  end if;

  if new.direction = 'inbound' and not coalesce(new.is_historical, false) then
    unread_delta := 1;
  end if;

  insert into public.inbox_conversations(
    user_id, contact_id, instance_name, last_message_at, unread_count
  ) values (
    new.user_id, contact_id, new.whatsapp_instance_id, new.created_at, unread_delta
  ) on conflict (user_id, instance_name, contact_id) do update
    set last_message_at = greatest(public.inbox_conversations.last_message_at, excluded.last_message_at),
        unread_count = public.inbox_conversations.unread_count + unread_delta;

  return new;
end;
$$;

create trigger trg_sync_message_inbox
  after insert on public.messages
  for each row
  execute function public.sync_message_to_inbox();
