alter table public.subscription_plans
  add column if not exists monthly_audio_seconds numeric(12, 2) not null default 0,
  add column if not exists max_cloned_voices integer not null default 0,
  add column if not exists audio_unlimited boolean not null default false;

alter table public.profiles
  add column if not exists plan_audio_seconds_total numeric(12, 2) not null default 0,
  add column if not exists plan_audio_seconds_used numeric(12, 2) not null default 0,
  add column if not exists topup_audio_seconds_balance numeric(14, 2) not null default 0,
  add column if not exists audio_enabled boolean not null default true,
  add column if not exists plan_audio_period_ends_at timestamptz;

alter table public.subscription_plans
  drop constraint if exists subscription_plans_audio_limits_check;
alter table public.subscription_plans
  add constraint subscription_plans_audio_limits_check
  check (monthly_audio_seconds >= 0 and max_cloned_voices >= 0);

update public.subscription_plans
set price_kz = case name
      when 'Muwoyo Start' then 12499
      when 'Muwoyo Growth' then 23999
      when 'Muwoyo Big' then 44999
      else price_kz
    end,
    monthly_audio_seconds = case name
      when 'Muwoyo Growth' then 6000
      when 'Muwoyo Big' then 15000
      else 0
    end,
    max_cloned_voices = case name
      when 'Muwoyo Growth' then 1
      when 'Muwoyo Big' then 2
      when 'Enterprise' then 2147483647
      else 0
    end,
    audio_unlimited = (name = 'Enterprise'),
    features = coalesce(features, '[]'::jsonb)
      || case when name = 'Muwoyo Start' and not (coalesce(features, '[]'::jsonb) ? '0 minutos de áudio')
              then '["0 minutos de áudio", "Áudio indisponível neste plano"]'::jsonb else '[]'::jsonb end
      || case when name = 'Muwoyo Growth' and not (coalesce(features, '[]'::jsonb) ? '100 minutos de áudio por mês')
              then '["Clonagem de Voz (1 voz ativa)", "100 minutos de áudio por mês (~300 áudios)"]'::jsonb else '[]'::jsonb end
      || case when name = 'Muwoyo Big' and not (coalesce(features, '[]'::jsonb) ? '250 minutos de áudio por mês')
              then '["Clonagem de Voz (até 2 vozes ativas)", "250 minutos de áudio por mês (~750 áudios)"]'::jsonb else '[]'::jsonb end
      || case when name = 'Enterprise' then '["Clonagem de Voz e Áudios ilimitados"]'::jsonb else '[]'::jsonb end,
    updated_at = now()
where name in ('Muwoyo Start', 'Muwoyo Growth', 'Muwoyo Big', 'Enterprise');

create table if not exists public.audio_voice_models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model_id text not null unique,
  title text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists audio_voice_models_user_idx on public.audio_voice_models(user_id, created_at desc);
alter table public.audio_voice_models enable row level security;
grant select on public.audio_voice_models to authenticated;
drop policy if exists audio_voice_models_owner_read on public.audio_voice_models;
create policy audio_voice_models_owner_read on public.audio_voice_models
  for select to authenticated using (user_id = auth.uid() or public.is_admin(auth.uid()));

create table if not exists public.audio_voice_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  voice_model_id text not null references public.audio_voice_models(model_id) on delete cascade,
  generation_number smallint not null check (generation_number between 1 and 3),
  text_input varchar(500) not null check (length(trim(text_input)) between 1 and 500),
  storage_path text,
  duration_seconds numeric(10, 2),
  status text not null default 'generating' check (status in ('generating', 'ready')),
  created_at timestamptz not null default now(),
  unique (voice_model_id, generation_number)
);
create index if not exists audio_voice_generations_owner_idx
  on public.audio_voice_generations(user_id, voice_model_id, created_at desc);
