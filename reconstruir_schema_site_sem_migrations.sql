-- MUWOYO: RECONSTRUCAO INDEPENDENTE DO SCHEMA USADO PELO SITE
-- Este arquivo e standalone: nao depende da ordem das migrations locais.
-- Execute no SQL Editor do projeto Supabase real depois de fazer backup.
-- Nao apaga tabelas nem dados. Pode criar ou substituir apenas os helpers/views
-- declarados explicitamente neste arquivo; revise o diff do banco antes de usar.
-- Nao executa UPDATE de negocio, nao concede creditos e nao altera status de contas.
--
-- IMPORTANTE:
-- 1) O script cria o schema ausente e adiciona somente colunas ausentes.
-- 2) O script nao consegue inventar as tabelas de afiliados, pois o repositorio
--    apenas as referencia e nao contem sua definicao CREATE TABLE completa.
-- 3) auth.users, storage.objects e buckets pertencem ao Supabase.
-- 4) Depois da execucao, consulte obter_schema_real_tabelas_em_uso.sql.

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ============================================================
-- ENUMS
-- ============================================================
do $$ begin
  create type public.app_role as enum ('admin','sub_admin','client');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.instance_status as enum ('pending','connecting','connected','disconnected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_direction as enum ('inbound','outbound');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_kind as enum ('text','audio','image','video','document','sticker','location','contact','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.queue_status as enum ('pending','processing','sent','failed','delivered');
exception when duplicate_object then null; end $$;

-- ============================================================
-- FUNCOES BASICAS NECESSARIAS POR DEFAULTS/TRIGGERS/POLICIES
-- ============================================================
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.update_updated_at_column()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ============================================================
-- TABELAS CORE
-- ============================================================
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
alter table public.profiles add column if not exists referred_by uuid;
alter table public.profiles add column if not exists referral_code_used text;
alter table public.profiles enable row level security;
create unique index if not exists profiles_user_id_unique on public.profiles(user_id);
create index if not exists profiles_created_by_idx on public.profiles(created_by);
create index if not exists profiles_status_idx on public.profiles(status);
create index if not exists profiles_phone_idx on public.profiles(phone);
create index if not exists profiles_account_status_idx on public.profiles(account_status);
create index if not exists profiles_email_verified_idx on public.profiles(email_verified);
create index if not exists idx_profiles_accepts_appointments on public.profiles(accepts_appointments);
create index if not exists idx_profiles_appointment_duration on public.profiles(appointment_duration_minutes);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'client',
  created_at timestamptz not null default now(),
  unique(user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = 'admin')
$$;

create or replace function public.is_admin_or_subadmin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role in ('admin','sub_admin'))
$$;

create table if not exists public.instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  instance_name text not null unique,
  phone text,
  phone_number text,
  status public.instance_status not null default 'pending',
  connection_state text default 'disconnected',
  evolution_state text,
  automation_paused boolean not null default false,
  automation_paused_until timestamptz,
  qr_code text,
  last_connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.instances enable row level security;
create unique index if not exists instances_user_id_unique on public.instances(user_id);
create unique index if not exists instances_instance_name_unique on public.instances(instance_name);

create table if not exists public.whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  instance_name text,
  phone_number text not null,
  name text,
  profile_pic_url text,
  should_respond boolean not null default true,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, phone_number)
);
alter table public.whatsapp_contacts enable row level security;

create table if not exists public.blocked_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  instance_name text,
  phone_number text not null,
  contact_name text,
  reason text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, phone_number)
);
alter table public.blocked_contacts enable row level security;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  whatsapp_instance_id text,
  phone_number text not null,
  direction public.message_direction not null,
  kind public.message_kind not null default 'text',
  message_text text,
  media_url text,
  external_id text,
  ai_responded boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
create index if not exists idx_messages_user_created on public.messages(user_id, created_at desc);
create index if not exists idx_messages_phone on public.messages(user_id, phone_number);
create index if not exists idx_messages_daily_direct on public.messages(user_id, created_at) where direction = 'inbound' and phone_number not like '%-%';

-- ============================================================
-- LOJA
-- ============================================================
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  slug text not null unique,
  description text,
  logo_url text,
  cover_url text,
  theme_color text default '#16a34a',
  checkout_whatsapp text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.stores add column if not exists header_color text;
