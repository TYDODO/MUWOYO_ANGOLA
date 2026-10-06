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
  add column if not exists failed_at timestamptz;

alter table public.whatsapp_contacts
  add column if not exists custom_name text;

with ranked_messages as (
  select id,
         row_number() over (
           partition by user_id, whatsapp_instance_id, external_id
           order by created_at, id
         ) as duplicate_rank
  from public.messages
  where external_id is not null
    and whatsapp_instance_id is not null
)
delete from public.messages as message
using ranked_messages as duplicate
where message.id = duplicate.id
  and duplicate.duplicate_rank > 1;

create unique index if not exists messages_instance_external_id_unique
  on public.messages(user_id, whatsapp_instance_id, external_id);

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
drop policy if exists message_reactions_business_select on public.message_reactions;
create policy message_reactions_business_select
  on public.message_reactions for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.business_members as member
      join public.business_members as owner
        on owner.business_id = member.business_id
      where member.user_id = auth.uid()
        and member.status = 'active'
        and owner.user_id = message_reactions.user_id
        and owner.role = 'owner'
        and owner.status = 'active'
    )
  );

drop trigger if exists trg_sync_contact_inbox on public.whatsapp_contacts;

create or replace function public.sync_contact_to_inbox()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.instance_name is null or new.last_message_at is null then
    return new;
  end if;

  insert into public.inbox_conversations(
    user_id, contact_id, instance_name, last_message_at, unread_count
  ) values (
    new.user_id, new.id, new.instance_name, new.last_message_at, 0
  )
  on conflict (user_id, instance_name, contact_id) do update
    set last_message_at = greatest(
      public.inbox_conversations.last_message_at,
      excluded.last_message_at
    );

  return new;
end;
$$;

create trigger trg_sync_contact_inbox
  after insert or update of last_message_at on public.whatsapp_contacts
  for each row
  when (new.last_message_at is not null)
  execute function public.sync_contact_to_inbox();

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

  select contact.id into contact_id
  from public.whatsapp_contacts as contact
  where contact.user_id = new.user_id
    and contact.instance_name = new.whatsapp_instance_id
    and contact.phone_number = new.phone_number
  limit 1;

  if contact_id is null then
    return new;
  end if;

  if new.direction = 'inbound' and not new.is_historical then
    unread_delta := 1;
  end if;

  insert into public.inbox_conversations(
    user_id, contact_id, instance_name, last_message_at, unread_count
  ) values (
    new.user_id, contact_id, new.whatsapp_instance_id, new.created_at, unread_delta
  )
  on conflict (user_id, instance_name, contact_id) do update
    set last_message_at = greatest(
          public.inbox_conversations.last_message_at,
          excluded.last_message_at
        ),
        unread_count = public.inbox_conversations.unread_count + unread_delta;

  return new;
end;
$$;

drop trigger if exists trg_sync_message_inbox on public.messages;
create trigger trg_sync_message_inbox
  after insert on public.messages
  for each row execute function public.sync_message_to_inbox();

create or replace function public.cancel_follow_up_after_inbound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'inbound' and not new.is_historical then
    update public.follow_up_jobs as job
    set status = 'cancelled'
    where job.user_id = new.user_id
      and job.status = 'pending'
      and exists (
        select 1
        from public.whatsapp_contacts as contact
        where contact.id = job.contact_id
          and contact.user_id = new.user_id
          and contact.instance_name = new.whatsapp_instance_id
          and contact.phone_number = new.phone_number
      );
  end if;
  return new;
end;
$$;

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
  select contact.id into contact_id
  from public.whatsapp_contacts as contact
  where contact.user_id = new.user_id
    and contact.instance_name = new.whatsapp_instance_id
    and contact.phone_number = new.phone_number
  limit 1;

  if contact_id is null then
    return new;
  end if;

  activity_type := case
    when new.direction = 'inbound' then 'message_received'
    else 'message_sent'
  end;

  insert into public.crm_activities(
    user_id, contact_id, activity_type, description, metadata
  ) values (
    new.user_id, contact_id, activity_type, 'Mensagem registrada',
    jsonb_build_object('message_id', new.id)
  );

  return new;
end;
$$;