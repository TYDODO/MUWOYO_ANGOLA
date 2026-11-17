alter table public.plan_subscriptions
  add column if not exists purchase_months integer not null default 1,
  add column if not exists amount_kz numeric(14, 2) not null default 0;

alter table public.plan_subscriptions
  drop constraint if exists plan_subscriptions_purchase_months_check;

alter table public.plan_subscriptions
  add constraint plan_subscriptions_purchase_months_check
  check (purchase_months between 1 and 12);

update public.plan_subscriptions s
set amount_kz = p.price_kz * s.purchase_months
from public.subscription_plans p
where p.id = s.plan_id
  and s.amount_kz = 0;

create or replace function public.set_plan_subscription_amount()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_price numeric(14, 2);
begin
  if new.purchase_months < 1 or new.purchase_months > 12 then
    raise exception 'invalid_purchase_months';
  end if;

  if tg_op = 'UPDATE' then
    if old.status <> 'pending'
      and (new.plan_id <> old.plan_id or new.purchase_months <> old.purchase_months or new.amount_kz <> old.amount_kz) then
      raise exception 'confirmed_subscription_amount_is_immutable';
    end if;
    if old.status = 'pending'
      and new.status = 'pending'
      and new.plan_id = old.plan_id
      and new.purchase_months = old.purchase_months then
      new.amount_kz := old.amount_kz;
      return new;
    end if;
  end if;

  select price_kz into plan_price
  from public.subscription_plans
  where id = new.plan_id;

  if plan_price is null then
    raise exception 'plan_not_found';
  end if;

  new.amount_kz := plan_price * new.purchase_months;
  return new;
end;
$$;

drop trigger if exists trg_set_plan_subscription_amount on public.plan_subscriptions;
create trigger trg_set_plan_subscription_amount
before insert or update of plan_id, purchase_months, amount_kz on public.plan_subscriptions
for each row execute function public.set_plan_subscription_amount();

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
  starts_at_value timestamptz;
  expires_at_value timestamptz;
begin
  if not public.is_admin_or_subadmin(p_actor_id) then raise exception 'not_authorized'; end if;

  select * into subscription_row
  from public.plan_subscriptions
  where id = p_subscription_id
  for update;
  if subscription_row.id is null then raise exception 'subscription_not_found'; end if;
  if subscription_row.confirmed_at is not null then
    return jsonb_build_object(
      'ok', true,
      'status', subscription_row.status,
      'already_confirmed', true,
      'expires_at', subscription_row.expires_at,
      'purchase_months', subscription_row.purchase_months,
      'amount_kz', subscription_row.amount_kz
    );
  end if;
  if subscription_row.status <> 'pending' then raise exception 'subscription_not_pending'; end if;

  select * into plan_row from public.subscription_plans where id = subscription_row.plan_id;
  if plan_row.id is null then raise exception 'plan_not_found'; end if;
  select * into profile_row from public.profiles where user_id = subscription_row.user_id for update;
  if profile_row.user_id is null then raise exception 'profile_not_found'; end if;

  starts_at_value := greatest(now_at, coalesce(profile_row.subscription_expires_at, now_at));
  expires_at_value := starts_at_value + make_interval(months => subscription_row.purchase_months);

  update public.plan_subscriptions
  set status = 'active', confirmed_at = now_at, starts_at = starts_at_value,
      expires_at = expires_at_value, confirmed_by = p_actor_id,
      payment_reference = nullif(trim(p_reference), '')
  where id = subscription_row.id;
  update public.profiles
  set account_status = 'active', plan_id = plan_row.id,
      subscription_expires_at = expires_at_value,
      message_limit = messages_received + plan_row.monthly_messages,
      activated_at = coalesce(activated_at, now_at), activated_by = p_actor_id
  where user_id = subscription_row.user_id;
  insert into public.notifications (user_id, title, message, type, link)
  values (
    subscription_row.user_id,
    'Plano ativado',
    'O seu plano ' || plan_row.name || ' foi ativado por ' || subscription_row.purchase_months ||
      case when subscription_row.purchase_months = 1 then ' mês.' else ' meses.' end,
    'plan_activated',
    '/dashboard'
  );

  perform public.dispatch_email_once(
    'payment_confirmed:plan:' || subscription_row.id,
    subscription_row.user_id,
    'payment_confirmed',
    jsonb_build_object(
      'to', jsonb_build_object('email', coalesce(profile_row.email, (select email from auth.users where id = subscription_row.user_id)), 'name', coalesce(profile_row.full_name, profile_row.email, 'Cliente')),
      'template_type', 'payment_confirmed',
      'template_data', jsonb_build_object('name', coalesce(profile_row.full_name, profile_row.email, 'Cliente'), 'plan_name', plan_row.name, 'expires_at', expires_at_value)
    )
  );
  return jsonb_build_object(
    'ok', true,
    'status', 'active',
    'expires_at', expires_at_value,
    'purchase_months', subscription_row.purchase_months,
    'amount_kz', subscription_row.amount_kz
  );
end;
$$;

revoke all on function public.confirm_plan_subscription(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_plan_subscription(uuid, uuid, text) to service_role;
