-- Message lifecycle, reactions and instance-safe idempotency for the existing Inbox.
alter table public.messages
  add column if not exists edited boolean not null default false,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_for_everyone boolean not null default false,
  add column if not exists from_me boolean not null default false,
  add column if not exists sent_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_at timestamptz;

update public.messages
set from_me = direction = 'outbound'
where from_me is distinct from (direction = 'outbound');

create unique index if not exists messages_instance_external_unique
  on public.messages(user_id, whatsapp_instance_id, external_id)
  where external_id is not null;

create index if not exists messages_phone_instance_created_idx
  on public.messages(user_id, whatsapp_instance_id, phone_number, created_at desc);

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  emoji text not null,
  reaction_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, message_id)
);

alter table public.message_reactions enable row level security;

create policy message_reactions_user_policy on public.message_reactions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists message_reactions_message_idx
  on public.message_reactions(user_id, message_id);

create or replace function public.sync_contact_to_inbox()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  should_increment boolean := false;
begin
  if tg_op = 'INSERT' then
    should_increment := exists(
      select 1 from public.messages m
      where m.user_id = new.user_id
        and m.whatsapp_instance_id = new.instance_name
        and m.phone_number = new.phone_number
        and m.direction = 'inbound'
      order by m.created_at desc
      limit 1
    );
  elsif new.last_message_at is distinct from old.last_message_at then
    should_increment := exists(
      select 1 from public.messages m
      where m.user_id = new.user_id
        and m.whatsapp_instance_id = new.instance_name
        and m.phone_number = new.phone_number
        and m.direction = 'inbound'
        and m.created_at >= new.last_message_at - interval '1 second'
      order by m.created_at desc
      limit 1
    );
  end if;

  insert into public.inbox_conversations(user_id, contact_id, instance_name, last_message_at, unread_count)
  values(new.user_id, new.id, new.instance_name, new.last_message_at, case when should_increment then 1 else 0 end)
  on conflict (user_id, instance_name, contact_id) do update set
    last_message_at = excluded.last_message_at,
    unread_count = public.inbox_conversations.unread_count + case when should_increment then 1 else 0 end;
  return new;
end;
$$;

alter table public.message_reactions replica identity full;
