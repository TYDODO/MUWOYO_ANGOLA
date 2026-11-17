create table if not exists public.audio_voice_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_voice_reference_id text,
  voice_source text check (voice_source in ('cloned', 'library')),
  voice_name text,
  voice_tuning jsonb not null default '{"prosody":{"speed":1,"volume":0},"temperature":0.7,"top_p":0.7,"chunk_length":200,"normalize":true}'::jsonb,
  updated_at timestamptz not null default now(),
  check (
    (active_voice_reference_id is null and voice_source is null)
    or (active_voice_reference_id is not null and voice_source is not null)
  )
);

alter table public.audio_voice_settings enable row level security;
grant select on public.audio_voice_settings to authenticated;
drop policy if exists audio_voice_settings_owner_read on public.audio_voice_settings;
create policy audio_voice_settings_owner_read on public.audio_voice_settings
  for select to authenticated using (user_id = auth.uid() or public.is_admin(auth.uid()));

insert into public.audio_voice_settings(user_id, active_voice_reference_id, voice_source, voice_name)
select distinct on (voice.user_id)
  voice.user_id, voice.model_id, 'cloned', voice.title
from public.audio_voice_models voice
where voice.is_active
order by voice.user_id, voice.updated_at desc, voice.created_at desc
on conflict (user_id) do nothing;

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
  if profile_row.user_id is null or not profile_row.audio_enabled
     or profile_row.account_status <> 'active' or profile_row.subscription_expires_at <= now()
     or plan_row.id is null or (not plan_row.audio_unlimited and plan_row.monthly_audio_seconds <= 0) then
    raise exception 'audio_ineligible';
  end if;

  if p_source = 'cloned' and not exists (
    select 1 from public.audio_voice_models
    where user_id = p_user_id and model_id = p_reference_id
  ) then
    raise exception 'voice_not_found';
  end if;

  if p_source = 'cloned' then
    select count(*) into active_count
    from public.audio_voice_models where user_id = p_user_id and is_active;
    if not exists (
      select 1 from public.audio_voice_models
      where user_id = p_user_id and model_id = p_reference_id and is_active
    ) and active_count >= plan_row.max_cloned_voices then
      select active_voice_reference_id into selected_voice_id
      from public.audio_voice_settings
      where user_id = p_user_id and voice_source = 'cloned';
      update public.audio_voice_models
      set is_active = false, updated_at = now()
      where user_id = p_user_id and model_id = selected_voice_id and is_active;
      select count(*) into active_count
      from public.audio_voice_models where user_id = p_user_id and is_active;
      if active_count >= plan_row.max_cloned_voices then raise exception 'voice_limit_reached'; end if;
    end if;
    update public.audio_voice_models
    set is_active = true, updated_at = now()
    where user_id = p_user_id and model_id = p_reference_id;
  else
    select active_voice_reference_id, voice_source into selected_voice_id, selected_source
    from public.audio_voice_settings where user_id = p_user_id;
    if selected_source = 'cloned' then
      update public.audio_voice_models
      set is_active = false, updated_at = now()
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

revoke all on function public.set_audio_voice_configuration(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.set_audio_voice_configuration(uuid, text, text, text) to service_role;

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
  if not exists (
    select 1 from public.audio_voice_models
    where user_id = p_user_id and model_id = p_voice_model_id and is_active
  ) and not exists (
    select 1 from public.audio_voice_settings
    where user_id = p_user_id
      and active_voice_reference_id = p_voice_model_id
      and voice_source = 'library'
  ) then
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

revoke all on function public.reserve_audio_seconds(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.reserve_audio_seconds(uuid, numeric, text) to service_role;
