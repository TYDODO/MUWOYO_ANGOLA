-- Keep billing authorization and notification delivery on trusted server paths.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;
create table if not exists private.admin_security_config (
  singleton boolean primary key default true check (singleton),
  primary_user_id uuid not null unique references auth.users(id) on delete restrict,
  configured_at timestamptz not null default now()
);
revoke all on table private.admin_security_config from public, anon, authenticated, service_role;

do $$
declare
  primary_id uuid;
  admin_count integer;
begin
  select id into primary_id
  from auth.users
  where lower(email) = lower('tydodo30@gmail.com');
  if primary_id is null then
    raise exception 'primary_admin_account_missing: verify the existing account before applying this migration';
  end if;

  select count(*) into admin_count from public.user_roles where role = 'admin';
  if admin_count <> 1 or not exists (
    select 1 from public.user_roles where user_id = primary_id and role = 'admin'
  ) then
    raise exception 'primary_admin_identity_ambiguous: expected the requested account to be the only existing admin; found % admin role(s)', admin_count;
  end if;

  insert into private.admin_security_config (singleton, primary_user_id)
  values (true, primary_id)
  on conflict (singleton) do nothing;
  if not exists (
    select 1 from private.admin_security_config
    where singleton and primary_user_id = primary_id
  ) then
    raise exception 'primary_admin_config_mismatch: manual review required';
  end if;
end;
$$;

create or replace function public.is_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select exists (
    select 1 from private.admin_security_config
    where singleton and primary_user_id = _user_id
  );
$$;
revoke all on function public.is_admin(uuid) from public;
grant execute on function public.is_admin(uuid) to anon, authenticated, service_role;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if _role = 'admin'::public.app_role then
    return public.is_admin(_user_id);
  end if;
  return exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
end;
$$;
revoke all on function public.has_role(uuid, public.app_role) from public;
grant execute on function public.has_role(uuid, public.app_role) to anon, authenticated, service_role;

create or replace function public.is_admin_or_subadmin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select public.is_admin(_user_id)
    or exists (select 1 from public.user_roles where user_id = _user_id and role = 'sub_admin');
$$;
revoke all on function public.is_admin_or_subadmin(uuid) from public;
grant execute on function public.is_admin_or_subadmin(uuid) to authenticated, service_role;

create or replace function public.protect_primary_admin_role()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'admin'::public.app_role and public.is_admin(old.user_id) then
      raise exception 'primary_admin_role_is_immutable';
    end if;
    return old;
  end if;
  if new.role = 'admin'::public.app_role and not public.is_admin(new.user_id) then
    raise exception 'only_the_primary_admin_may_have_admin_role';
  end if;
  if tg_op = 'UPDATE' and old.role = 'admin'::public.app_role
    and public.is_admin(old.user_id)
    and (new.user_id is distinct from old.user_id or new.role is distinct from old.role) then
    raise exception 'primary_admin_role_is_immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_primary_admin_role() from public, anon, authenticated, service_role;
drop trigger if exists trg_protect_primary_admin_role on public.user_roles;
create trigger trg_protect_primary_admin_role
before insert or update or delete on public.user_roles
for each row execute function public.protect_primary_admin_role();

alter table public.email_dispatch_events
  drop constraint if exists email_dispatch_events_template_type_check,
  add constraint email_dispatch_events_template_type_check check (template_type in (
    'otp', 'welcome', 'trial_start', 'trial_expired', 'low_credits', 'password_reset',
    'trial_expiring_1_day', 'trial_last_day', 'payment_confirmed', 'plan_expiring'
  )),
  add column if not exists processed boolean not null default false,
  add column if not exists attempts integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_error text;
update public.email_dispatch_events set processed = true where created_at < now();
grant select, update on table public.email_dispatch_events to service_role;

create index if not exists email_dispatch_events_pending_idx
  on public.email_dispatch_events(last_attempt_at, created_at)
  where not processed and attempts < 10;

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
  event_payload jsonb := p_payload || jsonb_build_object('event_key', p_event_key);
