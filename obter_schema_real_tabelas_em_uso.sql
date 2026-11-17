-- DIAGNOSTICO SOMENTE LEITURA
-- Execute este arquivo no SQL Editor do projeto Supabase real.
-- Ele nao cria, altera ou remove objetos.
-- O resultado vem do banco atualmente conectado, nao das migrations locais.

-- ============================================================
-- 1. TABELAS REALMENTE USADAS PELO FRONTEND E EDGE FUNCTIONS
-- ============================================================
-- A lista abaixo foi montada a partir das chamadas .from(), .rpc(),
-- das Edge Functions e dos objetos usados pelos fluxos do site.

with used_tables(schema_name, table_name) as (
  values
    ('public','profiles'),
    ('public','user_roles'),
    ('public','instances'),
    ('public','whatsapp_contacts'),
    ('public','blocked_contacts'),
    ('public','messages'),
    ('public','stores'),
    ('public','products'),
    ('public','product_images'),
    ('public','product_variants'),
    ('public','categories'),
    ('public','product_reviews'),
    ('public','store_carousel_slides'),
    ('public','store_orders'),
    ('public','appointments'),
    ('public','notifications'),
    ('public','message_queue'),
    ('public','ai_documents'),
    ('public','top_up_packages'),
    ('public','top_up_requests'),
    ('public','credit_ledger'),
    ('public','email_verifications'),
    ('public','email_dispatch_events'),
    ('public','password_reset_codes'),
    ('public','password_reset_tokens'),
    ('public','web_push_subscriptions'),
    ('public','push_dispatch_queue'),
    ('public','human_transfer_requests'),
    ('public','tutorial_videos'),
    ('public','ai_models'),
    ('public','user_ai_deposits'),
    ('public','ai_usage_events'),
    ('public','user_ai_balances'),
    ('public','affiliate_profiles'),
    ('public','affiliate_commissions'),
    ('public','affiliate_withdrawal_requests'),
    ('auth','users'),
    ('storage','objects')
)
select * from used_tables order by schema_name, table_name;

-- ============================================================
-- 2. EXISTENCIA REAL E RLS
-- ============================================================
with used_tables(schema_name, table_name) as (
  values
    ('public','profiles'),('public','user_roles'),('public','instances'),
    ('public','whatsapp_contacts'),('public','blocked_contacts'),('public','messages'),
    ('public','stores'),('public','products'),('public','product_images'),
    ('public','product_variants'),('public','categories'),('public','product_reviews'),
    ('public','store_carousel_slides'),('public','store_orders'),('public','appointments'),
    ('public','notifications'),('public','message_queue'),('public','ai_documents'),
    ('public','top_up_packages'),('public','top_up_requests'),('public','credit_ledger'),
    ('public','email_verifications'),('public','email_dispatch_events'),
    ('public','password_reset_codes'),('public','password_reset_tokens'),
    ('public','web_push_subscriptions'),('public','push_dispatch_queue'),
    ('public','human_transfer_requests'),('public','tutorial_videos'),('public','ai_models'),
    ('public','user_ai_deposits'),('public','ai_usage_events'),('public','user_ai_balances'),
    ('public','affiliate_profiles'),('public','affiliate_commissions'),
    ('public','affiliate_withdrawal_requests'),('auth','users'),('storage','objects')
)
select
  u.schema_name,
  u.table_name,
  c.oid is not null as exists_in_database,
  coalesce(c.relkind, '-') as relkind,
  coalesce(c.relrowsecurity, false) as row_level_security_enabled,
  coalesce(c.relforcerowsecurity, false) as row_level_security_forced
from used_tables u
left join pg_namespace n on n.nspname = u.schema_name
left join pg_class c on c.relnamespace = n.oid and c.relname = u.table_name
order by u.schema_name, u.table_name;

