-- Commercial onboarding: trial credits, setup payment and manual activation.
alter table public.profiles
  add column if not exists account_status text not null default 'trial',
  add column if not exists setup_paid_at timestamptz,
  add column if not exists setup_payment_id uuid,
  add column if not exists activated_at timestamptz,
  add column if not exists activated_by uuid references auth.users(id) on delete set null;

-- Existing customers already have access and must not be moved into the trial flow.
update public.profiles set account_status = 'active' where account_status = 'trial';

alter table public.top_up_requests
  add column if not exists request_type text not null default 'top_up',
  add column if not exists payment_reference text,
  add column if not exists confirmed_at timestamptz;

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount <> 0),
  credit_type text not null,
  reference_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.credit_ledger enable row level security;
create index if not exists credit_ledger_user_created_idx
  on public.credit_ledger(user_id, created_at desc);
create unique index if not exists credit_ledger_trial_once_idx
  on public.credit_ledger(user_id) where credit_type = 'trial';
create unique index if not exists credit_ledger_activation_once_idx
  on public.credit_ledger(user_id) where credit_type = 'activation_bonus';

create policy "credit ledger self read" on public.credit_ledger
  for select to authenticated using (auth.uid() = user_id);
create policy "credit ledger admin read" on public.credit_ledger
  for select to authenticated using (public.is_admin(auth.uid()));

create index if not exists profiles_account_status_idx
  on public.profiles(account_status);
create index if not exists top_up_requests_type_status_idx
  on public.top_up_requests(request_type, status);

create or replace function public.protect_setup_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.request_type = 'setup' and auth.role() = 'authenticated' and auth.uid() = new.user_id then
    new.messages := 0;
    new.amount_kz := 22500;
    new.package_id := null;
    new.status := 'pending';
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_setup_request on public.top_up_requests;
create trigger trg_protect_setup_request
before insert on public.top_up_requests
for each row execute function public.protect_setup_request();

create or replace function public.protect_profile_commercial_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'authenticated' and auth.uid() = old.user_id then
    if new.message_limit is distinct from old.message_limit
      or new.messages_received is distinct from old.messages_received
      or new.free_messages_granted is distinct from old.free_messages_granted
      or new.account_status is distinct from old.account_status
      or new.setup_paid_at is distinct from old.setup_paid_at
      or new.setup_payment_id is distinct from old.setup_payment_id
      or new.activated_at is distinct from old.activated_at
      or new.activated_by is distinct from old.activated_by then
      raise exception 'commercial_fields_are_server_managed';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_protect_profile_commercial_fields on public.profiles;
create trigger trg_protect_profile_commercial_fields
before update on public.profiles
for each row execute function public.protect_profile_commercial_fields();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
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
    nullif(new.raw_user_meta_data->>'created_by','')::uuid,
    'trial',
    50,
    0,
    true
  )
  on conflict (user_id) do update set
    account_status = coalesce(public.profiles.account_status, 'trial'),
    message_limit = case
      when public.profiles.message_limit = 0 then 50
      else public.profiles.message_limit
    end,
    free_messages_granted = true;

  insert into public.user_roles (user_id, role)
  values (new.id, 'client')
  on conflict do nothing;

  insert into public.credit_ledger (user_id, amount, credit_type)
  values (new.id, 50, 'trial')
  on conflict do nothing;
  return new;
end $$;

create or replace function public.request_setup_payment()
returns public.top_up_requests
language plpgsql security definer set search_path = public as $$
declare
  current_profile public.profiles;
  existing_request public.top_up_requests;
  created_request public.top_up_requests;
begin
  select * into current_profile from public.profiles
  where user_id = auth.uid() for update;
  if current_profile.user_id is null then
    raise exception 'profile_not_found';
  end if;
  if current_profile.account_status not in ('trial', 'inactive') then
    select * into existing_request from public.top_up_requests
    where user_id = auth.uid() and request_type = 'setup'
    order by created_at desc limit 1;
    return existing_request;
  end if;

  select * into existing_request from public.top_up_requests
  where user_id = auth.uid() and request_type = 'setup'
    and status in ('pending', 'confirmed')
  order by created_at desc limit 1;
  if existing_request.id is not null then return existing_request; end if;

  insert into public.top_up_requests (user_id, messages, amount_kz, status, request_type)
  values (auth.uid(), 0, 22500, 'pending', 'setup')
  returning * into created_request;
  return created_request;
end $$;

revoke all on function public.request_setup_payment() from public;
grant execute on function public.request_setup_payment() to authenticated;

