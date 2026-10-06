alter table public.messages
  add column if not exists read_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists failure_reason text,
  add column if not exists failure_details jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table public.inbox_conversations
  add column if not exists last_read_message_id uuid,
  add column if not exists last_read_at timestamptz;

alter table public.messages drop constraint if exists messages_delivery_status_check;
alter table public.messages
  add constraint messages_delivery_status_check
  check (delivery_status in ('pending', 'received', 'sent', 'delivered', 'read', 'failed'));

create or replace function public.enforce_monotonic_message_read_state()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_rank integer := 0;
  new_rank integer := 0;
begin
  if tg_op = 'UPDATE' then
    old_rank := case old.delivery_status
      when 'received' then 1 when 'sent' then 2 when 'delivered' then 3 when 'read' then 4 else 0 end;
    new_rank := case new.delivery_status
      when 'received' then 1 when 'sent' then 2 when 'delivered' then 3 when 'read' then 4 else 0 end;

    if old.read_at is not null or old.delivery_status = 'read' then
      new.delivery_status := 'read';
      new.read_at := coalesce(old.read_at, new.read_at, now());
    elsif old.delivery_status = 'failed' and new.delivery_status in ('pending', 'received', 'sent') then
      new.delivery_status := old.delivery_status;
    elsif new_rank < old_rank or (new.delivery_status = 'failed' and old_rank >= 2) then
      new.delivery_status := old.delivery_status;
    end if;

    new.sent_at := coalesce(old.sent_at, new.sent_at);
    new.delivered_at := coalesce(old.delivered_at, new.delivered_at);
    new.read_at := coalesce(old.read_at, new.read_at);
    new.failed_at := coalesce(old.failed_at, new.failed_at);
  end if;

  if new.delivery_status = 'sent' then new.sent_at := coalesce(new.sent_at, now()); end if;
  if new.delivery_status = 'delivered' then new.delivered_at := coalesce(new.delivered_at, now()); end if;
  if new.delivery_status = 'read' then new.read_at := coalesce(new.read_at, now()); end if;
  if new.delivery_status = 'failed' then new.failed_at := coalesce(new.failed_at, now()); end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_enforce_monotonic_message_read_state on public.messages;
create trigger trg_enforce_monotonic_message_read_state
  before insert or update of delivery_status, read_at, sent_at, delivered_at, failed_at
  on public.messages
  for each row execute function public.enforce_monotonic_message_read_state();

create or replace function public.sync_message_to_inbox()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
  unread_delta integer := 0;
  was_unread boolean := false;
  is_unread boolean := false;
begin
  if new.whatsapp_instance_id is null then return new; end if;

  select contact.id into v_contact_id
  from public.whatsapp_contacts as contact
  where contact.user_id = new.user_id
    and contact.instance_name = new.whatsapp_instance_id
    and contact.phone_number = new.phone_number
  limit 1;
  if v_contact_id is null then return new; end if;

  is_unread := new.direction = 'inbound'
    and not coalesce(new.is_historical, false)
    and new.delivery_status <> 'read'
    and new.read_at is null;

  if tg_op = 'INSERT' then
    unread_delta := case when is_unread then 1 else 0 end;
    insert into public.inbox_conversations(
      user_id, contact_id, instance_name, last_message_at, unread_count
    ) values (
      new.user_id, v_contact_id, new.whatsapp_instance_id, new.created_at, unread_delta
    ) on conflict (user_id, instance_name, contact_id) do update
      set last_message_at = greatest(public.inbox_conversations.last_message_at, excluded.last_message_at),
          unread_count = greatest(0, public.inbox_conversations.unread_count + unread_delta);
    return new;
  end if;

  was_unread := old.direction = 'inbound'
    and not coalesce(old.is_historical, false)
    and old.delivery_status <> 'read'
    and old.read_at is null;
  unread_delta := (case when is_unread then 1 else 0 end)
    - (case when was_unread then 1 else 0 end);

  if unread_delta <> 0 then
    update public.inbox_conversations
    set unread_count = greatest(0, unread_count + unread_delta)
    where user_id = new.user_id and instance_name = new.whatsapp_instance_id and inbox_conversations.contact_id = v_contact_id;
  end if;

  if new.direction = 'inbound' and new.delivery_status = 'read' and new.read_at is not null then
    update public.inbox_conversations
    set last_read_message_id = new.id,
      last_read_at = new.read_at
    where user_id = new.user_id
      and instance_name = new.whatsapp_instance_id
      and inbox_conversations.contact_id = v_contact_id
      and (last_read_at is null or last_read_at <= new.read_at);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_message_inbox on public.messages;
create trigger trg_sync_message_inbox
  after insert or update of delivery_status, read_at on public.messages
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
    and not coalesce(message.is_historical, false)
    and message.delivery_status <> 'read'
    and message.read_at is null
);

create or replace function public.mark_inbox_messages_read(p_message_ids uuid[])
returns table (
  user_id uuid,
  whatsapp_instance_id text,
  phone_number text,
  external_id text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;

  return query
  update public.messages as message
  set delivery_status = 'read', read_at = coalesce(message.read_at, now())
  where message.id = any(coalesce(p_message_ids, '{}'::uuid[]))
    and message.direction = 'inbound'
    and (message.delivery_status <> 'read' or message.read_at is null)
    and (
      message.user_id = auth.uid()
      or exists (
        select 1
        from public.businesses as business
        join public.business_members as member
          on member.business_id = business.id
         and member.user_id = auth.uid()
         and member.status = 'active'
        join public.whatsapp_contacts as contact
          on contact.user_id = business.owner_id
         and contact.instance_name = message.whatsapp_instance_id
         and contact.phone_number = message.phone_number
        join public.inbox_conversations as conversation
          on conversation.user_id = business.owner_id
         and conversation.contact_id = contact.id
         and conversation.instance_name = message.whatsapp_instance_id
        where business.owner_id = message.user_id
          and public.has_business_permission('inbox.view', business.id)
          and (
            member.role = 'owner'
            or conversation.assigned_to = auth.uid()
            or (conversation.assigned_to is null and public.has_business_permission('inbox.view_unassigned', business.id))
          )
      )
    )
  returning message.user_id, message.whatsapp_instance_id, message.phone_number, message.external_id;
end;
$$;

revoke all on function public.mark_inbox_messages_read(uuid[]) from public, anon;
grant execute on function public.mark_inbox_messages_read(uuid[]) to authenticated;