alter table public.audio_voice_generations enable row level security;
grant select on public.audio_voice_generations to authenticated;
drop policy if exists audio_voice_generations_owner_read on public.audio_voice_generations;
create policy audio_voice_generations_owner_read on public.audio_voice_generations
  for select to authenticated using (user_id = auth.uid() or public.is_admin(auth.uid()));

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('audio-generations', 'audio-generations', false, 31457280, array['audio/wav'])
on conflict (id) do update set public = false, file_size_limit = 31457280, allowed_mime_types = array['audio/wav'];
drop policy if exists audio_generations_owner_read on storage.objects;
create policy audio_generations_owner_read on storage.objects
  for select to authenticated
  using (bucket_id = 'audio-generations' and auth.uid()::text = (storage.foldername(name))[1]);

create table if not exists public.audio_topup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  minutes numeric(12, 2) not null check (minutes >= 20),
  amount_kz numeric(14, 2) not null check (amount_kz > 0),
  payment_method_id uuid references public.payment_methods(id) on delete set null,
  payment_id text not null unique,
  proof_path text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
create index if not exists audio_topup_requests_status_idx on public.audio_topup_requests(status, submitted_at);
create index if not exists audio_topup_requests_user_idx on public.audio_topup_requests(user_id, submitted_at desc);
alter table public.audio_topup_requests enable row level security;
grant select on public.audio_topup_requests to authenticated;
drop policy if exists audio_topup_requests_owner_read on public.audio_topup_requests;
create policy audio_topup_requests_owner_read on public.audio_topup_requests
  for select to authenticated using (user_id = auth.uid() or public.is_admin(auth.uid()));

create table if not exists public.audio_balance_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('plan', 'topup', 'admin')),
  seconds_delta numeric(14, 2) not null,
  reason text not null,
  reference_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists audio_balance_ledger_user_idx on public.audio_balance_ledger(user_id, created_at desc);
alter table public.audio_balance_ledger enable row level security;
revoke all on public.audio_balance_ledger from public, anon, authenticated;
grant select, insert on public.audio_balance_ledger to service_role;

create table if not exists public.audio_send_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  voice_model_id text not null,
  plan_seconds numeric(12, 2) not null default 0,
  topup_seconds numeric(12, 2) not null default 0,
  status text not null default 'reserved' check (status in ('reserved', 'sent', 'refunded')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);
alter table public.audio_send_reservations enable row level security;
revoke all on public.audio_send_reservations from public, anon, authenticated;
grant select, insert, update on public.audio_send_reservations to service_role;

