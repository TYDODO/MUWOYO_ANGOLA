-- MUWOYO - PACOTE DE DIAGNOSTICO E RECUPERACAO DO ENVIO DE EMAIL
-- Execute no SQL Editor do Supabase real.
-- Este arquivo NAO contem valores de secrets.
-- Este arquivo NAO apaga dados e NAO faz UPDATE de negocio.
--
-- ATENCAO:
-- - Edge Functions nao ficam armazenadas como SQL no banco. Os codigos-fonte
--   completos continuam nos arquivos supabase/functions/*/index.ts listados no fim.
-- - As consultas abaixo extraem o estado efetivo do banco: tabelas, colunas,
--   grants, RLS, policies, triggers e funcoes.
-- - Nao execute este arquivo junto com migrations historicas sem revisar os
--   resultados. Ele foi feito para diagnostico seguro e recuperacao orientada.

-- ============================================================
-- 1. DEPENDENCIAS DO ENVIO DE EMAIL
-- ============================================================
-- Tabelas necessarias:
-- public.profiles
-- public.email_verifications
-- public.email_dispatch_events
-- public.password_reset_codes
-- public.password_reset_tokens
-- auth.users
--
-- Extensoes necessarias:
-- pgcrypto: hashing/UUID
-- pg_net: net.http_post nos triggers SQL
-- supabase_vault: vault.decrypted_secrets
--
-- Secrets do Edge Runtime (somente nomes):
-- SUPABASE_URL
-- SUPABASE_ANON_KEY
-- SUPABASE_SERVICE_ROLE_KEY
-- ZEPTOMAIL_API_KEY
-- ZEPTOMAIL_ENDPOINT
-- ZEPTOMAIL_FROM
-- ZEPTOMAIL_FROM_NAME
--
-- Secrets esperados no Vault pelos triggers SQL:
-- SUPABASE_URL
-- SUPABASE_SERVICE_ROLE_KEY

-- ============================================================
-- 2. ESTRUTURAS SQL MINIMAS DO FLUXO DE EMAIL
-- ============================================================
create extension if not exists pgcrypto;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

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
-- 3. FUNCOES SQL COMPLETAS DO ENVIO DE EMAIL
-- ============================================================
create or replace function public.invoke_email_edge_function(
  p_function_name text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  project_url text;
  service_key text;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
  select decrypted_secret into service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  if project_url is null or service_key is null then
    raise warning 'Email trigger skipped: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in Vault';
    return;
  end if;
  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/' || p_function_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
    body := p_payload
  );
exception when others then
  raise warning 'Email trigger failed: %', sqlerrm;
end;
$$;
revoke all on function public.invoke_email_edge_function(text, jsonb) from public, anon, authenticated;
grant execute on function public.invoke_email_edge_function(text, jsonb) to service_role;

create or replace function public.dispatch_email_once(
  p_event_key text,
  p_user_id uuid,
  p_template_type text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  insert into public.email_dispatch_events (event_key, user_id, template_type, payload)
  values (p_event_key, p_user_id, p_template_type, p_payload)
  on conflict (event_key) do nothing
  returning id into inserted_id;
  if inserted_id is not null then
    perform public.invoke_email_edge_function('send-email', p_payload);
  end if;
end;
$$;
revoke all on function public.dispatch_email_once(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.dispatch_email_once(text, uuid, text, jsonb) to service_role;

-- ============================================================
-- 4. POLICIES EFETIVAS DO BANCO
-- ============================================================
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_expression,
  with_check as check_expression
from pg_policies
where (schemaname = 'public' and tablename in (
  'profiles','user_roles','instances','whatsapp_contacts','blocked_contacts','messages',
  'stores','products','product_images','product_variants','categories','product_reviews',
  'store_carousel_slides','store_orders','appointments','notifications','message_queue',
  'ai_documents','top_up_packages','top_up_requests','credit_ledger','email_verifications',
  'email_dispatch_events','password_reset_codes','password_reset_tokens',
  'web_push_subscriptions','push_dispatch_queue','human_transfer_requests','tutorial_videos',
  'ai_models','user_ai_deposits','ai_usage_events','user_ai_balances',
  'affiliate_profiles','affiliate_commissions','affiliate_withdrawal_requests'
)) or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- RLS ligado/desligado e forcado
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public','auth','storage')
  and c.relname in (
    'profiles','user_roles','instances','whatsapp_contacts','blocked_contacts','messages',
    'stores','products','product_images','product_variants','categories','product_reviews',
    'store_carousel_slides','store_orders','appointments','notifications','message_queue',
    'ai_documents','top_up_packages','top_up_requests','credit_ledger','email_verifications',
    'email_dispatch_events','password_reset_codes','password_reset_tokens',
    'web_push_subscriptions','push_dispatch_queue','human_transfer_requests','tutorial_videos',
    'ai_models','user_ai_deposits','ai_usage_events','user_ai_balances',
    'affiliate_profiles','affiliate_commissions','affiliate_withdrawal_requests','users','objects'
  )
order by n.nspname, c.relname;

-- Grants efetivos de tabelas
select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema in ('public','auth','storage')
  and table_name in (
    'profiles','user_roles','instances','whatsapp_contacts','blocked_contacts','messages',
    'stores','products','product_images','product_variants','categories','product_reviews',
    'store_carousel_slides','store_orders','appointments','notifications','message_queue',
    'ai_documents','top_up_packages','top_up_requests','credit_ledger','email_verifications',
    'email_dispatch_events','password_reset_codes','password_reset_tokens',
    'web_push_subscriptions','push_dispatch_queue','human_transfer_requests','tutorial_videos',
    'ai_models','user_ai_deposits','ai_usage_events','user_ai_balances',
    'affiliate_profiles','affiliate_commissions','affiliate_withdrawal_requests','users','objects'
  )
order by table_schema, table_name, grantee, privilege_type;

-- ============================================================
-- 5. TRIGGERS EFETIVOS E SQL DAS FUNCOES
-- ============================================================
select
  n.nspname as table_schema,
  t.relname as table_name,
  tr.tgname as trigger_name,
  pg_get_triggerdef(tr.oid, true) as trigger_definition,
  fn_ns.nspname as function_schema,
  fn.proname as function_name,
  pg_get_function_identity_arguments(fn.oid) as function_arguments,
  pg_get_functiondef(fn.oid) as function_sql
from pg_trigger tr
join pg_class t on t.oid = tr.tgrelid
join pg_namespace n on n.oid = t.relnamespace
join pg_proc fn on fn.oid = tr.tgfoid
join pg_namespace fn_ns on fn_ns.oid = fn.pronamespace
where not tr.tgisinternal
  and n.nspname in ('public','auth','storage')
  and t.relname in (
    'profiles','user_roles','instances','whatsapp_contacts','blocked_contacts','messages',
    'stores','products','product_images','product_variants','categories','product_reviews',
    'store_carousel_slides','store_orders','appointments','notifications','message_queue',
    'ai_documents','top_up_packages','top_up_requests','credit_ledger','email_verifications',
    'email_dispatch_events','password_reset_codes','password_reset_tokens',
    'web_push_subscriptions','push_dispatch_queue','human_transfer_requests','tutorial_videos','users'
  )
order by n.nspname, t.relname, tr.tgname;

-- SQL completo das funcoes diretamente envolvidas no email e credito
select
  n.nspname as function_schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) as complete_sql
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'invoke_email_edge_function',
    'dispatch_email_once',
    'email_on_profile_created',
    'email_on_user_verified',
    'email_on_credit_boundary',
    'handle_new_user',
    'release_trial_credits_after_email_verification',
    'start_trial_on_whatsapp_connection',
    'cleanup_expired_email_verifications'
  )
order by p.proname, pg_get_function_identity_arguments(p.oid);

-- ============================================================
-- 6. COLUNAS EFETIVAS DAS DEPENDENCIAS DE EMAIL
-- ============================================================
select table_schema, table_name, ordinal_position, column_name, data_type,
       udt_schema, udt_name, is_nullable, column_default
from information_schema.columns
where (table_schema = 'public' and table_name in (
  'profiles','email_verifications','email_dispatch_events',
  'password_reset_codes','password_reset_tokens'
)) or (table_schema = 'auth' and table_name = 'users')
order by table_schema, table_name, ordinal_position;

-- ============================================================
-- 7. DIAGNOSTICO DE INTEGRIDADE DO FLUXO DE EMAIL
-- ============================================================
select 'email_verifications_exists' as check_name,
       to_regclass('public.email_verifications') is not null as result
union all
select 'email_dispatch_events_exists', to_regclass('public.email_dispatch_events') is not null
union all
select 'password_reset_codes_exists', to_regclass('public.password_reset_codes') is not null
union all
select 'password_reset_tokens_exists', to_regclass('public.password_reset_tokens') is not null
union all
select 'profiles_exists', to_regclass('public.profiles') is not null
union all
select 'pg_net_enabled', exists(select 1 from pg_extension where extname = 'pg_net')
union all
select 'supabase_vault_enabled', exists(select 1 from pg_extension where extname = 'supabase_vault')
union all
select 'vault_supabase_url_present', exists(select 1 from vault.decrypted_secrets where name = 'SUPABASE_URL')
union all
select 'vault_service_role_present', exists(select 1 from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY');

-- ============================================================
-- 8. EDGE FUNCTIONS FISICAS E DEPENDENCIAS
-- ============================================================
-- O SQL Editor nao consegue ler arquivos do repositorio. Estes sao os codigos
-- reais existentes no projeto e devem ser comparados com o deploy Supabase:
--
-- supabase/functions/admin-users/index.ts
--   auth.users; user_roles; profiles; instances; notifications; service_role
--
-- supabase/functions/commercial-flow/index.ts
--   user_roles; top_up_requests; profiles; notifications; credit_ledger;
--   instances; RPCs confirm_setup_payment e activate_account
--
-- supabase/functions/evolution-api/index.ts
--   instances; whatsapp_contacts; RPC start_trial_on_whatsapp_connection;
--   Evolution API; EVOLUTION_API_URL; EVOLUTION_API_KEY
--
-- supabase/functions/n8n-callback/index.ts
--   messages; ai_usage_events; notifications; instances; message_queue;
--   RPCs calculate_usage_cost, recalculate_all_user_ai_balances,
--   consume_ai_messages; N8N_CALLBACK_SECRET
--
-- supabase/functions/password-reset/index.ts
--   profiles; password_reset_codes; password_reset_tokens; auth.users;
--   chama send-email; SUPABASE_URL; SUPABASE_SERVICE_ROLE_KEY
--
-- supabase/functions/populate-ai-documents/index.ts
--   ai_documents; LOVABLE_API_KEY; SUPABASE_ANON_KEY; service_role
--
-- supabase/functions/push-dispatch/index.ts
--   notifications; web_push_subscriptions; WEB_PUSH_BACKEND_URL
--
-- supabase/functions/send-email/index.ts
--   somente ZeptoMail; SUPABASE_SERVICE_ROLE_KEY; ZEPTOMAIL_API_KEY;
--   ZEPTOMAIL_ENDPOINT; ZEPTOMAIL_FROM; ZEPTOMAIL_FROM_NAME
--
-- supabase/functions/send-verification-code/index.ts
--   profiles; email_verifications; chama send-email;
--   SUPABASE_URL; SUPABASE_ANON_KEY; SUPABASE_SERVICE_ROLE_KEY
--
-- supabase/functions/subscribe/index.ts
--   web_push_subscriptions; SUPABASE_URL; SUPABASE_SERVICE_ROLE_KEY
--
-- supabase/functions/verify-email-code/index.ts
--   profiles; email_verifications; notifications; chama send-email;
--   auth.users; SUPABASE_URL; SUPABASE_ANON_KEY; SUPABASE_SERVICE_ROLE_KEY
--
-- supabase/functions/webhook/index.ts
--   instances; whatsapp_contacts; messages; blocked_contacts; profiles;
--   message_queue; N8N_WEBHOOK_URL; EVOLUTION_API_URL; EVOLUTION_API_KEY
--
-- ============================================================
-- 9. CONFIG TOML E DEPLOY
-- ============================================================
-- No config local, existem entradas para send-email, send-verification-code,
-- verify-email-code e commercial-flow. Nao ha entrada explicita para:
-- password-reset e subscribe.
-- Isso nao prova ausencia de deploy. Confirme com o painel/CLI Supabase.
--
-- Para email funcionar, confirme no ambiente:
-- 1. send-email esta deployada.
-- 2. send-verification-code esta deployada.
-- 3. verify-email-code esta deployada.
-- 4. password-reset esta deployada se a recuperacao for usada.
-- 5. Vault contem SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
-- 6. Edge secrets contem os nomes ZeptoMail esperados.
-- 7. endpoint ZeptoMail, remetente e dominio estao validos.
-- 8. pg_net e supabase_vault estao habilitados.
-- 9. triggers de profiles/auth.users chamam funcoes existentes.
--
-- FIM DO PACOTE.
