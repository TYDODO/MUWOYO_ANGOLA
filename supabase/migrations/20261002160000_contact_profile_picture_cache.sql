alter table public.whatsapp_contacts
  add column if not exists profile_picture_updated_at timestamptz;