alter table public.stores add column if not exists public_description text;
alter table public.stores enable row level security;
create unique index if not exists stores_slug_key on public.stores(slug);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  price numeric(12,2) not null default 0,
  discount_price numeric(12,2),
  stock integer not null default 0,
  category text,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.products add column if not exists discount_policy text;
alter table public.products add column if not exists category_ids uuid[] default '{}';
alter table public.products add column if not exists is_sold_out boolean not null default false;
alter table public.products add column if not exists rating_avg numeric not null default 0;
alter table public.products add column if not exists rating_count integer not null default 0;
alter table public.products enable row level security;
create index if not exists idx_products_store on public.products(store_id);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  url text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.product_images enable row level security;

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  product_id uuid not null,
  name text not null,
  description text,
  price numeric default 0,
  stock integer,
  image_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.product_variants enable row level security;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique(user_id, name)
);
alter table public.categories enable row level security;

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null,
  reviewer_name text,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);
alter table public.product_reviews enable row level security;

create table if not exists public.store_carousel_slides (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  user_id uuid not null,
  title text,
  subtitle text,
  image_url text,
  bg_color text default '#16a34a',
  link_url text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.store_carousel_slides enable row level security;

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text,
  customer_phone text,
  customer_location text,
  items jsonb not null default '[]'::jsonb,
  total numeric(12,2) default 0,
  notes text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.store_orders enable row level security;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text,
  customer_phone text,
  service text,
  description text,
  scheduled_at timestamptz,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.appointments enable row level security;

-- ============================================================
-- MENSAGENS, NOTIFICACOES E IA
-- ============================================================
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
alter table public.notifications enable row level security;
create index if not exists idx_notifications_user on public.notifications(user_id, created_at desc);
create index if not exists notifications_target_user_idx on public.notifications(target_user_id);
create index if not exists notifications_target_role_idx on public.notifications(target_role);
create index if not exists notifications_sender_idx on public.notifications(sender_id);

create table if not exists public.message_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  instance_name text not null,
  remote_jid text not null,
  payload jsonb not null,
  status public.queue_status not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  external_message_id text,
  scheduled_for timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.message_queue enable row level security;
create index if not exists idx_queue_status_sched on public.message_queue(status, scheduled_for);

create table if not exists public.ai_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  content text not null,
  source text,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
alter table public.ai_documents enable row level security;
create index if not exists idx_ai_docs_user on public.ai_documents(user_id);

create table if not exists public.ai_models (
  id uuid primary key default gen_random_uuid(),
  model_name text not null unique,
  input_cost_per_1m_usd numeric(18,8) not null check (input_cost_per_1m_usd >= 0),
  output_cost_per_1m_usd numeric(18,8) not null check (output_cost_per_1m_usd >= 0),
  estimated_tokens_per_message integer not null check (estimated_tokens_per_message > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ai_models enable row level security;

create table if not exists public.user_ai_deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_usd numeric(18,8) not null check (amount_usd >= 0),
  description text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
alter table public.user_ai_deposits enable row level security;
create index if not exists idx_ai_deposits_user_created on public.user_ai_deposits(user_id, created_at desc);

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  execution_id text,
  workflow_name text,
  workflow_id text,
  model_id uuid not null references public.ai_models(id),
  prompt_tokens bigint not null default 0 check (prompt_tokens >= 0),
  completion_tokens bigint not null default 0 check (completion_tokens >= 0),
  total_tokens bigint not null default 0 check (total_tokens >= 0),
  cost_usd numeric(18,8) not null check (cost_usd >= 0),
  created_at timestamptz not null default now()
);
alter table public.ai_usage_events enable row level security;
create index if not exists idx_ai_usage_user_created on public.ai_usage_events(user_id, created_at desc);
create index if not exists idx_ai_usage_model on public.ai_usage_events(model_id);
create index if not exists idx_ai_usage_execution on public.ai_usage_events(execution_id);

create table if not exists public.user_ai_balances (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total_deposited_usd numeric(18,8) not null default 0 check (total_deposited_usd >= 0),
  total_spent_usd numeric(18,8) not null default 0 check (total_spent_usd >= 0),
  updated_at timestamptz not null default now()
);
alter table public.user_ai_balances enable row level security;

-- ============================================================
-- PAGAMENTOS, CREDITOS E EMAIL
-- ============================================================
create table if not exists public.top_up_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  messages integer not null,
  price_kz numeric(12,2) not null,
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.top_up_packages enable row level security;

create table if not exists public.top_up_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  package_id uuid references public.top_up_packages(id) on delete set null,
  messages integer not null,
  amount_kz numeric(12,2) not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null
);
alter table public.top_up_requests add column if not exists request_type text not null default 'top_up';
alter table public.top_up_requests add column if not exists payment_reference text;
alter table public.top_up_requests add column if not exists confirmed_at timestamptz;
alter table public.top_up_requests enable row level security;
create index if not exists top_up_requests_type_status_idx on public.top_up_requests(request_type, status);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount <> 0),
  credit_type text not null,
  reference_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.credit_ledger enable row level security;
