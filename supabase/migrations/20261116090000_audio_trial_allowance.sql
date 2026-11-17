alter table public.profiles
  add column if not exists audio_trial_seconds_total numeric(12, 2) not null default 0,
  add column if not exists audio_trial_seconds_used numeric(12, 2) not null default 0;

alter table public.profiles
  drop constraint if exists profiles_audio_trial_seconds_check;
alter table public.profiles
  add constraint profiles_audio_trial_seconds_check
  check (
    audio_trial_seconds_total >= 0
    and audio_trial_seconds_used >= 0
    and audio_trial_seconds_used <= audio_trial_seconds_total
  );

alter table public.audio_send_reservations
  add column if not exists trial_seconds numeric(12, 2) not null default 0;

create or replace function public.grant_trial_audio_allowance()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.account_status = 'trial'
     and coalesce(new.audio_trial_seconds_total, 0) = 0
     and coalesce(new.audio_trial_seconds_used, 0) = 0 then
    new.audio_trial_seconds_total := 1200;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_grant_trial_audio_allowance on public.profiles;
create trigger trg_grant_trial_audio_allowance
before insert or update of account_status on public.profiles
for each row execute function public.grant_trial_audio_allowance();

update public.profiles
set audio_trial_seconds_total = 1200
where account_status = 'trial'
  and audio_trial_seconds_total = 0
  and audio_trial_seconds_used = 0;

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
  remaining_trial numeric(14, 2);
  remaining_topup numeric(14, 2);
  is_trial boolean;
  is_plan_eligible boolean;
  is_eligible boolean;
begin
  if auth.role() <> 'service_role' and (auth.uid() is null or auth.uid() <> p_user_id) then
    raise exception 'not_authorized';
  end if;
  perform public.ensure_audio_plan_period(p_user_id);
  select * into profile_row from public.profiles where user_id = p_user_id;
  select * into plan_row from public.subscription_plans where id = profile_row.plan_id;
  is_trial := profile_row.account_status = 'trial'
    and (profile_row.trial_expires_at is null or profile_row.trial_expires_at > now());
  is_plan_eligible := profile_row.account_status = 'active'
    and profile_row.subscription_expires_at > now()
    and plan_row.id is not null
    and (plan_row.audio_unlimited or plan_row.monthly_audio_seconds > 0);
  remaining_plan := greatest(0, profile_row.plan_audio_seconds_total - profile_row.plan_audio_seconds_used);
  remaining_trial := greatest(0, profile_row.audio_trial_seconds_total - profile_row.audio_trial_seconds_used);
  remaining_topup := greatest(0, profile_row.topup_audio_seconds_balance);
  is_eligible := profile_row.user_id is not null
    and profile_row.audio_enabled
    and ((is_trial and remaining_trial > 0) or (is_plan_eligible and (plan_row.audio_unlimited or remaining_plan + remaining_topup > 0)));
  return jsonb_build_object(
    'eligible', coalesce(is_eligible, false),
    'is_trial', coalesce(is_trial, false),
    'plan_name', case when is_trial then 'Teste gratuito de áudio' else plan_row.name end,
    'audio_unlimited', coalesce(plan_row.audio_unlimited and is_plan_eligible, false),
    'audio_enabled', coalesce(profile_row.audio_enabled, false),
    'plan_seconds_total', coalesce(profile_row.plan_audio_seconds_total, 0),
    'plan_seconds_used', coalesce(profile_row.plan_audio_seconds_used, 0),
    'plan_seconds_remaining', case
      when not coalesce(is_eligible, false) or is_trial then 0
      when plan_row.audio_unlimited then null
      else coalesce(remaining_plan, 0)
    end,
    'trial_seconds_total', coalesce(profile_row.audio_trial_seconds_total, 0),
    'trial_seconds_used', coalesce(profile_row.audio_trial_seconds_used, 0),
    'trial_seconds_remaining', case when is_trial then coalesce(remaining_trial, 0) else 0 end,
    'topup_seconds_balance', coalesce(profile_row.topup_audio_seconds_balance, 0),
    'total_seconds_available', case
      when not coalesce(is_eligible, false) then 0
      when is_trial then coalesce(remaining_trial, 0)
      when plan_row.audio_unlimited then null
      else coalesce(remaining_plan, 0) + coalesce(remaining_topup, 0)
    end,
    'period_ends_at', profile_row.plan_audio_period_ends_at,
    'subscription_expires_at', profile_row.subscription_expires_at,
    'max_cloned_voices', case when is_trial then 1 else coalesce(plan_row.max_cloned_voices, 0) end
  );
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
  voice_limit integer := 0;
