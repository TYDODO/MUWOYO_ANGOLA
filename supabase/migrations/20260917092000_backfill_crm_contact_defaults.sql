-- Give existing WhatsApp contacts the same CRM baseline as new contacts.
insert into public.crm_contact_metadata(contact_id, user_id, stage_id)
select c.id, c.user_id, s.id
from public.whatsapp_contacts c
join public.crm_stages s on s.user_id = c.user_id and s.name = 'Novo'
where not exists (
  select 1 from public.crm_contact_metadata m where m.contact_id = c.id
);