create or replace function public.register_audio_voice(
  p_user_id uuid,
  p_model_id text,
  p_title text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row public.profiles;
  plan_row public.subscription_plans;
  active_count integer;
  make_active boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  select * into profile_row from public.profiles where user_id = p_user_id for update;
  select * into plan_row from public.subscription_plans where id = profile_row.plan_id;
  if profile_row.user_id is null or not profile_row.audio_enabled
     or profile_row.account_status <> 'active' or profile_row.subscription_expires_at <= now()
     or plan_row.id is null or (not plan_row.audio_unlimited and plan_row.monthly_audio_seconds <= 0) then
    raise exception 'audio_ineligible';
  end if;
  select count(*) into active_count from public.audio_voice_models where user_id = p_user_id and is_active;
  make_active := active_count < plan_row.max_cloned_voices;
  insert into public.audio_voice_models(user_id, model_id, title, is_active)
  values (p_user_id, p_model_id, left(trim(p_title), 120), make_active);
  return jsonb_build_object('ok', true, 'is_active', make_active);
end;
$$;

create or replace function public.set_audio_voice_active(
  p_user_id uuid,
  p_model_id text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row public.profiles;
  plan_row public.subscription_plans;
  voice_row public.audio_voice_models;
  active_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  select * into profile_row from public.profiles where user_id = p_user_id for update;
  select * into plan_row from public.subscription_plans where id = profile_row.plan_id;
  select * into voice_row from public.audio_voice_models where user_id = p_user_id and model_id = p_model_id for update;
  if voice_row.id is null then raise exception 'voice_not_found'; end if;
  if p_active and (not profile_row.audio_enabled or profile_row.account_status <> 'active'
      or profile_row.subscription_expires_at <= now() or plan_row.id is null
      or (not plan_row.audio_unlimited and plan_row.monthly_audio_seconds <= 0)) then
    raise exception 'audio_ineligible';
  end if;
  if p_active then
    select count(*) into active_count from public.audio_voice_models where user_id = p_user_id and is_active;
    if not voice_row.is_active and active_count >= plan_row.max_cloned_voices then raise exception 'voice_limit_reached'; end if;
  end if;
  update public.audio_voice_models set is_active = p_active, updated_at = now() where id = voice_row.id;
  return jsonb_build_object('ok', true, 'is_active', p_active);
end;
$$;

create or replace function public.reserve_audio_voice_generation(
  p_user_id uuid,
  p_model_id text,
  p_text_input text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row public.profiles;
  plan_row public.subscription_plans;
  voice_row public.audio_voice_models;
  generation_count integer;
  generation_id uuid;
  generation_number smallint;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_text_input is null or length(trim(p_text_input)) < 1 or length(p_text_input) > 500 then
    raise exception 'invalid_generation_text';
  end if;
  select * into profile_row from public.profiles where user_id = p_user_id for update;
  select * into plan_row from public.subscription_plans where id = profile_row.plan_id;
  if profile_row.user_id is null or not profile_row.audio_enabled
     or profile_row.account_status <> 'active' or profile_row.subscription_expires_at <= now()
     or plan_row.id is null or (not plan_row.audio_unlimited and plan_row.monthly_audio_seconds <= 0) then
    raise exception 'audio_ineligible';
  end if;
  select * into voice_row from public.audio_voice_models
  where user_id = p_user_id and model_id = p_model_id for update;
  if voice_row.id is null then raise exception 'voice_not_found'; end if;

  delete from public.audio_voice_generations
  where user_id = p_user_id and voice_model_id = p_model_id
    and status = 'generating' and created_at < now() - interval '15 minutes';
  select count(*) into generation_count
  from public.audio_voice_generations
  where user_id = p_user_id and voice_model_id = p_model_id;
  if generation_count >= 3 then raise exception 'generation_limit_reached'; end if;
  generation_number := generation_count + 1;
  insert into public.audio_voice_generations(user_id, voice_model_id, generation_number, text_input)
  values (p_user_id, p_model_id, generation_number, trim(p_text_input))
  returning id into generation_id;
  return jsonb_build_object('id', generation_id, 'generation_number', generation_number);
end;
$$;

create or replace function public.finalize_audio_voice_generation(
  p_user_id uuid,
  p_generation_id uuid,
  p_storage_path text default null,
  p_duration_seconds numeric default null,
  p_success boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  generation_row public.audio_voice_generations;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  select * into generation_row from public.audio_voice_generations
  where id = p_generation_id and user_id = p_user_id for update;
  if generation_row.id is null then raise exception 'generation_not_found'; end if;
  if generation_row.status <> 'generating' then raise exception 'generation_already_finalized'; end if;

  if not p_success then
    delete from public.audio_voice_generations where id = generation_row.id;
    return jsonb_build_object('ok', true, 'status', 'failed');
  end if;
  if p_storage_path is null or split_part(p_storage_path, '/', 1) <> p_user_id::text
     or p_duration_seconds is null or p_duration_seconds <= 0 or p_duration_seconds > 3600 then
    raise exception 'invalid_generation_result';
  end if;
  update public.audio_voice_generations
  set status = 'ready', storage_path = p_storage_path, duration_seconds = p_duration_seconds
  where id = generation_row.id;
  return jsonb_build_object('ok', true, 'status', 'ready');
end;
$$;

create or replace function public.refresh_audio_plan_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_row public.subscription_plans;
begin
  select * into plan_row from public.subscription_plans where id = new.plan_id;
  if new.account_status = 'active'
     and new.subscription_expires_at > now()
     and plan_row.id is not null
     and (plan_row.audio_unlimited or plan_row.monthly_audio_seconds > 0) then
    new.plan_audio_seconds_total := coalesce(plan_row.monthly_audio_seconds, 0);
    new.plan_audio_seconds_used := 0;
    new.plan_audio_period_ends_at := now() + interval '1 month';
  else
    new.plan_audio_seconds_total := 0;
    new.plan_audio_seconds_used := 0;
    new.plan_audio_period_ends_at := null;
  end if;
  update public.audio_voice_models voice
  set is_active = false, updated_at = now()
  where voice.user_id = new.user_id
    and voice.is_active
    and voice.id not in (
      select eligible_voice.id
      from public.audio_voice_models eligible_voice
      where eligible_voice.user_id = new.user_id
        and eligible_voice.is_active
      order by eligible_voice.created_at, eligible_voice.id
      limit case
        when new.account_status = 'active'
          and new.subscription_expires_at > now()
          and plan_row.id is not null
          and (plan_row.audio_unlimited or plan_row.monthly_audio_seconds > 0)
        then plan_row.max_cloned_voices
        else 0
      end
    );
  return new;
end;
$$;

drop trigger if exists trg_refresh_audio_plan_balance on public.profiles;
create trigger trg_refresh_audio_plan_balance
before update of plan_id, subscription_expires_at, account_status on public.profiles
for each row
when (
  old.plan_id is distinct from new.plan_id
  or old.subscription_expires_at is distinct from new.subscription_expires_at
  or old.account_status is distinct from new.account_status
)
execute function public.refresh_audio_plan_balance();

create or replace function public.ensure_audio_plan_period(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row public.profiles;
  plan_row public.subscription_plans;
begin
  select * into profile_row from public.profiles where user_id = p_user_id for update;
  if profile_row.user_id is null or profile_row.account_status <> 'active'
     or profile_row.subscription_expires_at <= now() then return; end if;
  select * into plan_row from public.subscription_plans where id = profile_row.plan_id;
  if plan_row.id is null or (not plan_row.audio_unlimited and plan_row.monthly_audio_seconds <= 0) then return; end if;

  if profile_row.plan_audio_period_ends_at is null then
    update public.profiles
    set plan_audio_seconds_total = plan_row.monthly_audio_seconds,
        plan_audio_seconds_used = 0,
        plan_audio_period_ends_at = now() + interval '1 month'
    where user_id = p_user_id;
  elsif profile_row.plan_audio_period_ends_at <= now() then
    while profile_row.plan_audio_period_ends_at <= now() loop
      profile_row.plan_audio_period_ends_at := profile_row.plan_audio_period_ends_at + interval '1 month';
    end loop;
    update public.profiles
    set plan_audio_seconds_total = plan_row.monthly_audio_seconds,
        plan_audio_seconds_used = 0,
        plan_audio_period_ends_at = profile_row.plan_audio_period_ends_at
    where user_id = p_user_id;
  end if;
end;
$$;

create or replace function public.get_audio_balance(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row public.profiles;
  plan_row public.subscription_plans;
  remaining_plan numeric(14, 2);
  remaining_topup numeric(14, 2);
  is_eligible boolean;
begin
  if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() <> p_user_id) then
    raise exception 'not_authorized';
  end if;
  perform public.ensure_audio_plan_period(p_user_id);
  select * into profile_row from public.profiles where user_id = p_user_id;
  select * into plan_row from public.subscription_plans where id = profile_row.plan_id;
  is_eligible := profile_row.user_id is not null
    and profile_row.audio_enabled
    and profile_row.account_status = 'active'
    and profile_row.subscription_expires_at > now()
    and plan_row.id is not null
    and (plan_row.audio_unlimited or plan_row.monthly_audio_seconds > 0);
  remaining_plan := greatest(0, profile_row.plan_audio_seconds_total - profile_row.plan_audio_seconds_used);
  remaining_topup := greatest(0, profile_row.topup_audio_seconds_balance);
  return jsonb_build_object(
    'eligible', coalesce(is_eligible, false),
    'plan_name', plan_row.name,
    'audio_unlimited', coalesce(plan_row.audio_unlimited, false),
    'audio_enabled', coalesce(profile_row.audio_enabled, false),
    'plan_seconds_total', coalesce(profile_row.plan_audio_seconds_total, 0),
    'plan_seconds_used', coalesce(profile_row.plan_audio_seconds_used, 0),
    'plan_seconds_remaining', case
      when not coalesce(is_eligible, false) then 0
      when plan_row.audio_unlimited then null
      else coalesce(remaining_plan, 0)
    end,
    'topup_seconds_balance', coalesce(profile_row.topup_audio_seconds_balance, 0),
    'total_seconds_available', case
      when not coalesce(is_eligible, false) then 0
      when plan_row.audio_unlimited then null
      else coalesce(remaining_plan, 0) + coalesce(remaining_topup, 0)
    end,
    'period_ends_at', profile_row.plan_audio_period_ends_at,
    'subscription_expires_at', profile_row.subscription_expires_at,
    'max_cloned_voices', coalesce(plan_row.max_cloned_voices, 0)
  );
end;
$$;

create or replace function public.create_audio_topup_request(
  p_minutes numeric,
  p_payment_method_id uuid,
  p_payment_id text,
  p_proof_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_minutes is null or p_minutes < 20 then raise exception 'invalid_minutes'; end if;
  if p_payment_id is null or length(trim(p_payment_id)) < 8 then raise exception 'invalid_payment_id'; end if;
  if p_proof_path is null or split_part(p_proof_path, '/', 1) <> auth.uid()::text then raise exception 'invalid_proof_path'; end if;
  if p_payment_method_id is not null and not exists (
    select 1 from public.payment_methods where id = p_payment_method_id and is_active
  ) then raise exception 'invalid_payment_method'; end if;

  insert into public.audio_topup_requests(user_id, minutes, amount_kz, payment_method_id, payment_id, proof_path)
  values (auth.uid(), p_minutes, p_minutes * 50, p_payment_method_id, trim(p_payment_id), p_proof_path)
  returning id into request_id;
  return request_id;
end;
$$;

create or replace function public.review_audio_topup_request(
  p_request_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.audio_topup_requests;
  actor uuid := auth.uid();
begin
  if actor is null or not public.is_admin(actor) then raise exception 'admin_required'; end if;
  select * into request_row from public.audio_topup_requests where id = p_request_id for update;
  if request_row.id is null then raise exception 'topup_request_not_found'; end if;
  if request_row.status <> 'pending' then raise exception 'topup_request_not_pending'; end if;

  update public.audio_topup_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      rejection_reason = case when p_approve then null else left(nullif(trim(p_reason), ''), 1000) end,
      reviewed_at = now(), reviewed_by = actor
  where id = p_request_id;

  if p_approve then
    update public.profiles
    set topup_audio_seconds_balance = topup_audio_seconds_balance + request_row.minutes * 60
    where user_id = request_row.user_id;
    if not found then raise exception 'profile_not_found'; end if;
    insert into public.audio_balance_ledger(user_id, source, seconds_delta, reason, reference_id, actor_id)
    values (request_row.user_id, 'topup', request_row.minutes * 60, 'approved_topup', request_row.id, actor);
    insert into public.notifications(user_id, title, message, type, link)
    values (request_row.user_id, 'Top-up de áudio aprovado',
      request_row.minutes || ' minutos de áudio foram adicionados ao seu saldo extra.',
      'audio_topup_approved', '/voz');
  else
    insert into public.notifications(user_id, title, message, type, link)
    values (request_row.user_id, 'Top-up de áudio recusado',
      'O comprovativo foi recusado. Motivo: ' || coalesce(nullif(trim(p_reason), ''), 'Contacte o suporte.'),
      'audio_topup_rejected', '/voz');
  end if;

  return jsonb_build_object(
    'ok', true,
    'status', case when p_approve then 'approved' else 'rejected' end,
    'minutes_credited', case when p_approve then request_row.minutes else 0 end
  );
end;
$$;

create or replace function public.admin_update_audio_account(
  p_user_id uuid,
  p_plan_seconds_total numeric,
  p_plan_seconds_used numeric,
  p_topup_seconds_balance numeric,
  p_audio_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  old_profile public.profiles;
begin
  if actor is null or not public.is_admin(actor) then raise exception 'admin_required'; end if;
  if p_plan_seconds_total < 0 or p_plan_seconds_used < 0 or p_topup_seconds_balance < 0
     or p_plan_seconds_used > p_plan_seconds_total then raise exception 'invalid_audio_balance'; end if;
  select * into old_profile from public.profiles where user_id = p_user_id for update;
  if old_profile.user_id is null then raise exception 'profile_not_found'; end if;
  update public.profiles
  set plan_audio_seconds_total = p_plan_seconds_total,
      plan_audio_seconds_used = p_plan_seconds_used,
      topup_audio_seconds_balance = p_topup_seconds_balance,
      audio_enabled = p_audio_enabled
  where user_id = p_user_id;
  if p_plan_seconds_total <> old_profile.plan_audio_seconds_total
     or p_plan_seconds_used <> old_profile.plan_audio_seconds_used then
    insert into public.audio_balance_ledger(user_id, source, seconds_delta, reason, actor_id)
    values (p_user_id, 'admin',
      (p_plan_seconds_total - old_profile.plan_audio_seconds_total) - (p_plan_seconds_used - old_profile.plan_audio_seconds_used),
      'admin_plan_balance_update', actor);
  end if;
  if p_topup_seconds_balance <> old_profile.topup_audio_seconds_balance then
    insert into public.audio_balance_ledger(user_id, source, seconds_delta, reason, actor_id)
    values (p_user_id, 'admin', p_topup_seconds_balance - old_profile.topup_audio_seconds_balance,
      'admin_topup_balance_update', actor);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.reserve_audio_seconds(
  p_user_id uuid,
  p_seconds numeric,
  p_voice_model_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row public.profiles;
  plan_row public.subscription_plans;
  plan_remaining numeric(14, 2);
  plan_debit numeric(14, 2);
  topup_debit numeric(14, 2);
  reservation_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_seconds is null or p_seconds <= 0 or p_seconds > 3600 then raise exception 'invalid_audio_duration'; end if;
  perform public.ensure_audio_plan_period(p_user_id);
  select * into profile_row from public.profiles where user_id = p_user_id for update;
  select * into plan_row from public.subscription_plans where id = profile_row.plan_id;
  if profile_row.user_id is null or not profile_row.audio_enabled
     or profile_row.account_status <> 'active' or profile_row.subscription_expires_at <= now()
     or plan_row.id is null or (not plan_row.audio_unlimited and plan_row.monthly_audio_seconds <= 0) then
    return jsonb_build_object('ok', false, 'reason', 'audio_ineligible');
  end if;
  if not exists (select 1 from public.audio_voice_models where user_id = p_user_id and model_id = p_voice_model_id and is_active) then
    return jsonb_build_object('ok', false, 'reason', 'voice_not_active');
  end if;

  if plan_row.audio_unlimited then
    plan_debit := 0;
    topup_debit := 0;
  else
    plan_remaining := greatest(0, profile_row.plan_audio_seconds_total - profile_row.plan_audio_seconds_used);
    if plan_remaining + profile_row.topup_audio_seconds_balance < p_seconds then
      return jsonb_build_object('ok', false, 'reason', 'audio_balance_insufficient');
    end if;
    plan_debit := least(plan_remaining, p_seconds);
    topup_debit := p_seconds - plan_debit;
    update public.profiles
    set plan_audio_seconds_used = plan_audio_seconds_used + plan_debit,
        topup_audio_seconds_balance = topup_audio_seconds_balance - topup_debit
    where user_id = p_user_id;
  end if;

  insert into public.audio_send_reservations(user_id, voice_model_id, plan_seconds, topup_seconds)
  values (p_user_id, p_voice_model_id, plan_debit, topup_debit)
  returning id into reservation_id;
  insert into public.audio_balance_ledger(user_id, source, seconds_delta, reason, reference_id)
  select p_user_id, debit.source, -debit.amount, 'audio_send_reserved', reservation_id
  from (values ('plan'::text, plan_debit), ('topup'::text, topup_debit)) as debit(source, amount)
  where debit.amount > 0;
  return jsonb_build_object('ok', true, 'reservation_id', reservation_id, 'plan_seconds', plan_debit, 'topup_seconds', topup_debit);
end;
$$;

create or replace function public.finalize_audio_reservation(p_reservation_id uuid, p_sent boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation_row public.audio_send_reservations;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  select * into reservation_row from public.audio_send_reservations where id = p_reservation_id for update;
  if reservation_row.id is null then raise exception 'audio_reservation_not_found'; end if;
  if reservation_row.status <> 'reserved' then
    return jsonb_build_object('ok', true, 'status', reservation_row.status, 'already_finalized', true);
  end if;
  if p_sent then
    update public.audio_send_reservations set status = 'sent', finalized_at = now() where id = p_reservation_id;
  else
    update public.profiles
    set plan_audio_seconds_used = greatest(0, plan_audio_seconds_used - reservation_row.plan_seconds),
        topup_audio_seconds_balance = topup_audio_seconds_balance + reservation_row.topup_seconds
    where user_id = reservation_row.user_id;
    update public.audio_send_reservations set status = 'refunded', finalized_at = now() where id = p_reservation_id;
    insert into public.audio_balance_ledger(user_id, source, seconds_delta, reason, reference_id)
    select reservation_row.user_id, debit.source, debit.amount, 'audio_send_failed_refund', p_reservation_id
    from (values ('plan'::text, reservation_row.plan_seconds), ('topup'::text, reservation_row.topup_seconds)) as debit(source, amount)
    where debit.amount > 0;
  end if;
  return jsonb_build_object('ok', true, 'status', case when p_sent then 'sent' else 'refunded' end);
end;
$$;

revoke all on function public.ensure_audio_plan_period(uuid) from public, anon, authenticated;
revoke all on function public.get_audio_balance(uuid) from public, anon;
revoke all on function public.register_audio_voice(uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_audio_voice_active(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.reserve_audio_voice_generation(uuid, text, text) from public, anon, authenticated;
revoke all on function public.finalize_audio_voice_generation(uuid, uuid, text, numeric, boolean) from public, anon, authenticated;
revoke all on function public.create_audio_topup_request(numeric, uuid, text, text) from public, anon;
revoke all on function public.review_audio_topup_request(uuid, boolean, text) from public, anon;
revoke all on function public.admin_update_audio_account(uuid, numeric, numeric, numeric, boolean) from public, anon;
revoke all on function public.reserve_audio_seconds(uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.finalize_audio_reservation(uuid, boolean) from public, anon, authenticated;
grant execute on function public.get_audio_balance(uuid) to authenticated, service_role;
grant execute on function public.register_audio_voice(uuid, text, text) to service_role;
grant execute on function public.set_audio_voice_active(uuid, text, boolean) to service_role;
grant execute on function public.reserve_audio_voice_generation(uuid, text, text) to service_role;
grant execute on function public.finalize_audio_voice_generation(uuid, uuid, text, numeric, boolean) to service_role;
grant execute on function public.create_audio_topup_request(numeric, uuid, text, text) to authenticated;
grant execute on function public.review_audio_topup_request(uuid, boolean, text) to authenticated;
grant execute on function public.admin_update_audio_account(uuid, numeric, numeric, numeric, boolean) to authenticated;
grant execute on function public.reserve_audio_seconds(uuid, numeric, text) to service_role;
grant execute on function public.finalize_audio_reservation(uuid, boolean) to service_role;

comment on column public.profiles.plan_audio_seconds_total is 'Monthly plan audio allowance in seconds.';
comment on column public.profiles.plan_audio_seconds_used is 'Audio seconds consumed from the current plan period.';
comment on column public.profiles.topup_audio_seconds_balance is 'Purchased audio seconds; never reset with monthly plan allowances.';