begin
  insert into public.email_dispatch_events (event_key, user_id, template_type, payload, attempts, last_attempt_at)
  values (p_event_key, p_user_id, p_template_type, event_payload, 1, now())
  on conflict (event_key) do nothing
  returning id into inserted_id;

  if inserted_id is not null then
    perform public.invoke_email_edge_function('send-email', event_payload);
  end if;
end;
$$;
revoke all on function public.dispatch_email_once(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.dispatch_email_once(text, uuid, text, jsonb) to service_role;

create or replace function public.retry_pending_email_dispatches()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  event_row record;
  dispatched integer := 0;
begin
  for event_row in
    select id, event_key, payload
    from public.email_dispatch_events
    where not processed
      and attempts < 10
      and (last_attempt_at is null or last_attempt_at < now() - interval '5 minutes')
    order by created_at
    for update skip locked
    limit 100
  loop
    update public.email_dispatch_events
    set attempts = attempts + 1, last_attempt_at = now(), last_error = null
    where id = event_row.id;
    perform public.invoke_email_edge_function('send-email', event_row.payload || jsonb_build_object('event_key', event_row.event_key));
    dispatched := dispatched + 1;
  end loop;
  return dispatched;
end;
$$;
revoke all on function public.retry_pending_email_dispatches() from public, anon, authenticated;

create table if not exists public.plan_expiry_notices (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.plan_subscriptions(id) on delete cascade,
  days_before integer not null check (days_before in (7, 3, 2, 1, 0)),
  sent_at timestamptz not null default now(),
  unique (subscription_id, days_before)
);
alter table public.plan_expiry_notices enable row level security;
revoke all on table public.plan_expiry_notices from public, anon, authenticated;

drop policy if exists "subscriptions self insert" on public.plan_subscriptions;
create policy "subscriptions self insert pending"
on public.plan_subscriptions
for insert to authenticated
with check (
  auth.uid() = user_id
  and status = 'pending'
  and confirmed_at is null
  and starts_at is null
  and expires_at is null
  and confirmed_by is null
  and payment_reference is null
);

-- Non-admin clients may update editable profile data, never authorization or billing state.
create or replace function public.protect_profile_commercial_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      if (not public.is_admin(auth.uid()) or public.is_admin(new.user_id)) and (
        new.user_id is distinct from auth.uid()
        or new.created_by is not null
        or new.account_status is distinct from 'trial'
        or new.status is distinct from 'active'
        or coalesce(new.is_suspended, false)
        or new.plan_id is not null
        or new.subscription_expires_at is not null
        or new.trial_started_at is not null
        or new.trial_expires_at is not null
        or new.setup_paid_at is not null
        or new.setup_payment_id is not null
        or new.activated_at is not null
        or new.activated_by is not null
        or coalesce(new.message_limit, 0) > 50
        or coalesce(new.messages_received, 0) <> 0
      ) then
        raise exception 'commercial_fields_are_server_managed';
      end if;
    elsif (not public.is_admin(auth.uid()) or public.is_admin(old.user_id)) and (
      new.user_id is distinct from old.user_id
      or new.created_by is distinct from old.created_by
      or new.account_status is distinct from old.account_status
      or new.status is distinct from old.status
      or new.is_suspended is distinct from old.is_suspended
      or new.plan_id is distinct from old.plan_id
      or new.subscription_expires_at is distinct from old.subscription_expires_at
      or new.trial_started_at is distinct from old.trial_started_at
      or new.trial_expires_at is distinct from old.trial_expires_at
      or new.setup_paid_at is distinct from old.setup_paid_at
      or new.setup_payment_id is distinct from old.setup_payment_id
      or new.activated_at is distinct from old.activated_at
      or new.activated_by is distinct from old.activated_by
      or new.message_limit is distinct from old.message_limit
      or new.messages_received is distinct from old.messages_received
      or new.free_messages_granted is distinct from old.free_messages_granted
      or new.email_verified is distinct from old.email_verified
    ) then
      raise exception 'commercial_fields_are_server_managed';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_protect_profile_commercial_fields on public.profiles;
create trigger trg_protect_profile_commercial_fields
before insert or update on public.profiles
for each row execute function public.protect_profile_commercial_fields();
revoke all on function public.protect_profile_commercial_fields() from public, anon, authenticated;

drop policy if exists "Admins can delete profiles" on public.profiles;
drop policy if exists "profiles admin all" on public.profiles;
create policy "Admins can delete non-primary profiles"
on public.profiles
for delete to authenticated
using (public.is_admin(auth.uid()) and not public.is_admin(user_id));

create or replace function public.protect_primary_admin_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_op = 'DELETE' then
    if public.is_admin(old.user_id) then
      raise exception 'primary_admin_profile_is_immutable';
    end if;
    return old;
  end if;
  if public.is_admin(old.user_id) then
    if new.id is distinct from old.id
      or new.user_id is distinct from old.user_id
      or new.email is distinct from old.email
      or new.created_by is distinct from old.created_by
      or new.account_status is distinct from old.account_status
      or new.status is distinct from old.status
      or new.is_suspended is distinct from old.is_suspended
      or new.plan_id is distinct from old.plan_id
      or new.subscription_expires_at is distinct from old.subscription_expires_at
      or new.trial_started_at is distinct from old.trial_started_at
      or new.trial_expires_at is distinct from old.trial_expires_at
      or new.setup_paid_at is distinct from old.setup_paid_at
      or new.setup_payment_id is distinct from old.setup_payment_id
      or new.activated_at is distinct from old.activated_at
      or new.activated_by is distinct from old.activated_by
      or new.message_limit is distinct from old.message_limit
      or new.messages_received is distinct from old.messages_received
      or new.free_messages_granted is distinct from old.free_messages_granted
      or new.email_verified is distinct from old.email_verified then
      raise exception 'primary_admin_profile_is_immutable';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_primary_admin_profile() from public, anon, authenticated, service_role;
drop trigger if exists trg_protect_primary_admin_profile on public.profiles;
create trigger trg_protect_primary_admin_profile
before update or delete on public.profiles
for each row execute function public.protect_primary_admin_profile();

-- Role reads remain available to the UI; all role mutations go through trusted Edge Functions.
revoke insert, update, delete, truncate, references, trigger on table public.user_roles from public, anon, authenticated;
grant select on table public.user_roles to authenticated;

create or replace function public.confirm_plan_subscription(
  p_subscription_id uuid,
  p_actor_id uuid,
  p_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  subscription_row public.plan_subscriptions;
  plan_row public.subscription_plans;
  profile_row public.profiles;
  now_at timestamptz := now();
begin
  if not public.is_admin_or_subadmin(p_actor_id) then raise exception 'not_authorized'; end if;

  select * into subscription_row
  from public.plan_subscriptions
  where id = p_subscription_id
  for update;
  if subscription_row.id is null then raise exception 'subscription_not_found'; end if;
  if subscription_row.status = 'active' and subscription_row.expires_at > now_at then
    return jsonb_build_object('ok', true, 'status', 'active', 'already_confirmed', true, 'expires_at', subscription_row.expires_at);
  end if;
  if subscription_row.status <> 'pending' then raise exception 'subscription_not_pending'; end if;

  select * into plan_row from public.subscription_plans where id = subscription_row.plan_id;
  if plan_row.id is null then raise exception 'plan_not_found'; end if;
  select * into profile_row from public.profiles where user_id = subscription_row.user_id for update;
  if profile_row.user_id is null then raise exception 'profile_not_found'; end if;

  update public.plan_subscriptions
  set status = 'active', confirmed_at = now_at, starts_at = now_at,
      expires_at = now_at + interval '30 days', confirmed_by = p_actor_id,
      payment_reference = nullif(trim(p_reference), '')
  where id = subscription_row.id;
  update public.profiles
  set account_status = 'active', plan_id = plan_row.id,
      subscription_expires_at = now_at + interval '30 days',
      message_limit = messages_received + plan_row.monthly_messages,
      activated_at = coalesce(activated_at, now_at), activated_by = p_actor_id
  where user_id = subscription_row.user_id;
  insert into public.notifications (user_id, title, message, type, link)
  values (subscription_row.user_id, 'Plano ativado', 'O seu plano ' || plan_row.name || ' foi ativado por 30 dias.', 'plan_activated', '/dashboard');

  perform public.dispatch_email_once(
    'payment_confirmed:plan:' || subscription_row.id,
    subscription_row.user_id,
    'payment_confirmed',
    jsonb_build_object(
      'to', jsonb_build_object('email', coalesce(profile_row.email, (select email from auth.users where id = subscription_row.user_id)), 'name', coalesce(profile_row.full_name, profile_row.email, 'Cliente')),
      'template_type', 'payment_confirmed',
      'template_data', jsonb_build_object('name', coalesce(profile_row.full_name, profile_row.email, 'Cliente'), 'plan_name', plan_row.name, 'expires_at', now_at + interval '30 days')
    )
  );
  return jsonb_build_object('ok', true, 'status', 'active', 'expires_at', now_at + interval '30 days');
end;
$$;
revoke all on function public.confirm_plan_subscription(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_plan_subscription(uuid, uuid, text) to service_role;

create or replace function public.expire_trial_and_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
  profile_row record;
  subscription_row record;
  warning_type text;
  warning_title text;
  warning_message text;
  warning_key text;
  remaining_days integer;
  notice_id uuid;
begin
  for profile_row in
    select p.* from public.profiles p
    where p.account_status = 'trial'
      and not public.is_admin(p.user_id)
      and p.trial_expires_at > now()
      and p.trial_expires_at <= now() + interval '1 day'
  loop
    if profile_row.trial_expires_at > now() + interval '23 hours' then
      warning_type := 'trial_last_day';
      warning_title := 'Último dia de teste';
      warning_key := 'trial_last_day:' || profile_row.user_id;
      warning_message := 'Hoje é o último dia do seu teste. Escolha um plano para continuar a utilizar a Muwoyo.';
    else
      warning_type := 'trial_expiring_1_day';
      warning_title := 'O seu teste termina amanhã';
      warning_key := 'trial_expiring_1_day:' || profile_row.user_id;
      warning_message := 'Falta 1 dia para terminar o seu teste. Escolha um plano para continuar a utilizar a Muwoyo.';
    end if;
    if not exists (select 1 from public.notifications n where n.user_id = profile_row.user_id and n.type = warning_type) then
      insert into public.notifications (user_id, title, message, type, link)
      values (profile_row.user_id, warning_title, warning_message, warning_type, '/recargas');
      perform public.dispatch_email_once(
        warning_key, profile_row.user_id, warning_type,
        jsonb_build_object(
          'to', jsonb_build_object('email', profile_row.email, 'name', coalesce(profile_row.full_name, profile_row.email)),
          'template_type', warning_type,
          'template_data', jsonb_build_object('name', coalesce(profile_row.full_name, profile_row.email), 'days', 1)
        )
      );
    end if;
  end loop;

  for subscription_row in
    select s.id, s.user_id, s.expires_at, p.name as plan_name,
      coalesce(pr.email, u.email) as email,
      coalesce(pr.full_name, pr.email, u.email, 'Cliente') as full_name
    from public.plan_subscriptions s
    join public.subscription_plans p on p.id = s.plan_id
    join public.profiles pr on pr.user_id = s.user_id
    left join auth.users u on u.id = s.user_id
    where s.status = 'active'
      and not public.is_admin(s.user_id)
      and s.expires_at > now() - interval '1 day'
      and s.expires_at <= now() + interval '7 days'
    order by s.expires_at
  loop
    remaining_days := greatest(0, ceil(extract(epoch from (subscription_row.expires_at - now())) / 86400)::integer);
    if remaining_days in (7, 3, 2, 1, 0) then
      insert into public.plan_expiry_notices (subscription_id, days_before)
      values (subscription_row.id, remaining_days)
      on conflict (subscription_id, days_before) do nothing
      returning id into notice_id;
      if notice_id is not null then
        insert into public.notifications (user_id, title, message, type, link)
        values (
          subscription_row.user_id,
          case when remaining_days = 0 then 'O seu plano expira hoje' else 'Faltam ' || remaining_days || ' dias para a expiração do plano' end,
          case when remaining_days = 0 then 'O plano ' || subscription_row.plan_name || ' expira hoje. Renove-o para manter o acesso.' else 'O plano ' || subscription_row.plan_name || ' expira em ' || remaining_days || ' dias. Renove-o para manter o acesso.' end,
          'plan_expiring_' || remaining_days || '_days',
          '/faturacao'
        );
        perform public.dispatch_email_once(
          'plan_expiring:' || subscription_row.id || ':' || remaining_days,
          subscription_row.user_id,
          'plan_expiring',
          jsonb_build_object(
            'to', jsonb_build_object('email', subscription_row.email, 'name', subscription_row.full_name),
            'template_type', 'plan_expiring',
            'template_data', jsonb_build_object('name', subscription_row.full_name, 'plan_name', subscription_row.plan_name, 'days', remaining_days, 'expires_at', subscription_row.expires_at)
          )
        );
      end if;
    end if;
  end loop;

  update public.profiles set account_status = 'inactive'
  where account_status = 'trial' and trial_expires_at <= now() and not public.is_admin(user_id);
  get diagnostics affected = row_count;
  update public.plan_subscriptions set status = 'expired'
  where status = 'active' and expires_at <= now();
  update public.profiles p
  set account_status = 'inactive', plan_id = null, subscription_expires_at = null
  where p.account_status = 'active'
    and not public.is_admin(p.user_id)
    and p.subscription_expires_at <= now()
    and not exists (
      select 1 from public.plan_subscriptions s
      where s.user_id = p.user_id and s.status = 'active' and s.expires_at > now()
    );
  return affected;
end;
$$;
revoke all on function public.expire_trial_and_subscriptions() from public, anon, authenticated;

create or replace function public.invoke_push_dispatch(p_notification_id uuid)
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
    raise warning 'Push dispatch skipped: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in Vault';
    return;
  end if;
  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/push-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
    body := jsonb_build_object('notification_id', p_notification_id)
  );
exception when others then
  raise warning 'Push dispatch enqueue failed: %', sqlerrm;
end;
$$;
revoke all on function public.invoke_push_dispatch(uuid) from public, anon, authenticated;

alter table public.push_dispatch_queue
  add column if not exists attempts integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_error text;
update public.push_dispatch_queue
set processed = true, last_error = 'Existing queue items were not replayed during worker activation'
where not processed;
alter table public.push_dispatch_queue enable row level security;
revoke all on table public.push_dispatch_queue from public, anon, authenticated;
grant select, update on table public.push_dispatch_queue to service_role;

create or replace function public.enqueue_push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  queue_id uuid;
begin
  insert into public.push_dispatch_queue (notification_id, attempts, last_attempt_at)
  values (new.id, 1, now())
  returning id into queue_id;
  perform pg_notify('push_dispatch', new.id::text);
  perform public.invoke_push_dispatch(new.id);
  return new;
end;
$$;

create or replace function public.retry_pending_push_dispatches()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  queue_row record;
  dispatched integer := 0;
begin
  for queue_row in
    select id, notification_id
    from public.push_dispatch_queue
    where not processed
      and attempts < 10
      and (last_attempt_at is null or last_attempt_at < now() - interval '5 minutes')
    order by created_at
    for update skip locked
    limit 100
  loop
    update public.push_dispatch_queue
    set attempts = attempts + 1, last_attempt_at = now(), last_error = null
    where id = queue_row.id;
    perform public.invoke_push_dispatch(queue_row.notification_id);
    dispatched := dispatched + 1;
  end loop;
  return dispatched;
end;
$$;
revoke all on function public.retry_pending_push_dispatches() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  if not exists (select 1 from cron.job where jobname = 'retry-email-dispatches') then
    perform cron.schedule('retry-email-dispatches', '*/5 * * * *', 'select public.retry_pending_email_dispatches();');
  end if;
  if not exists (select 1 from cron.job where jobname = 'retry-push-dispatches') then
    perform cron.schedule('retry-push-dispatches', '*/5 * * * *', 'select public.retry_pending_push_dispatches();');
  end if;
  if not exists (select 1 from cron.job where jobname = 'expire-trials-and-subscriptions') then
    perform cron.schedule('expire-trials-and-subscriptions', '0 * * * *', 'select public.expire_trial_and_subscriptions();');
  end if;
exception when others then
  raise warning 'Could not schedule notification jobs: %', sqlerrm;
end;
$$;