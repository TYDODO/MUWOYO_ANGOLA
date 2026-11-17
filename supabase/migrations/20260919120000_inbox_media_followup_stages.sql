alter table public.messages
  add column if not exists media_metadata jsonb not null default '{}'::jsonb,
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists file_name text,
  add column if not exists remote_jid text,
  add column if not exists media_duration_seconds integer,
  add column if not exists is_voice_note boolean not null default false;

alter table public.whatsapp_contacts
  add column if not exists profile_picture_updated_at timestamptz,
  add column if not exists remote_jid text;

create table if not exists public.follow_up_stages (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.follow_up_rules(id) on delete cascade,
  position integer not null default 0,
  delay_minutes integer not null default 120,
  instruction text,
  message_template text,
  use_ai boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(rule_id, position)
);

create table if not exists public.follow_up_rule_contacts (
  rule_id uuid not null references public.follow_up_rules(id) on delete cascade,
  contact_id uuid not null references public.whatsapp_contacts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  selected boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(rule_id, contact_id)
);

alter table public.follow_up_stages enable row level security;
alter table public.follow_up_rule_contacts enable row level security;
create policy follow_up_stages_user_policy on public.follow_up_stages for all to authenticated using (exists(select 1 from public.follow_up_rules r where r.id = rule_id and r.user_id = auth.uid())) with check (exists(select 1 from public.follow_up_rules r where r.id = rule_id and r.user_id = auth.uid()));
create policy follow_up_rule_contacts_user_policy on public.follow_up_rule_contacts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists follow_up_contacts_rule_idx on public.follow_up_rule_contacts(user_id, rule_id);
