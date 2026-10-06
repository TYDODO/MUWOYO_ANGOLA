alter table public.profiles
  add column if not exists privacy_policy_accepted boolean not null default false,
  add column if not exists terms_accepted boolean not null default false,
  add column if not exists legal_accepted_at timestamptz,
  add column if not exists suspension_reason text;
