create or replace function public.is_valid_whatsapp_phone(value text)
returns boolean language sql immutable as $$
  select value is not null
    and value ~ '^[1-9][0-9]{7,14}$'
    and value not like '%-%'
    and length(value) >= 8;
$$;

create index if not exists whatsapp_contacts_valid_individual_idx
  on public.whatsapp_contacts(user_id, instance_name, phone_number)
  where is_group = false and public.is_valid_whatsapp_phone(phone_number);

create or replace view public.whatsapp_individual_contacts as
select * from public.whatsapp_contacts
where coalesce(is_group, false) = false
  and public.is_valid_whatsapp_phone(phone_number)
  and coalesce(phone_number, '') not like '%@%';