-- ============================================================
-- 3. COLUNAS COMPLETAS, EM ORDEM
-- ============================================================
with used_tables(schema_name, table_name) as (
  values
    ('public','profiles'),('public','user_roles'),('public','instances'),
    ('public','whatsapp_contacts'),('public','blocked_contacts'),('public','messages'),
    ('public','stores'),('public','products'),('public','product_images'),
    ('public','product_variants'),('public','categories'),('public','product_reviews'),
    ('public','store_carousel_slides'),('public','store_orders'),('public','appointments'),
    ('public','notifications'),('public','message_queue'),('public','ai_documents'),
    ('public','top_up_packages'),('public','top_up_requests'),('public','credit_ledger'),
    ('public','email_verifications'),('public','email_dispatch_events'),
    ('public','password_reset_codes'),('public','password_reset_tokens'),
    ('public','web_push_subscriptions'),('public','push_dispatch_queue'),
    ('public','human_transfer_requests'),('public','tutorial_videos'),('public','ai_models'),
    ('public','user_ai_deposits'),('public','ai_usage_events'),('public','user_ai_balances'),
    ('public','affiliate_profiles'),('public','affiliate_commissions'),
    ('public','affiliate_withdrawal_requests'),('auth','users'),('storage','objects')
)
select
  c.table_schema,
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_schema,
  c.udt_name,
  c.character_maximum_length,
  c.numeric_precision,
  c.numeric_scale,
  c.is_nullable,
  c.column_default,
  c.is_identity,
  c.identity_generation,
  c.is_generated,
  c.generation_expression
from information_schema.columns c
join used_tables u on u.schema_name = c.table_schema and u.table_name = c.table_name
order by c.table_schema, c.table_name, c.ordinal_position;

-- ============================================================
-- 4. CONSTRAINTS COMPLETAS: PK, UNIQUE, CHECK E FK
-- ============================================================
with used_tables(schema_name, table_name) as (
  values
    ('public','profiles'),('public','user_roles'),('public','instances'),
    ('public','whatsapp_contacts'),('public','blocked_contacts'),('public','messages'),
    ('public','stores'),('public','products'),('public','product_images'),
    ('public','product_variants'),('public','categories'),('public','product_reviews'),
    ('public','store_carousel_slides'),('public','store_orders'),('public','appointments'),
    ('public','notifications'),('public','message_queue'),('public','ai_documents'),
    ('public','top_up_packages'),('public','top_up_requests'),('public','credit_ledger'),
    ('public','email_verifications'),('public','email_dispatch_events'),
    ('public','password_reset_codes'),('public','password_reset_tokens'),
    ('public','web_push_subscriptions'),('public','push_dispatch_queue'),
    ('public','human_transfer_requests'),('public','tutorial_videos'),('public','ai_models'),
    ('public','user_ai_deposits'),('public','ai_usage_events'),('public','user_ai_balances'),
    ('public','affiliate_profiles'),('public','affiliate_commissions'),
    ('public','affiliate_withdrawal_requests'),('auth','users'),('storage','objects')
)
select
  ns.nspname as table_schema,
  cls.relname as table_name,
  con.conname as constraint_name,
  case con.contype
    when 'p' then 'PRIMARY KEY'
    when 'u' then 'UNIQUE'
    when 'f' then 'FOREIGN KEY'
    when 'c' then 'CHECK'
    when 'x' then 'EXCLUDE'
    else con.contype::text
  end as constraint_type,
  pg_get_constraintdef(con.oid, true) as constraint_definition
from pg_constraint con
join pg_class cls on cls.oid = con.conrelid
join pg_namespace ns on ns.oid = cls.relnamespace
join used_tables u on u.schema_name = ns.nspname and u.table_name = cls.relname
order by ns.nspname, cls.relname, con.conname;

-- ============================================================
-- 5. INDICES COMPLETOS
-- ============================================================
with used_tables(schema_name, table_name) as (
  values
    ('public','profiles'),('public','user_roles'),('public','instances'),
    ('public','whatsapp_contacts'),('public','blocked_contacts'),('public','messages'),
    ('public','stores'),('public','products'),('public','product_images'),
    ('public','product_variants'),('public','categories'),('public','product_reviews'),
    ('public','store_carousel_slides'),('public','store_orders'),('public','appointments'),
    ('public','notifications'),('public','message_queue'),('public','ai_documents'),
    ('public','top_up_packages'),('public','top_up_requests'),('public','credit_ledger'),
    ('public','email_verifications'),('public','email_dispatch_events'),
    ('public','password_reset_codes'),('public','password_reset_tokens'),
    ('public','web_push_subscriptions'),('public','push_dispatch_queue'),
    ('public','human_transfer_requests'),('public','tutorial_videos'),('public','ai_models'),
    ('public','user_ai_deposits'),('public','ai_usage_events'),('public','user_ai_balances'),
    ('public','affiliate_profiles'),('public','affiliate_commissions'),
    ('public','affiliate_withdrawal_requests'),('auth','users'),('storage','objects')
)
select
  ns.nspname as table_schema,
  tbl.relname as table_name,
  idx.relname as index_name,
  ix.indisprimary as is_primary,
  ix.indisunique as is_unique,
  ix.indisexclusion as is_exclusion,
  pg_get_indexdef(ix.indexrelid) as index_definition
