-- Each connected WhatsApp number owns an isolated contact/conversation namespace.
alter table public.instances drop constraint if exists instances_user_id_key;
create unique index if not exists instances_user_instance_unique on public.instances(user_id, instance_name);

alter table public.whatsapp_contacts add column if not exists remote_jid text;
alter table public.whatsapp_contacts add column if not exists is_group boolean not null default false;
alter table public.whatsapp_contacts add column if not exists instance_name text;
update public.whatsapp_contacts c set instance_name = coalesce(c.instance_name, i.instance_name) from public.instances i where i.user_id = c.user_id and c.instance_name is null;
alter table public.whatsapp_contacts drop constraint if exists whatsapp_contacts_user_id_phone_number_key;
create unique index if not exists whatsapp_contacts_instance_phone_unique on public.whatsapp_contacts(user_id, instance_name, phone_number);

drop index if exists whatsapp_contacts_user_phone_unique;

alter table public.inbox_conversations add column if not exists instance_name text;
update public.inbox_conversations c set instance_name = w.instance_name from public.whatsapp_contacts w where w.id = c.contact_id and c.instance_name is null;
alter table public.inbox_conversations drop constraint if exists inbox_conversations_user_id_contact_id_key;
create unique index if not exists inbox_conversations_instance_contact_unique on public.inbox_conversations(user_id, instance_name, contact_id);

drop index if exists inbox_user_last_message_idx;
create index if not exists inbox_instance_last_message_idx on public.inbox_conversations(user_id, instance_name, last_message_at desc);
create index if not exists whatsapp_contacts_instance_idx on public.whatsapp_contacts(user_id, instance_name, last_message_at desc);
create index if not exists messages_instance_idx on public.messages(user_id, whatsapp_instance_id, created_at desc);

alter table public.blocked_contacts add column if not exists instance_name text;
create index if not exists blocked_contacts_instance_idx on public.blocked_contacts(user_id, instance_name, phone_number);

create or replace function public.sync_contact_to_inbox()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.inbox_conversations(user_id,contact_id,instance_name,last_message_at,unread_count)
  values(new.user_id,new.id,new.instance_name,new.last_message_at,1)
  on conflict (user_id,instance_name,contact_id) do update set last_message_at=excluded.last_message_at, unread_count=public.inbox_conversations.unread_count+1;
  insert into public.crm_activities(user_id,contact_id,activity_type,description) values(new.user_id,new.id,'message_received','Mensagem recebida');
  return new;
end;
$$;
