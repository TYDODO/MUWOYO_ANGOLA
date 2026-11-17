-- Replace the setup/top-up commercial flow with a three-day trial and monthly plans.
alter table public.profiles
  add column if not exists province text,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_expires_at timestamptz,
  add column if not exists plan_id uuid,
  add column if not exists subscription_expires_at timestamptz;

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price_kz numeric(12,2) not null check (price_kz > 0),
  monthly_messages integer not null check (monthly_messages > 0),
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  method_type text not null check (method_type in ('bank_transfer', 'entity')),
  label text not null,
  iban text,
  account_holder_name text,
  bank_name text,
  entity_name text,
  entity_number text,
  phone_number text,
  instructions text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.plan_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null default 'pending' check (status in ('pending', 'active', 'expired', 'rejected')),
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  payment_id text not null unique,
  proof_path text,
  proof_url text,
  payment_reference text,
  submitted_at timestamptz not null default now(),
  confirmed_at timestamptz,
  starts_at timestamptz,
  expires_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists plan_subscriptions_user_idx on public.plan_subscriptions(user_id, created_at desc);
create index if not exists plan_subscriptions_status_idx on public.plan_subscriptions(status, created_at desc);

insert into public.subscription_plans (name, price_kz, monthly_messages, features, position)
values
  ('Essencial', 6990, 1000, '["1 número WhatsApp", "Atendimento IA", "Catálogo e pedidos", "1.000 mensagens por mês"]'::jsonb, 1),
  ('Profissional', 13990, 3000, '["1 número WhatsApp", "Atendimento IA avançado", "Catálogo, pedidos e agenda", "3.000 mensagens por mês", "Relatórios básicos"]'::jsonb, 2),
  ('Business', 25000, 8000, '["Até 3 números WhatsApp", "Atendimento IA avançado", "Catálogo, pedidos e agenda", "8.000 mensagens por mês", "Relatórios e suporte prioritário"]'::jsonb, 3)
on conflict (name) do update set
  price_kz = excluded.price_kz,
  monthly_messages = excluded.monthly_messages,
  features = excluded.features,
  position = excluded.position,
  is_active = true;

alter table public.subscription_plans enable row level security;
alter table public.payment_methods enable row level security;
alter table public.plan_subscriptions enable row level security;

create policy "plans public read" on public.subscription_plans for select to anon, authenticated using (is_active = true or public.is_admin(auth.uid()));
create policy "plans admin manage" on public.subscription_plans for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "payment methods public read active" on public.payment_methods for select to anon, authenticated using (is_active = true or public.is_admin(auth.uid()));
create policy "payment methods admin manage" on public.payment_methods for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "subscriptions self read" on public.plan_subscriptions for select to authenticated using (auth.uid() = user_id or public.is_admin(auth.uid()));
create policy "subscriptions self insert" on public.plan_subscriptions for insert to authenticated with check (auth.uid() = user_id);
create policy "subscriptions admin manage" on public.plan_subscriptions for all to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

insert into storage.buckets (id, name, public) values ('payment-proofs', 'payment-proofs', false) on conflict (id) do nothing;
create policy "payment proofs owner upload" on storage.objects for insert to authenticated with check (bucket_id = 'payment-proofs' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "payment proofs owner read" on storage.objects for select to authenticated using (bucket_id = 'payment-proofs' and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin(auth.uid())));
create policy "payment proofs admin update" on storage.objects for update to authenticated using (bucket_id = 'payment-proofs' and public.is_admin(auth.uid())) with check (bucket_id = 'payment-proofs' and public.is_admin(auth.uid()));

