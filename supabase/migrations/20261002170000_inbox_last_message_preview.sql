alter table public.inbox_conversations
  add column if not exists last_message_preview text,
  add column if not exists last_message_direction text,
  add column if not exists last_message_kind text;

create or replace function public.sync_inbox_last_message_preview()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
  v_preview text;
begin
  if new.whatsapp_instance_id is null then return new; end if;

  select contact.id into v_contact_id
  from public.whatsapp_contacts as contact
  where contact.user_id = new.user_id
    and contact.instance_name = new.whatsapp_instance_id
    and contact.phone_number = new.phone_number
  limit 1;
  if v_contact_id is null then return new; end if;

  v_preview := coalesce(
    nullif(btrim(new.message_text), ''),
    case new.kind
      when 'image' then 'Imagem'
      when 'audio' then 'Áudio'
      when 'video' then 'Vídeo'
      when 'document' then 'Documento'
      when 'sticker' then 'Sticker'
      when 'location' then 'Localização'
      when 'contact' then 'Contacto'
      else 'Mensagem'
    end
  );

  update public.inbox_conversations as conversation
  set last_message_preview = left(v_preview, 180),
      last_message_direction = new.direction,
      last_message_kind = new.kind
  where conversation.user_id = new.user_id
    and conversation.instance_name = new.whatsapp_instance_id
    and conversation.contact_id = v_contact_id
    and (conversation.last_message_at is null or conversation.last_message_at <= new.created_at);

  return new;
end;
$$;

drop trigger if exists trg_sync_inbox_last_message_preview on public.messages;
create trigger trg_sync_inbox_last_message_preview
  after insert on public.messages
  for each row execute function public.sync_inbox_last_message_preview();

with latest_messages as (
  select distinct on (message.user_id, message.whatsapp_instance_id, message.phone_number)
    message.user_id,
    message.whatsapp_instance_id,
    message.phone_number,
    message.message_text,
    message.kind,
    message.direction,
    message.created_at
  from public.messages as message
  where message.whatsapp_instance_id is not null
  order by message.user_id, message.whatsapp_instance_id, message.phone_number, message.created_at desc, message.id desc
)
update public.inbox_conversations as conversation
set last_message_preview = left(coalesce(
      nullif(btrim(latest.message_text), ''),
      case latest.kind
        when 'image' then 'Imagem'
        when 'audio' then 'Áudio'
        when 'video' then 'Vídeo'
        when 'document' then 'Documento'
        when 'sticker' then 'Sticker'
        when 'location' then 'Localização'
        when 'contact' then 'Contacto'
        else 'Mensagem'
      end
    ), 180),
    last_message_direction = latest.direction,
    last_message_kind = latest.kind
from latest_messages as latest
join public.whatsapp_contacts as contact
  on contact.user_id = latest.user_id
 and contact.instance_name = latest.whatsapp_instance_id
 and contact.phone_number = latest.phone_number
where conversation.user_id = latest.user_id
  and conversation.instance_name = latest.whatsapp_instance_id
  and conversation.contact_id = contact.id;