begin
  select * into plan_row from public.subscription_plans where id = new.plan_id;
  if new.account_status = 'active'
     and new.subscription_expires_at > now()
     and plan_row.id is not null
     and (plan_row.audio_unlimited or plan_row.monthly_audio_seconds > 0) then
    new.plan_audio_seconds_total := coalesce(plan_row.monthly_audio_seconds, 0);
    new.plan_audio_seconds_used := 0;
    new.plan_audio_period_ends_at := now() + interval '1 month';
    voice_limit := plan_row.max_cloned_voices;
  else
    new.plan_audio_seconds_total := 0;
    new.plan_audio_seconds_used := 0;
    new.plan_audio_period_ends_at := null;
    if new.account_status = 'trial'
       and (new.trial_expires_at is null or new.trial_expires_at > now())
       and new.audio_enabled
       and new.audio_trial_seconds_used < new.audio_trial_seconds_total then
      voice_limit := 1;
    end if;
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
      limit voice_limit
    );
  return new;
end;
$$;

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
  voice_limit integer := 0;
  make_active boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  select * into profile_row from public.profiles where user_id = p_user_id for update;
  select * into plan_row from public.subscription_plans where id = profile_row.plan_id;
  if profile_row.account_status = 'trial'
     and (profile_row.trial_expires_at is null or profile_row.trial_expires_at > now())
     and profile_row.audio_enabled
     and profile_row.audio_trial_seconds_used < profile_row.audio_trial_seconds_total then
    voice_limit := 1;
  elsif profile_row.account_status = 'active'
     and profile_row.subscription_expires_at > now()
     and profile_row.audio_enabled
     and plan_row.id is not null
     and (plan_row.audio_unlimited or plan_row.monthly_audio_seconds > 0) then
    voice_limit := plan_row.max_cloned_voices;
  end if;
  if profile_row.user_id is null or voice_limit = 0 then raise exception 'audio_ineligible'; end if;
  select count(*) into active_count from public.audio_voice_models where user_id = p_user_id and is_active;
  make_active := active_count < voice_limit;
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
  voice_limit integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  select * into profile_row from public.profiles where user_id = p_user_id for update;
  select * into plan_row from public.subscription_plans where id = profile_row.plan_id;
  select * into voice_row from public.audio_voice_models where user_id = p_user_id and model_id = p_model_id for update;
  if voice_row.id is null then raise exception 'voice_not_found'; end if;
  if profile_row.account_status = 'trial'
     and (profile_row.trial_expires_at is null or profile_row.trial_expires_at > now())
     and profile_row.audio_enabled
     and profile_row.audio_trial_seconds_used < profile_row.audio_trial_seconds_total then
    voice_limit := 1;
  elsif profile_row.account_status = 'active'
     and profile_row.subscription_expires_at > now()
     and profile_row.audio_enabled
     and plan_row.id is not null
     and (plan_row.audio_unlimited or plan_row.monthly_audio_seconds > 0) then
    voice_limit := plan_row.max_cloned_voices;
  end if;
  if p_active and voice_limit = 0 then raise exception 'audio_ineligible'; end if;
  if p_active then
    select count(*) into active_count from public.audio_voice_models where user_id = p_user_id and is_active;
    if not voice_row.is_active and active_count >= voice_limit then raise exception 'voice_limit_reached'; end if;
  end if;
  update public.audio_voice_models set is_active = p_active, updated_at = now() where id = voice_row.id;
  return jsonb_build_object('ok', true, 'is_active', p_active);
end;
$$;