create or replace function public.start_trial_after_email_verification(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  started_at timestamptz := now();
  profile_row public.profiles;
begin
  select * into profile_row from public.profiles where user_id = p_user_id for update;
  if profile_row.user_id is null or profile_row.account_status <> 'trial' or profile_row.trial_started_at is not null then return; end if;
  insert into public.credit_ledger (user_id, amount, credit_type)
  values (p_user_id, 100, 'trial') on conflict do nothing;
  update public.profiles set
    trial_started_at = started_at,
    trial_expires_at = started_at + interval '3 days',
    message_limit = greatest(messages_received + 100, message_limit),
    free_messages_granted = true
  where user_id = p_user_id;
  insert into public.notifications (user_id, title, message, type, link)
  values (p_user_id, 'Período de teste iniciado', 'Você tem 3 dias e 100 mensagens gratuitas para testar a Muwoyo.', 'trial_start', '/dashboard');
  perform public.dispatch_email_once(
    'trial_start:' || p_user_id,
    p_user_id,
    'trial_start',
    jsonb_build_object('to', jsonb_build_object('email', profile_row.email, 'name', coalesce(profile_row.full_name, profile_row.email)), 'template_type', 'trial_start', 'template_data', jsonb_build_object('name', coalesce(profile_row.full_name, profile_row.email), 'remaining', 100, 'days', 3))
  );
end;
$$;

create or replace function public.handle_email_confirmation_for_trial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    perform public.start_trial_after_email_verification(new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_start_trial_after_email_confirmation on auth.users;
create trigger trg_start_trial_after_email_confirmation after update of email_confirmed_at on auth.users for each row execute function public.handle_email_confirmation_for_trial();

create or replace function public.expire_trial_and_subscriptions()
returns integer language plpgsql security definer set search_path = public as $$
declare affected integer := 0;
begin
  insert into public.notifications (user_id, title, message, type, link)
  select user_id, 'O seu teste termina amanhã', 'Falta 1 dia para terminar o teste. Escolha um plano para continuar.', 'trial_expiring_1_day', '/recargas'
  from public.profiles p
  where account_status = 'trial' and trial_expires_at > now() and trial_expires_at <= now() + interval '1 day'
    and not exists (select 1 from public.notifications n where n.user_id = p.user_id and n.type = 'trial_expiring_1_day');
  insert into public.notifications (user_id, title, message, type, link)
  select user_id, 'Último dia de teste', 'Hoje é o último dia do seu teste. Escolha um plano para não perder o acesso.', 'trial_last_day', '/recargas'
  from public.profiles p
  where account_status = 'trial' and trial_expires_at > now() and trial_expires_at <= now() + interval '1 day'
    and trial_expires_at > now() + interval '23 hours'
    and not exists (select 1 from public.notifications n where n.user_id = p.user_id and n.type = 'trial_last_day');
  update public.profiles set account_status = 'inactive' where account_status = 'trial' and trial_expires_at <= now();
  update public.plan_subscriptions set status = 'expired' where status = 'active' and expires_at <= now();
  update public.profiles p set account_status = 'inactive', plan_id = null, subscription_expires_at = null
  where p.account_status = 'active' and p.subscription_expires_at <= now()
    and not exists (select 1 from public.plan_subscriptions s where s.user_id = p.user_id and s.status = 'active' and s.expires_at > now());
  get diagnostics affected = row_count;
  return affected;
end;
$$;

do $$ begin
  create extension if not exists pg_cron;
  if not exists (select 1 from cron.job where jobname = 'expire-trials-and-subscriptions') then
    perform cron.schedule('expire-trials-and-subscriptions', '0 * * * *', 'select public.expire_trial_and_subscriptions();');
  end if;
exception when others then raise warning 'Could not schedule commercial expiry: %', sqlerrm;
end $$;

create or replace function public.confirm_plan_subscription(p_subscription_id uuid, p_actor_id uuid, p_reference text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.plan_subscriptions; p public.subscription_plans; now_at timestamptz := now();
begin
  if not public.is_admin_or_subadmin(p_actor_id) then raise exception 'not_authorized'; end if;
  select * into s from public.plan_subscriptions where id = p_subscription_id for update;
  if s.id is null then raise exception 'subscription_not_found'; end if;
  select * into p from public.subscription_plans where id = s.plan_id;
  update public.plan_subscriptions set status = 'active', confirmed_at = now_at, starts_at = now_at, expires_at = now_at + interval '30 days', confirmed_by = p_actor_id, payment_reference = nullif(trim(p_reference), '') where id = s.id;
  update public.profiles set account_status = 'active', plan_id = p.id, subscription_expires_at = now_at + interval '30 days', message_limit = messages_received + p.monthly_messages, activated_at = coalesce(activated_at, now_at), activated_by = p_actor_id where user_id = s.user_id;
  insert into public.notifications (user_id, title, message, type, link) values (s.user_id, 'Plano ativado', 'O seu plano ' || p.name || ' foi ativado por 30 dias.', 'plan_activated', '/dashboard');
  return jsonb_build_object('ok', true, 'status', 'active', 'expires_at', now_at + interval '30 days');
end;
$$;
revoke all on function public.confirm_plan_subscription(uuid, uuid, text) from public;
grant execute on function public.confirm_plan_subscription(uuid, uuid, text) to service_role;

-- Existing trial users receive the new allowance and start immediately when already verified.
update public.profiles p set
  trial_started_at = coalesce(trial_started_at, now()),
  trial_expires_at = coalesce(trial_expires_at, now() + interval '3 days'),
  message_limit = greatest(message_limit, messages_received + 100),
  free_messages_granted = true
where account_status = 'trial' and exists (select 1 from auth.users u where u.id = p.user_id and u.email_confirmed_at is not null);
