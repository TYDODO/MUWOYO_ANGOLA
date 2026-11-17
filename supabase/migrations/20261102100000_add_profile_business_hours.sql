alter table public.profiles
  add column if not exists business_hours jsonb;