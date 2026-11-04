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
    update public.profiles p
    set account_status = 'inactive'
    where p.account_status = 'trial'
      and p.trial_expires_at is not null
      and p.trial_expires_at <= now()
      and not exists (
        select 1
        from public.business_members member
        where member.user_id = p.user_id
          and member.role = 'attendant'
      )
    returning p.user_id
  )
  select count(*)::integer into expired_count from expired;

  update public.instances i
  set automation_paused = true,
      automation_paused_until = null
  where i.user_id in (
    select p.user_id from public.profiles p
    where p.account_status = 'inactive'
      and p.trial_expires_at <= now()
      and not exists (
        select 1
        from public.business_members member
        where member.user_id = p.user_id
          and member.role = 'attendant'
      )
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
      select 1
      from public.business_members member
      where member.user_id = p.user_id
        and member.role = 'attendant'
    )
    and not exists (
      select 1 from public.notifications n
      where n.user_id = p.user_id and n.type = 'trial_expired'
    );

  return coalesce(expired_count, 0);
end;
$$;

revoke all on function public.expire_trial_accounts() from public, anon, authenticated;
grant execute on function public.expire_trial_accounts() to service_role;

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
      and not exists (
        select 1
        from public.business_members member
        where member.user_id = p.user_id
          and member.role = 'attendant'
      )
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

    if not exists (
      select 1 from public.notifications n
      where n.user_id = profile_row.user_id and n.type = warning_type
    ) then
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

  update public.profiles p
  set account_status = 'inactive'
  where p.account_status = 'trial'
    and p.trial_expires_at <= now()
    and not public.is_admin(p.user_id)
    and not exists (
      select 1
      from public.business_members member
      where member.user_id = p.user_id
        and member.role = 'attendant'
    );
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
