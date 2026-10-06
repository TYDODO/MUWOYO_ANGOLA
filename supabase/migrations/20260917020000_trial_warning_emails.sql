-- Send email notices alongside in-app notifications before trial expiry.
create or replace function public.expire_trial_and_subscriptions()
returns integer language plpgsql security definer set search_path = public as $$
declare
  affected integer := 0;
  profile_row record;
  warning_type text;
  warning_title text;
  warning_message text;
  warning_key text;
begin
  for profile_row in
    select p.* from public.profiles p
    where p.account_status = 'trial'
      and p.trial_expires_at > now()
      and p.trial_expires_at <= now() + interval '1 day'
  loop
    if profile_row.trial_expires_at > now() + interval '23 hours' then
      warning_type := 'trial_last_day'; warning_title := 'Último dia de teste'; warning_key := 'trial_last_day:' || profile_row.user_id;
      warning_message := 'Hoje é o último dia do seu teste. Escolha um plano para continuar a utilizar a Muwoyo.';
    else
      warning_type := 'trial_expiring_1_day'; warning_title := 'O seu teste termina amanhã'; warning_key := 'trial_expiring_1_day:' || profile_row.user_id;
      warning_message := 'Falta 1 dia para terminar o seu teste. Escolha um plano para continuar a utilizar a Muwoyo.';
    end if;
    if not exists (select 1 from public.notifications n where n.user_id = profile_row.user_id and n.type = warning_type) then
      insert into public.notifications (user_id, title, message, type, link) values (profile_row.user_id, warning_title, warning_message, warning_type, '/recargas');
      perform public.dispatch_email_once(warning_key, profile_row.user_id, warning_type, jsonb_build_object('to', jsonb_build_object('email', profile_row.email, 'name', coalesce(profile_row.full_name, profile_row.email)), 'template_type', warning_type, 'template_data', jsonb_build_object('name', coalesce(profile_row.full_name, profile_row.email), 'days', 1)));
    end if;
  end loop;
  update public.profiles set account_status = 'inactive' where account_status = 'trial' and trial_expires_at <= now();
  get diagnostics affected = row_count;
  update public.plan_subscriptions set status = 'expired' where status = 'active' and expires_at <= now();
  update public.profiles p set account_status = 'inactive', plan_id = null, subscription_expires_at = null
  where p.account_status = 'active' and p.subscription_expires_at <= now()
    and not exists (select 1 from public.plan_subscriptions s where s.user_id = p.user_id and s.status = 'active' and s.expires_at > now());
  return affected;
end;
$$;
