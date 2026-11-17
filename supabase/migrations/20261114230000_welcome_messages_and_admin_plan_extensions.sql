create table if not exists public.welcome_message_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  instance_id uuid not null unique references public.instances(id) on delete cascade,
  enabled boolean not null default false,
  text_message text,
  audio_url text,
  audio_mimetype text,
  image_url text,
  image_mimetype text,
  video_url text,
  video_mimetype text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint welcome_message_text_length check (text_message is null or length(text_message) <= 4000)
);

alter table public.welcome_message_configs enable row level security;
grant select, insert, update, delete on public.welcome_message_configs to authenticated;

drop policy if exists welcome_message_configs_owner_read on public.welcome_message_configs;
create policy welcome_message_configs_owner_read
on public.welcome_message_configs for select to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.instances instance
    where instance.id = instance_id and instance.user_id = auth.uid()
  )
);

drop policy if exists welcome_message_configs_owner_insert on public.welcome_message_configs;
create policy welcome_message_configs_owner_insert
on public.welcome_message_configs for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.instances instance
    where instance.id = instance_id and instance.user_id = auth.uid()
  )
);

drop policy if exists welcome_message_configs_owner_update on public.welcome_message_configs;
create policy welcome_message_configs_owner_update
on public.welcome_message_configs for update to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.instances instance
    where instance.id = instance_id and instance.user_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.instances instance
    where instance.id = instance_id and instance.user_id = auth.uid()
  )
);

drop policy if exists welcome_message_configs_owner_delete on public.welcome_message_configs;
create policy welcome_message_configs_owner_delete
on public.welcome_message_configs for delete to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1 from public.instances instance
    where instance.id = instance_id and instance.user_id = auth.uid()
  )
);

create table if not exists public.welcome_message_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  instance_id uuid not null references public.instances(id) on delete cascade,
  remote_jid text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivery_status text not null default 'reserved'
    check (delivery_status in ('reserved', 'sent', 'partial', 'failed')),
  delivery_result jsonb not null default '[]'::jsonb,
  unique (instance_id, remote_jid)
);

alter table public.welcome_message_history enable row level security;
revoke all on public.welcome_message_history from public, anon, authenticated;
grant select, insert, update on public.welcome_message_history to service_role;

create or replace function public.admin_extend_user_plan(
  p_user_id uuid,
  p_months integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile public.profiles;
  extended_until timestamptz;
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then
    raise exception 'admin_required';
  end if;
  if p_months is null or p_months < 1 or p_months > 12 then
    raise exception 'invalid_months';
  end if;

  select * into target_profile
  from public.profiles
  where user_id = p_user_id
  for update;
  if not found or target_profile.plan_id is null then
    raise exception 'user_has_no_plan';
  end if;
  if coalesce(target_profile.is_suspended, false) or target_profile.status = 'suspended' then
    raise exception 'user_suspended';
  end if;

  extended_until := greatest(coalesce(target_profile.subscription_expires_at, now()), now())
    + make_interval(months => p_months);

  update public.profiles
  set subscription_expires_at = extended_until,
      account_status = 'active'
  where user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'user_id', p_user_id,
    'months_added', p_months,
    'expires_at', extended_until
  );
end;
$$;

revoke all on function public.admin_extend_user_plan(uuid, integer) from public, anon;
grant execute on function public.admin_extend_user_plan(uuid, integer) to authenticated;
