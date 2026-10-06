-- Commercial catalog and entitlement metadata.
alter table public.profiles add column if not exists acquisition_source text;
alter table public.stores
  add column if not exists custom_domain text,
  add column if not exists custom_domain_verified boolean not null default false,
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists seo_keywords text;

update public.subscription_plans set
  price_kz = 7990,
  monthly_messages = 500,
  features = '["500 créditos de IA", "1 agente de IA", "Base de conhecimento da IA", "Gestão de contactos", "Pedidos", "1 loja online", "Domínio padrão Muwoyo", "Afiliados", "1 utilizador", "Até 50 produtos", "Transferência de atendimento para humano"]'::jsonb,
  position = 1
where name in ('Essencial', 'Muwoyo Start');
update public.subscription_plans set name = 'Muwoyo Start' where name = 'Essencial';

update public.subscription_plans set
  price_kz = 14990,
  monthly_messages = 1000,
  features = '["1.000 créditos de IA", "2 agentes de IA", "Agente de Atendimento", "Agente de Follow Up", "Base de conhecimento da IA", "Gestão de contactos", "Pedidos", "Agenda", "Transferência para humano", "Loja online", "Domínio padrão Muwoyo", "Afiliados", "3 utilizadores", "Inbox", "Até 150 produtos"]'::jsonb,
  position = 2
where name in ('Profissional', 'Muwoyo Growth');
update public.subscription_plans set name = 'Muwoyo Growth' where name = 'Profissional';

update public.subscription_plans set
  price_kz = 30000,
  monthly_messages = 2500,
  features = '["2.500 créditos de IA", "2 agentes de IA", "Agente de Atendimento", "Agente de Follow Up", "Até 500 produtos", "Loja online avançada", "Domínio personalizado", "10 utilizadores", "Gestão de contactos", "Pedidos", "Agenda", "Transferência para humano", "Afiliados", "Shared Inbox", "SEO da loja"]'::jsonb,
  position = 3
where name in ('Business', 'Muwoyo Big');
update public.subscription_plans set name = 'Muwoyo Big' where name = 'Business';

insert into public.subscription_plans (name, price_kz, monthly_messages, features, position)
values ('Enterprise', 1, 2147483647, '["Créditos de IA ilimitados", "Agentes de IA ilimitados", "Produtos ilimitados", "Utilizadores ilimitados", "Lojas ilimitadas", "Domínios personalizados", "SEO avançado", "Inbox ilimitado", "Shared Inbox", "Todas as funcionalidades", "Suporte dedicado"]'::jsonb, 4)
on conflict (name) do update set price_kz = excluded.price_kz, monthly_messages = excluded.monthly_messages, features = excluded.features, position = excluded.position, is_active = true;

create unique index if not exists stores_custom_domain_unique_idx on public.stores(lower(custom_domain)) where custom_domain is not null and custom_domain <> '';
create index if not exists profiles_acquisition_source_idx on public.profiles(acquisition_source);

-- Reusable server-side entitlement check for UI/API guards.
create or replace function public.user_has_plan_feature(p_user_id uuid, p_feature text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p join public.subscription_plans sp on sp.id = p.plan_id
    where p.user_id = p_user_id and p.account_status = 'active'
      and (sp.name = 'Enterprise' or sp.features ? p_feature)
      and coalesce(p.subscription_expires_at, now()) > now()
  );
$$;

-- Account billing history is queryable from plan_subscriptions; expose only own records.
create index if not exists plan_subscriptions_user_status_idx on public.plan_subscriptions(user_id, status, created_at desc);