create or replace function public.set_audio_voice_configuration(
  p_user_id uuid,
  p_reference_id text,
  p_source text,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row public.profiles;
  plan_row public.subscription_plans;
  voice_limit integer := 0;
  active_count integer;
  selected_voice_id text;
  selected_source text;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_source is null or p_source not in ('cloned', 'library')
     or p_reference_id is null or length(trim(p_reference_id)) = 0 then
    raise exception 'invalid_voice_configuration';
  end if;
  select * into profile_row from public.profiles where user_id = p_user_id for update;
  select * into plan_row from public.subscription_plans where id = profile_row.plan_id;
  if profile_row.account_status = 'trial'
     and (profile_row.trial_expires_at is null or profile_row.trial_expires_at > now())
     and profile_row.audio_enabled
     and profile_row.audio_trial_seconds_used < profile_row.audio_trial_seconds_total then
    voice_limit := 1;
  elsif profile_row.account_status = 'active'
     and profile_row.subscription_expires_at > now()
     and profile_row.audio_enabled
     and plan_row.id is not null
     and (plan_row.audio_unlimited or plan_row.monthly_audio_seconds > 0) then
    voice_limit := plan_row.max_cloned_voices;
  end if;
  if profile_row.user_id is null or voice_limit = 0 then raise exception 'audio_ineligible'; end if;
  if p_source = 'cloned' and not exists (
    select 1 from public.audio_voice_models where user_id = p_user_id and model_id = p_reference_id
  ) then raise exception 'voice_not_found'; end if;
  if p_source = 'cloned' then
    select count(*) into active_count from public.audio_voice_models where user_id = p_user_id and is_active;
    if not exists (
      select 1 from public.audio_voice_models where user_id = p_user_id and model_id = p_reference_id and is_active
    ) and active_count >= voice_limit then
      select active_voice_reference_id into selected_voice_id from public.audio_voice_settings
      where user_id = p_user_id and voice_source = 'cloned';
      update public.audio_voice_models set is_active = false, updated_at = now()
      where user_id = p_user_id and model_id = selected_voice_id and is_active;
    end if;
    update public.audio_voice_models set is_active = true, updated_at = now()
    where user_id = p_user_id and model_id = p_reference_id;
  else
    select active_voice_reference_id, voice_source into selected_voice_id, selected_source
    from public.audio_voice_settings where user_id = p_user_id;
    if selected_source = 'cloned' then
      update public.audio_voice_models set is_active = false, updated_at = now()
      where user_id = p_user_id and model_id = selected_voice_id;
    end if;
  end if;
  insert into public.audio_voice_settings(user_id, active_voice_reference_id, voice_source, voice_name, updated_at)
  values (p_user_id, trim(p_reference_id), p_source, left(trim(coalesce(p_name, '')), 120), now())
  on conflict (user_id) do update
  set active_voice_reference_id = excluded.active_voice_reference_id,
      voice_source = excluded.voice_source,
      voice_name = excluded.voice_name,
      updated_at = excluded.updated_at;
  return jsonb_build_object('ok', true);
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
  has_access boolean := false;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_text_input is null or length(trim(p_text_input)) < 1 or length(p_text_input) > 500 then
    raise exception 'invalid_generation_text';
  end if;
  select * into profile_row from public.profiles where user_id = p_user_id for update;
  select * into plan_row from public.subscription_plans where id = profile_row.plan_id;
  has_access := profile_row.audio_enabled and (
    (profile_row.account_status = 'trial'
      and (profile_row.trial_expires_at is null or profile_row.trial_expires_at > now())
      and profile_row.audio_trial_seconds_used < profile_row.audio_trial_seconds_total)
    or (profile_row.account_status = 'active'
      and profile_row.subscription_expires_at > now()
      and plan_row.id is not null
      and (plan_row.audio_unlimited or plan_row.monthly_audio_seconds > 0))
  );
  if profile_row.user_id is null or not has_access then raise exception 'audio_ineligible'; end if;
  select * into voice_row from public.audio_voice_models
  where user_id = p_user_id and model_id = p_model_id and is_active for update;
  if voice_row.id is null then raise exception 'voice_not_active'; end if;
  delete from public.audio_voice_generations
  where user_id = p_user_id and voice_model_id = p_model_id
    and status = 'generating' and created_at < now() - interval '15 minutes';
  select count(*) into generation_count from public.audio_voice_generations
  where user_id = p_user_id and voice_model_id = p_model_id;
  if generation_count >= 3 then raise exception 'generation_limit_reached'; end if;
  generation_number := generation_count + 1;
  insert into public.audio_voice_generations(user_id, voice_model_id, generation_number, text_input)
  values (p_user_id, p_model_id, generation_number, trim(p_text_input))
  returning id into generation_id;
  return jsonb_build_object('id', generation_id, 'generation_number', generation_number);
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
  plan_debit numeric(14, 2) := 0;
  topup_debit numeric(14, 2) := 0;
  trial_debit numeric(14, 2) := 0;
  reservation_id uuid;
  is_trial boolean;
  is_plan_eligible boolean;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;
  if p_seconds is null or p_seconds <= 0 or p_seconds > 3600 then raise exception 'invalid_audio_duration'; end if;
  perform public.ensure_audio_plan_period(p_user_id);
  select * into profile_row from public.profiles where user_id = p_user_id for update;
  select * into plan_row from public.subscription_plans where id = profile_row.plan_id;
  is_trial := profile_row.account_status = 'trial'
    and (profile_row.trial_expires_at is null or profile_row.trial_expires_at > now())
    and profile_row.audio_trial_seconds_used < profile_row.audio_trial_seconds_total;
  is_plan_eligible := profile_row.account_status = 'active'
    and profile_row.subscription_expires_at > now()
    and plan_row.id is not null
    and (plan_row.audio_unlimited or plan_row.monthly_audio_seconds > 0);
  if profile_row.user_id is null or not profile_row.audio_enabled or (not is_trial and not is_plan_eligible) then
    return jsonb_build_object('ok', false, 'reason', 'audio_ineligible');
  end if;
  if not exists (
    select 1 from public.audio_voice_models
    where user_id = p_user_id and model_id = p_voice_model_id and is_active
  ) and not exists (
    select 1 from public.audio_voice_settings
    where user_id = p_user_id and active_voice_reference_id = p_voice_model_id and voice_source = 'library'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'voice_not_active');
  end if;
  if is_trial then
    trial_debit := p_seconds;
    if greatest(0, profile_row.audio_trial_seconds_total - profile_row.audio_trial_seconds_used) < trial_debit then
      return jsonb_build_object('ok', false, 'reason', 'audio_balance_insufficient');
    end if;
    update public.profiles set audio_trial_seconds_used = audio_trial_seconds_used + trial_debit
    where user_id = p_user_id;
  elsif plan_row.audio_unlimited then
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
  insert into public.audio_send_reservations(user_id, voice_model_id, plan_seconds, topup_seconds, trial_seconds)
  values (p_user_id, p_voice_model_id, plan_debit, topup_debit, trial_debit)
  returning id into reservation_id;
  insert into public.audio_balance_ledger(user_id, source, seconds_delta, reason, reference_id)
  select p_user_id, debit.source, -debit.amount, 'audio_send_reserved', reservation_id
  from (values ('plan'::text, plan_debit), ('topup'::text, topup_debit)) as debit(source, amount)
  where debit.amount > 0;
  return jsonb_build_object('ok', true, 'reservation_id', reservation_id, 'plan_seconds', plan_debit, 'topup_seconds', topup_debit, 'trial_seconds', trial_debit);
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
        topup_audio_seconds_balance = topup_audio_seconds_balance + reservation_row.topup_seconds,
        audio_trial_seconds_used = greatest(0, audio_trial_seconds_used - reservation_row.trial_seconds)
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

revoke all on function public.get_audio_balance(uuid) from public, anon;
revoke all on function public.register_audio_voice(uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_audio_voice_active(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.set_audio_voice_configuration(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.reserve_audio_voice_generation(uuid, text, text) from public, anon, authenticated;
revoke all on function public.reserve_audio_seconds(uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.finalize_audio_reservation(uuid, boolean) from public, anon, authenticated;
grant execute on function public.get_audio_balance(uuid) to authenticated, service_role;
grant execute on function public.register_audio_voice(uuid, text, text) to service_role;
grant execute on function public.set_audio_voice_active(uuid, text, boolean) to service_role;
grant execute on function public.set_audio_voice_configuration(uuid, text, text, text) to service_role;
grant execute on function public.reserve_audio_voice_generation(uuid, text, text) to service_role;
grant execute on function public.reserve_audio_seconds(uuid, numeric, text) to service_role;
grant execute on function public.finalize_audio_reservation(uuid, boolean) to service_role;
