-- Password recovery uses a one-time six-digit code instead of a Supabase recovery link.
create table if not exists public.password_reset_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now()
);

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.password_reset_codes enable row level security;
alter table public.password_reset_tokens enable row level security;
revoke all on table public.password_reset_codes from anon, authenticated;
revoke all on table public.password_reset_tokens from anon, authenticated;
create index if not exists password_reset_codes_lookup_idx
  on public.password_reset_codes(user_id, email, created_at desc);
create index if not exists password_reset_tokens_lookup_idx
  on public.password_reset_tokens(user_id, expires_at);
