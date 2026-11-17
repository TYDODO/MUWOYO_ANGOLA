create extension if not exists pgcrypto;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

do $$ begin
  create type public.app_role as enum ('admin','sub_admin','client');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.instance_status as enum ('pending','connecting','connected','disconnected');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'client',
  created_at timestamptz not null default now(),
  unique(user_id, role)
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text,
  phone text,
  full_name text,
  business_name text,
  business_description text,
  ai_name text default 'Muwoyo',
  ai_rules text,
  status text not null default 'active',
  is_suspended boolean not null default false,
  onboarding_completed boolean not null default false,
  message_limit integer not null default 0,
  messages_received integer not null default 0,
  free_messages_granted boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists first_login_completed boolean default false;
alter table public.profiles add column if not exists ai_personality text;
alter table public.profiles add column if not exists transfer_phone text;
alter table public.profiles add column if not exists business_hours jsonb;
alter table public.profiles add column if not exists appointment_duration_minutes integer not null default 30;
alter table public.profiles add column if not exists accepts_appointments boolean not null default true;
alter table public.profiles add column if not exists account_status text not null default 'trial';
alter table public.profiles add column if not exists setup_paid_at timestamptz;
alter table public.profiles add column if not exists setup_payment_id uuid;
alter table public.profiles add column if not exists activated_at timestamptz;
alter table public.profiles add column if not exists activated_by uuid references auth.users(id) on delete set null;
alter table public.profiles add column if not exists email_verified boolean not null default false;
alter table public.profiles add column if not exists pending_email text;
alter table public.profiles add column if not exists privacy_policy_accepted boolean not null default false;
alter table public.profiles add column if not exists terms_accepted boolean not null default false;
alter table public.profiles add column if not exists legal_accepted_at timestamptz;
alter table public.profiles add column if not exists suspension_reason text;
alter table public.profiles add column if not exists trial_started_at timestamptz;
alter table public.profiles add column if not exists trial_expires_at timestamptz;
alter table public.profiles add column if not exists activity_started_at timestamptz;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'info',
  link text,
  image_url text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications add column if not exists sender_id uuid;
alter table public.notifications add column if not exists target_role public.app_role;
alter table public.notifications add column if not exists target_user_id uuid;
alter table public.notifications add column if not exists document_url text;
alter table public.notifications add column if not exists link_url text;

create table if not exists public.email_verifications (
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

create table if not exists public.email_dispatch_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  template_type text not null check (template_type in ('otp','welcome','trial_start','trial_expired','low_credits')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

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

alter table public.user_roles enable row level security;
alter table public.profiles enable row level security;
alter table public.notifications enable row level security;
alter table public.email_verifications enable row level security;
alter table public.email_dispatch_events enable row level security;
alter table public.password_reset_codes enable row level security;
alter table public.password_reset_tokens enable row level security;

revoke all on table public.email_verifications from anon, authenticated;
revoke all on table public.email_dispatch_events from anon, authenticated;
revoke all on table public.password_reset_codes from anon, authenticated;
revoke all on table public.password_reset_tokens from anon, authenticated;

create index if not exists profiles_user_id_unique on public.profiles(user_id);
create index if not exists profiles_created_by_idx on public.profiles(created_by);
create index if not exists profiles_email_verified_idx on public.profiles(email_verified);
create index if not exists email_verifications_user_created_idx on public.email_verifications(user_id, created_at desc);
create index if not exists email_verifications_expiry_idx on public.email_verifications(expires_at);
create index if not exists email_dispatch_events_user_created_idx on public.email_dispatch_events(user_id, created_at desc);
create index if not exists password_reset_codes_lookup_idx on public.password_reset_codes(user_id, email, created_at desc);
create index if not exists password_reset_tokens_lookup_idx on public.password_reset_tokens(user_id, expires_at);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_admin(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = 'admin')
$$;

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.invoke_email_edge_function(p_function_name text, p_payload jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  project_url text;
  service_key text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
  select decrypted_secret into service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  if project_url is null or service_key is null then return; end if;
  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/' || p_function_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
    body := p_payload
  );
exception when others then
  raise warning 'email_dispatch_failed: %', sqlerrm;
end;
$$;

create or replace function public.dispatch_email_once(p_event_key text, p_user_id uuid, p_template_type text, p_payload jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  inserted_id uuid;
begin
  insert into public.email_dispatch_events(event_key, user_id, template_type, payload)
  values(p_event_key, p_user_id, p_template_type, p_payload)
  on conflict(event_key) do nothing
  returning id into inserted_id;
  if inserted_id is not null then
    perform public.invoke_email_edge_function('send-email', p_payload);
  end if;
end;
$$;

create or replace function public.email_on_profile_created()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.invoke_email_edge_function(
    'send-verification-code',
    jsonb_build_object('user_id', new.user_id, 'email', new.email, 'name', coalesce(new.full_name, new.email, 'Cliente'))
  );
  return new;
end;
$$;

create or replace function public.email_on_user_verified()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  display_name text;
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    select coalesce(full_name, email, 'Cliente') into display_name from public.profiles where user_id = new.id;
    perform public.dispatch_email_once(
      'welcome:' || new.id || ':' || new.email_confirmed_at::text,
      new.id,
      'welcome',
      jsonb_build_object(
        'to', jsonb_build_object('email', new.email, 'name', coalesce(display_name, new.email)),
        'template_type', 'welcome',
        'template_data', jsonb_build_object('name', coalesce(display_name, new.email))
      )
    );
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(user_id, email, phone, full_name, created_by, account_status, message_limit, messages_received, free_messages_granted)
  values(
    new.id,
    new.email,
    new.raw_user_meta_data->>'phone',
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    nullif(new.raw_user_meta_data->>'created_by', '')::uuid,
    'trial',
    0,
    0,
    false
  )
  on conflict(user_id) do nothing;
  insert into public.user_roles(user_id, role)
  values(new.id, 'client')
  on conflict(user_id, role) do nothing;
  return new;
end;
$$;

create or replace function public.cleanup_expired_email_verifications()
returns integer
language sql security definer set search_path = public
as $$
  with deleted as (
    delete from public.email_verifications where expires_at < now() or consumed_at is not null returning id
  ) select count(*)::integer from deleted
$$;

revoke all on function public.invoke_email_edge_function(text, jsonb) from public, anon, authenticated;
revoke all on function public.dispatch_email_once(text, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.cleanup_expired_email_verifications() from public, anon, authenticated;
grant execute on function public.invoke_email_edge_function(text, jsonb) to service_role;
grant execute on function public.dispatch_email_once(text, uuid, text, jsonb) to service_role;
grant execute on function public.cleanup_expired_email_verifications() to service_role;

do $$ begin
  create policy "email_verifications_no_client_access" on public.email_verifications for all using (false) with check (false);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "email_dispatch_events_no_client_access" on public.email_dispatch_events for all using (false) with check (false);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "password_reset_codes_no_client_access" on public.password_reset_codes for all using (false) with check (false);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "password_reset_tokens_no_client_access" on public.password_reset_tokens for all using (false) with check (false);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "profiles_self_read" on public.profiles for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "profiles_self_update" on public.profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "user_roles_self_read" on public.user_roles for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "notifications_self_read" on public.notifications for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "notifications_self_update" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

 do $$ begin
  create trigger trg_profiles_updated before update on public.profiles for each row execute function public.tg_set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_email_on_profile_created after insert on public.profiles for each row execute function public.email_on_profile_created();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_email_on_user_verified after update of email_confirmed_at on auth.users for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null) execute function public.email_on_user_verified();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
exception when duplicate_object then null; end $$;