create or replace function public.confirm_setup_payment(
  p_request_id uuid, p_actor_id uuid, p_payment_reference text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  request_row public.top_up_requests;
  profile_row public.profiles;
begin
  if not public.is_admin_or_subadmin(p_actor_id) then raise exception 'not_authorized'; end if;
  select * into request_row from public.top_up_requests
  where id = p_request_id and request_type = 'setup' and amount_kz = 22500 for update;
  if request_row.id is null then raise exception 'setup_request_not_found'; end if;
  if public.has_role(p_actor_id, 'sub_admin') and not exists (
    select 1 from public.profiles where user_id = request_row.user_id and created_by = p_actor_id
  ) then raise exception 'not_authorized_for_user'; end if;

  select * into profile_row from public.profiles where user_id = request_row.user_id for update;
  if request_row.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'status', 'confirmed', 'already_confirmed', true);
  end if;
  update public.top_up_requests set
    status = 'confirmed', confirmed_at = now(), approved_at = now(),
    approved_by = p_actor_id, payment_reference = nullif(trim(p_payment_reference), '')
  where id = request_row.id;
  update public.profiles set
    account_status = 'awaiting_activation', setup_paid_at = now(), setup_payment_id = request_row.id
  where user_id = request_row.user_id;
  insert into public.notifications (user_id, title, message, type, link)
  values (request_row.user_id, 'Pagamento confirmado', 'O setup foi confirmado. A sua conta aguarda ativação.', 'setup_paid', '/dashboard');
  return jsonb_build_object('ok', true, 'status', 'awaiting_activation');
end $$;

create or replace function public.activate_account(p_user_id uuid, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  profile_row public.profiles;
  ledger_row public.credit_ledger;
begin
  if not public.is_admin_or_subadmin(p_actor_id) then raise exception 'not_authorized'; end if;
  if public.has_role(p_actor_id, 'sub_admin') and not exists (
    select 1 from public.profiles where user_id = p_user_id and created_by = p_actor_id
  ) then raise exception 'not_authorized_for_user'; end if;
  select * into profile_row from public.profiles where user_id = p_user_id for update;
  if profile_row.user_id is null then raise exception 'profile_not_found'; end if;
  if profile_row.account_status = 'active' then
    return jsonb_build_object('ok', true, 'status', 'active', 'already_active', true);
  end if;
  if profile_row.account_status <> 'awaiting_activation' then
    raise exception 'account_not_awaiting_activation';
  end if;

  insert into public.credit_ledger (user_id, amount, credit_type, reference_id, created_by)
  values (p_user_id, 200, 'activation_bonus', profile_row.setup_payment_id, p_actor_id)
  on conflict do nothing returning * into ledger_row;
  if ledger_row.id is not null then
    update public.profiles set message_limit = message_limit + 200 where user_id = p_user_id;
  end if;
  update public.profiles set account_status = 'active', activated_at = coalesce(activated_at, now()), activated_by = coalesce(activated_by, p_actor_id)
  where user_id = p_user_id;
  update public.instances set automation_paused = false, automation_paused_until = null where user_id = p_user_id;
  insert into public.notifications (user_id, title, message, type, link)
  values (p_user_id, 'Conta ativada com sucesso!', 'Os seus 200 créditos de bônus foram adicionados.', 'account_activated', '/dashboard');
  return jsonb_build_object('ok', true, 'status', 'active', 'bonus_added', ledger_row.id is not null);
end $$;

revoke all on function public.confirm_setup_payment(uuid, uuid, text) from public;
revoke all on function public.activate_account(uuid, uuid) from public;
grant execute on function public.confirm_setup_payment(uuid, uuid, text) to service_role;
grant execute on function public.activate_account(uuid, uuid) to service_role;

create or replace function public.consume_ai_messages(p_user_id uuid, p_count integer default 1)
returns integer language plpgsql security definer set search_path = public as $$
declare
  profile_row public.profiles;
  remaining integer;
begin
  select * into profile_row from public.profiles where user_id = p_user_id for update;
  if profile_row.user_id is null then raise exception 'profile_not_found'; end if;
  remaining := profile_row.message_limit - profile_row.messages_received;
  if remaining < p_count then return remaining; end if;
  update public.profiles set messages_received = messages_received + p_count where user_id = p_user_id;
  return remaining - p_count;
end $$;
revoke all on function public.consume_ai_messages(uuid, integer) from public;
grant execute on function public.consume_ai_messages(uuid, integer) to service_role;
