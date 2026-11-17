alter table public.blocked_contacts drop constraint if exists blocked_contacts_user_id_phone_number_key;
create unique index if not exists blocked_contacts_instance_phone_unique on public.blocked_contacts(user_id, instance_name, phone_number);