from pg_index ix
join pg_class tbl on tbl.oid = ix.indrelid
join pg_class idx on idx.oid = ix.indexrelid
join pg_namespace ns on ns.oid = tbl.relnamespace
join used_tables u on u.schema_name = ns.nspname and u.table_name = tbl.relname
order by ns.nspname, tbl.relname, idx.relname;

-- ============================================================
-- 6. RLS E POLICIES COMPLETAS
-- ============================================================
with used_tables(schema_name, table_name) as (
  values
    ('public','profiles'),('public','user_roles'),('public','instances'),
    ('public','whatsapp_contacts'),('public','blocked_contacts'),('public','messages'),
    ('public','stores'),('public','products'),('public','product_images'),
    ('public','product_variants'),('public','categories'),('public','product_reviews'),
    ('public','store_carousel_slides'),('public','store_orders'),('public','appointments'),
    ('public','notifications'),('public','message_queue'),('public','ai_documents'),
    ('public','top_up_packages'),('public','top_up_requests'),('public','credit_ledger'),
    ('public','email_verifications'),('public','email_dispatch_events'),
    ('public','password_reset_codes'),('public','password_reset_tokens'),
    ('public','web_push_subscriptions'),('public','push_dispatch_queue'),
    ('public','human_transfer_requests'),('public','tutorial_videos'),('public','ai_models'),
    ('public','user_ai_deposits'),('public','ai_usage_events'),('public','user_ai_balances'),
    ('public','affiliate_profiles'),('public','affiliate_commissions'),
    ('public','affiliate_withdrawal_requests'),('auth','users'),('storage','objects')
)
select
  p.schemaname,
  p.tablename,
  p.policyname,
  p.permissive,
  p.roles,
  p.cmd,
  p.qual as using_expression,
  p.with_check as check_expression
from pg_policies p
join used_tables u on u.schema_name = p.schemaname and u.table_name = p.tablename
order by p.schemaname, p.tablename, p.policyname;

-- ============================================================
-- 7. TRIGGERS COMPLETOS E FUNCAO EXECUTADA
-- ============================================================
with used_tables(schema_name, table_name) as (
  values
    ('public','profiles'),('public','user_roles'),('public','instances'),
    ('public','whatsapp_contacts'),('public','blocked_contacts'),('public','messages'),
    ('public','stores'),('public','products'),('public','product_images'),
    ('public','product_variants'),('public','categories'),('public','product_reviews'),
    ('public','store_carousel_slides'),('public','store_orders'),('public','appointments'),
    ('public','notifications'),('public','message_queue'),('public','ai_documents'),
    ('public','top_up_packages'),('public','top_up_requests'),('public','credit_ledger'),
    ('public','email_verifications'),('public','email_dispatch_events'),
    ('public','password_reset_codes'),('public','password_reset_tokens'),
    ('public','web_push_subscriptions'),('public','push_dispatch_queue'),
    ('public','human_transfer_requests'),('public','tutorial_videos'),('public','ai_models'),
    ('public','user_ai_deposits'),('public','ai_usage_events'),('public','user_ai_balances'),
    ('public','affiliate_profiles'),('public','affiliate_commissions'),
    ('public','affiliate_withdrawal_requests'),('auth','users'),('storage','objects')
)
select
  ns.nspname as table_schema,
  tbl.relname as table_name,
  trg.tgname as trigger_name,
  pg_get_triggerdef(trg.oid, true) as trigger_definition,
  proc_ns.nspname as function_schema,
  proc.proname as function_name,
  pg_get_function_identity_arguments(proc.oid) as function_arguments,
  pg_get_functiondef(proc.oid) as function_sql
from pg_trigger trg
join pg_class tbl on tbl.oid = trg.tgrelid
join pg_namespace ns on ns.oid = tbl.relnamespace
join pg_proc proc on proc.oid = trg.tgfoid
join pg_namespace proc_ns on proc_ns.oid = proc.pronamespace
join used_tables u on u.schema_name = ns.nspname and u.table_name = tbl.relname
where not trg.tgisinternal
order by ns.nspname, tbl.relname, trg.tgname;

