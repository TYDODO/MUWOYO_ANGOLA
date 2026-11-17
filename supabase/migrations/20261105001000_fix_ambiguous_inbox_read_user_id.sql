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

  update public.inbox_conversations as conversation
  set unread_count = 0
  where conversation.id = p_conversation_id
    and conversation.user_id = v_owner_id;
end;
$$;

revoke all on function public.mark_inbox_conversation_read(uuid) from public, anon;
grant execute on function public.mark_inbox_conversation_read(uuid) to authenticated;

notify pgrst, 'reload schema';
