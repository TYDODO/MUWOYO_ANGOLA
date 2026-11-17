-- Trial starts on the first successful WhatsApp connection, not on signup.
alter table public.profiles
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_expires_at timestamptz;

create or replace function public.ensure_message_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ledger_id uuid;
begin
  if new.account_status = 'active' then
    insert into public.credit_ledger (user_id, amount, credit_type)
    values (new.user_id, 200, 'activation_bonus')
    on conflict do nothing
    returning id into ledger_id;

    if ledger_id is not null and new.message_limit < new.messages_received + 200 then
      new.message_limit := new.messages_received + 200;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    user_id, email, phone, full_name, created_by, account_status,
    message_limit, messages_received, free_messages_granted
  )
  values (
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
  on conflict (user_id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'client')
  on conflict do nothing;
  return new;
end;
$$;

create or replace function public.email_on_profile_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.invoke_email_edge_function(
    'send-verification-code',
    jsonb_build_object(
      'user_id', new.user_id,
      'email', new.email,
      'name', coalesce(new.full_name, new.email, 'Cliente')
    )
  );
  return new;
end;
$$;

create or replace function public.force_trial_message_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_status = 'trial' and new.trial_started_at is null then
    new.message_limit := 0;
    new.free_messages_granted := false;
  end if;
  return new;
end;
$$;

create or replace function public.release_trial_credits_after_email_verification(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object('ok', true, 'credits_added', false);
end;
$$;

create or replace function public.start_trial_on_whatsapp_connection(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row public.profiles;
  ledger_id uuid;
  started_at timestamptz;
begin
  select * into profile_row from public.profiles where user_id = p_user_id for update;
  if profile_row.user_id is null then raise exception 'profile_not_found'; end if;

  if profile_row.trial_started_at is not null then
    return jsonb_build_object('ok', true, 'started', false, 'expires_at', profile_row.trial_expires_at);
  end if;
  if profile_row.account_status <> 'trial' then
    return jsonb_build_object('ok', true, 'started', false, 'status', profile_row.account_status);
  end if;

  started_at := coalesce(profile_row.trial_started_at, now());
  insert into public.credit_ledger (user_id, amount, credit_type)
  values (p_user_id, 50, 'trial')
  on conflict do nothing
  returning id into ledger_id;

  update public.profiles
  set trial_started_at = started_at,
      trial_expires_at = started_at + interval '24 hours',
      message_limit = messages_received + 50,
      free_messages_granted = true
  where user_id = p_user_id;

  perform public.dispatch_email_once(
    'trial_start:' || p_user_id,
    p_user_id,
    'trial_start',
    jsonb_build_object(
      'to', jsonb_build_object('email', profile_row.email, 'name', coalesce(profile_row.full_name, profile_row.email)),
      'template_type', 'trial_start',
      'template_data', jsonb_build_object('name', coalesce(profile_row.full_name, profile_row.email), 'remaining', 50)
    )
  );
  insert into public.notifications (user_id, title, message, type, link)
  values (p_user_id, 'Período de teste iniciado', 'Você tem 24 horas e 50 mensagens gratuitas a partir da conexão do WhatsApp.', 'trial_start', '/dashboard');
  return jsonb_build_object('ok', true, 'started', ledger_id is not null, 'expires_at', started_at + interval '24 hours');
end;
$$;

revoke all on function public.start_trial_on_whatsapp_connection(uuid) from public, anon, authenticated;
grant execute on function public.start_trial_on_whatsapp_connection(uuid) to service_role;

create or replace function public.expire_trial_accounts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_count integer;
begin
  with expired as (
    update public.profiles
    set account_status = 'inactive'
    where account_status = 'trial'
      and trial_expires_at is not null
      and trial_expires_at <= now()
    returning user_id
  )
  select count(*)::integer into expired_count from expired;

  update public.instances i
  set automation_paused = true,
      automation_paused_until = null
  where i.user_id in (
    select p.user_id from public.profiles p
    where p.account_status = 'inactive' and p.trial_expires_at <= now()
  );
  insert into public.notifications (user_id, title, message, type, link)
  select p.user_id,
    'Período de teste terminado',
    'O seu teste terminou. Contacte o suporte para pagar o setup e continuar a utilizar a Muwoyo.',
    'trial_expired', '/recargas'
  from public.profiles p
  where p.account_status = 'inactive'
    and p.trial_expires_at <= now()
    and not exists (
      select 1 from public.notifications n
      where n.user_id = p.user_id and n.type = 'trial_expired'
    );
  return coalesce(expired_count, 0);
end;
$$;

revoke all on function public.expire_trial_accounts() from public, anon, authenticated;
grant execute on function public.expire_trial_accounts() to service_role;

do $$
begin
  create extension if not exists pg_cron;
  if not exists (select 1 from cron.job where jobname = 'expire-trial-accounts') then
    perform cron.schedule('expire-trial-accounts', '*/15 * * * *', $job$select public.expire_trial_accounts();$job$);
  end if;
exception when others then
  raise warning 'Could not schedule trial expiry: %', sqlerrm;
end;
$$;

-- Existing unstarted trials must not retain credits granted by older migrations.
update public.profiles
set message_limit = messages_received,
    free_messages_granted = false
where account_status = 'trial' and trial_started_at is null;

create or replace function public.delete_never_used_accounts()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  deleted_count integer;
begin
  with expired as (
    select user_id
    from public.profiles
    where created_at < now() - interval '30 days'
      and activity_started_at is null
      and coalesce(messages_received, 0) = 0
  ), deleted as (
    delete from auth.users where id in (select user_id from expired) returning id
  )
  select count(*)::integer into deleted_count from deleted;
  return coalesce(deleted_count, 0);
end;
$$;

create or replace function public.consume_ai_messages(p_user_id uuid, p_count integer default 1)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row public.profiles;
  remaining integer;
begin
  if p_count <= 0 then raise exception 'invalid_message_count'; end if;
  select * into profile_row from public.profiles where user_id = p_user_id for update;
  if profile_row.user_id is null then raise exception 'profile_not_found'; end if;
  remaining := greatest(profile_row.message_limit - profile_row.messages_received, 0);
  if remaining < p_count then return remaining; end if;

  update public.profiles
  set messages_received = messages_received + p_count,
      account_status = case
        when account_status = 'trial' and remaining = p_count then 'inactive'
        else account_status
      end
  where user_id = p_user_id;

  if profile_row.account_status = 'trial' and remaining = p_count then
    update public.instances set automation_paused = true where user_id = p_user_id;
    insert into public.notifications (user_id, title, message, type, link)
    select p_user_id, 'Período de teste terminado', 'As 50 mensagens foram utilizadas. Contacte o suporte para pagar o setup.', 'trial_expired', '/recargas'
    where not exists (select 1 from public.notifications where user_id = p_user_id and type = 'trial_expired');
  end if;
  return remaining - p_count;
end;
$$;

revoke all on function public.consume_ai_messages(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_messages(uuid, integer) to service_role;

-- Do not create a trial notification before WhatsApp is connected.
create or replace function public.notify_new_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, title, message, type, link)
  values (
    new.user_id,
    'Bem-vindo à Muwoyo',
    'Complete o onboarding e conecte o seu WhatsApp. O teste de 24 horas e 50 mensagens começa quando a conexão for concluída.',
    'welcome',
    '/dashboard'
  );
  return new;
end;
$$;

-- A trial also ends immediately when its last message is consumed.
create or replace function public.consume_ai_messages(p_user_id uuid, p_count integer default 1)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row public.profiles;
  remaining integer;
begin
  if p_count <= 0 then raise exception 'invalid_message_count'; end if;
  select * into profile_row from public.profiles where user_id = p_user_id for update;
  if profile_row.user_id is null then raise exception 'profile_not_found'; end if;
  remaining := greatest(profile_row.message_limit - profile_row.messages_received, 0);
  if remaining < p_count then return remaining; end if;

  update public.profiles
  set messages_received = messages_received + p_count,
      account_status = case
        when account_status = 'trial' and remaining = p_count then 'inactive'
        else account_status
      end
  where user_id = p_user_id;

  if profile_row.account_status = 'trial' and remaining = p_count then
    update public.instances set automation_paused = true where user_id = p_user_id;
  end if;
  return remaining - p_count;
end;
$$;

revoke all on function public.consume_ai_messages(uuid, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_messages(uuid, integer) to service_role;