-- ============================================================
-- 8. SQL COMPLETO DAS FUNCOES RELACIONADAS AO SITE
-- ============================================================
select
  n.nspname as function_schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) as complete_function_sql
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'handle_new_user',
    'email_on_profile_created',
    'email_on_user_verified',
    'email_on_credit_boundary',
    'dispatch_email_once',
    'invoke_email_edge_function',
    'release_trial_credits_after_email_verification',
    'start_trial_on_whatsapp_connection',
    'consume_ai_messages',
    'calculate_usage_cost',
    'match_ai_documents',
    'request_setup_payment',
    'confirm_setup_payment',
    'activate_account',
    'is_admin',
    'has_role',
    'create_instance_on_signup',
    'enqueue_push_dispatch',
    'update_product_rating',
    'cleanup_expired_email_verifications'
  )
order by p.proname, pg_get_function_identity_arguments(p.oid);

-- ============================================================
-- 9. VIEWS E SQL COMPLETO
-- ============================================================
select
  schemaname,
  viewname,
  definition
from pg_views
where (schemaname = 'public' and viewname in (
  'v_web_push_subscriptions_by_user',
  'v_ai_user_balance_dashboard'
))
   or schemaname in ('auth','storage')
order by schemaname, viewname;

-- ============================================================
-- 10. ENUMS E EXTENSOES USADOS
-- ============================================================
select
  n.nspname as enum_schema,
  t.typname as enum_name,
  e.enumsortorder,
  e.enumlabel
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
join pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public'
order by n.nspname, t.typname, e.enumsortorder;

select
  e.extname as extension_name,
  n.nspname as extension_schema,
  e.extversion
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
order by e.extname;

-- ============================================================
-- 11. BUCKETS E POLICIES DO STORAGE
-- ============================================================
select id, name, owner, created_at, updated_at, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('store-assets','business-docs','notification-images','avatars','tutorial-media')
order by id;

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
where schemaname = 'storage' and tablename = 'objects'
order by policyname;

-- ============================================================
-- 12. GERAR UM RESUMO POR TABELA EM JSON
-- ============================================================
-- Esta consulta facilita copiar cada estrutura completa para outro arquivo.
with used_tables(schema_name, table_name) as (
  values
    ('public','profiles'),('public','user_roles'),('public','instances'),
    ('public','whatsapp_contacts'),('public','blocked_contacts'),('public','messages'),
    ('public','stores'),('public','products'),('public','product_images'),
    ('public','product_variants'),('public','categories'),('public','product_reviews'),
    ('public','store_carousel_slides'),('public','store_orders'),('public','appointments'),
    ('public','notifications'),('public','message_queue'),('public','ai_documents'),
    ('public','top_up_packages'),('public','top_up_requests'),('public','credit_ledger'),
    ('public','email_verifications'),('public','email_dispatch_events'),
    ('public','password_reset_codes'),('public','password_reset_tokens'),
    ('public','web_push_subscriptions'),('public','push_dispatch_queue'),
    ('public','human_transfer_requests'),('public','tutorial_videos'),('public','ai_models'),
    ('public','user_ai_deposits'),('public','ai_usage_events'),('public','user_ai_balances'),
    ('public','affiliate_profiles'),('public','affiliate_commissions'),
    ('public','affiliate_withdrawal_requests'),('auth','users'),('storage','objects')
), table_info as (
  select
    u.schema_name,
    u.table_name,
    exists (
      select 1 from information_schema.tables t
      where t.table_schema = u.schema_name and t.table_name = u.table_name
    ) as exists_in_database,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', c.ordinal_position,
        'name', c.column_name,
        'type', c.data_type,
        'udt_schema', c.udt_schema,
        'udt_name', c.udt_name,
        'nullable', c.is_nullable,
        'default', c.column_default
      ) order by c.ordinal_position)
      from information_schema.columns c
      where c.table_schema = u.schema_name and c.table_name = u.table_name
    ), '[]'::jsonb) as columns,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', p.policyname,
        'command', p.cmd,
        'roles', p.roles,
        'using', p.qual,
        'check', p.with_check
      ) order by p.policyname)
      from pg_policies p
      where p.schemaname = u.schema_name and p.tablename = u.table_name
    ), '[]'::jsonb) as policies
  from used_tables u
)
select jsonb_pretty(jsonb_agg(to_jsonb(table_info) order by schema_name, table_name)) as complete_used_schema_summary
from table_info;

-- FIM: todas as consultas acima sao somente SELECT.
