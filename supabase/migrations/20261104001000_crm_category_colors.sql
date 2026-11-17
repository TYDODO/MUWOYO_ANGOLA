alter table public.crm_stages
  add column if not exists color text not null default '#64748b';

alter table public.crm_tags
  add column if not exists color text not null default '#0f766e';

alter table public.whatsapp_contacts
  add column if not exists crm_viewed_at timestamptz;

update public.whatsapp_contacts
set crm_viewed_at = created_at
where crm_viewed_at is null;

notify pgrst, 'reload schema';