create index if not exists credit_ledger_user_created_idx on public.credit_ledger(user_id, created_at desc);
create unique index if not exists credit_ledger_trial_once_idx on public.credit_ledger(user_id) where credit_type = 'trial';
create unique index if not exists credit_ledger_activation_once_idx on public.credit_ledger(user_id) where credit_type = 'activation_bonus';

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
alter table public.email_verifications enable row level security;
revoke all on table public.email_verifications from anon, authenticated;
create index if not exists email_verifications_user_created_idx on public.email_verifications(user_id, created_at desc);
create index if not exists email_verifications_expiry_idx on public.email_verifications(expires_at);

create table if not exists public.email_dispatch_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  template_type text not null check (template_type in ('otp','welcome','trial_start','trial_expired','low_credits')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.email_dispatch_events enable row level security;
revoke all on table public.email_dispatch_events from anon, authenticated;
create index if not exists email_dispatch_events_user_created_idx on public.email_dispatch_events(user_id, created_at desc);

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
alter table public.password_reset_codes enable row level security;
revoke all on table public.password_reset_codes from anon, authenticated;
create index if not exists password_reset_codes_lookup_idx on public.password_reset_codes(user_id, email, created_at desc);

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.password_reset_tokens enable row level security;
revoke all on table public.password_reset_tokens from anon, authenticated;
create index if not exists password_reset_tokens_lookup_idx on public.password_reset_tokens(user_id, expires_at);

-- ============================================================
-- PUSH, TRANSFERENCIAS E TUTORIAIS
-- ============================================================
create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text,
  auth text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.web_push_subscriptions enable row level security;
create index if not exists idx_web_push_subscriptions_user on public.web_push_subscriptions(user_id);
create index if not exists idx_web_push_subscriptions_endpoint on public.web_push_subscriptions(endpoint);

create table if not exists public.push_dispatch_queue (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  processed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_dispatch_notification on public.push_dispatch_queue(notification_id);

create table if not exists public.human_transfer_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text,
  customer_phone text not null,
  customer_email text,
  customer_notes text,
  transfer_status text not null default 'off' check (transfer_status in ('on','off')),
  transfer_reason text,
  transferred_at timestamptz,
  reopened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
alter table public.human_transfer_requests enable row level security;
create index if not exists idx_human_transfer_user_status on public.human_transfer_requests(user_id, transfer_status, updated_at desc);
create index if not exists idx_human_transfer_phone on public.human_transfer_requests(customer_phone);

create table if not exists public.tutorial_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  video_url text not null,
  position integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tutorial_videos add column if not exists subtitle text;
alter table public.tutorial_videos add column if not exists cover_url text;
alter table public.tutorial_videos enable row level security;
create index if not exists tutorial_videos_position_idx on public.tutorial_videos(position, created_at);

-- ============================================================
-- POLICIES PRINCIPAIS, CRIADAS SOMENTE SE AUSENTES
-- ============================================================
do $$ begin
  create policy "profiles self read" on public.profiles for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "profiles self insert" on public.profiles for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "profiles self update" on public.profiles for update using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "roles self read" on public.user_roles for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "instances owner all" on public.instances for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "contacts owner all" on public.whatsapp_contacts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "blocks owner all" on public.blocked_contacts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "messages owner read" on public.messages for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "stores owner all" on public.stores for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "products owner all" on public.products for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "orders owner all" on public.store_orders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "appts owner all" on public.appointments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "notif self read" on public.notifications for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "notif self update" on public.notifications for update using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "queue owner read" on public.message_queue for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "aidocs owner all" on public.ai_documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pkg public read" on public.top_up_packages for select using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "topup self read" on public.top_up_requests for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "topup self insert" on public.top_up_requests for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "credit ledger self read" on public.credit_ledger for select to authenticated using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "web push select self" on public.web_push_subscriptions for select using (auth.uid() = user_id or public.is_admin(auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "web push insert self" on public.web_push_subscriptions for insert with check (auth.uid() = user_id or public.is_admin(auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "web push update self" on public.web_push_subscriptions for update using (auth.uid() = user_id or public.is_admin(auth.uid())) with check (auth.uid() = user_id or public.is_admin(auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "web push delete self" on public.web_push_subscriptions for delete using (auth.uid() = user_id or public.is_admin(auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "tutorials public read" on public.tutorial_videos for select using (is_published = true);
exception when duplicate_object then null; end $$;

-- ============================================================
-- TRIGGERS DE updated_at E PUSH, SOMENTE SE NAO EXISTIREM
-- ============================================================
do $$ begin
  create trigger trg_profiles_updated before update on public.profiles for each row execute function public.tg_set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_instances_updated before update on public.instances for each row execute function public.tg_set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_stores_updated before update on public.stores for each row execute function public.tg_set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_products_updated before update on public.products for each row execute function public.tg_set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_orders_updated before update on public.store_orders for each row execute function public.tg_set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_appointments_updated before update on public.appointments for each row execute function public.tg_set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_queue_updated before update on public.message_queue for each row execute function public.tg_set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_touch_web_push_subscriptions before update on public.web_push_subscriptions for each row execute function public.tg_set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_touch_human_transfer_requests before update on public.human_transfer_requests for each row execute function public.tg_set_updated_at();
exception when duplicate_object then null; end $$;
do $$ begin
  create trigger trg_tutorial_videos_updated before update on public.tutorial_videos for each row execute function public.tg_set_updated_at();
exception when duplicate_object then null; end $$;

-- ============================================================
-- VIEWS DO SITE
-- ============================================================
create or replace view public.v_web_push_subscriptions_by_user as
select id, user_id, endpoint, p256dh, auth, created_at, updated_at
from public.web_push_subscriptions;

create or replace view public.v_ai_user_balance_dashboard as
with deposits as (
  select user_id, coalesce(sum(amount_usd), 0) as total_depositado_usd
  from public.user_ai_deposits group by user_id
), usage as (
  select user_id, coalesce(sum(cost_usd), 0) as total_gasto_usd
  from public.ai_usage_events group by user_id
), base as (
  select coalesce(d.user_id, u.user_id) as user_id,
    coalesce(d.total_depositado_usd, 0) as total_depositado_usd,
    coalesce(u.total_gasto_usd, 0) as total_gasto_usd
  from deposits d full outer join usage u on u.user_id = d.user_id
)
select user_id, total_depositado_usd, total_gasto_usd,
  total_depositado_usd - total_gasto_usd as saldo_atual_usd
from base;

-- ============================================================
-- VALIDACAO POS-EXECUCAO
-- ============================================================
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles','user_roles','instances','whatsapp_contacts','blocked_contacts','messages',
    'stores','products','product_images','product_variants','categories','product_reviews',
    'store_carousel_slides','store_orders','appointments','notifications','message_queue',
    'ai_documents','top_up_packages','top_up_requests','credit_ledger','email_verifications',
    'email_dispatch_events','password_reset_codes','password_reset_tokens',
    'web_push_subscriptions','push_dispatch_queue','human_transfer_requests','tutorial_videos',
    'ai_models','user_ai_deposits','ai_usage_events','user_ai_balances'
  )
order by table_name;

-- Tabelas affiliate_profiles, affiliate_commissions e affiliate_withdrawal_requests
-- nao sao criadas aqui: sua definicao completa nao existe nas migrations locais.
-- Obtenha-as no banco real usando obter_schema_real_tabelas_em_uso.sql antes de criar DDL.

-- Campos confirmados pelo frontend/types.ts, mas que exigem atencao:
-- profiles.business_hours e lido/salvo pelo onboarding e aparece nos tipos gerados,
-- porem nao foi encontrada uma migration local que o crie.
-- Portanto, business_hours foi incluido como jsonb para permitir o contrato atual
-- do frontend, mas sua tipagem final no banco deve ser confirmada no Supabase.
