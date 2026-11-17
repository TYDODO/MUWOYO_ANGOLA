-- Apply the trial exception as a new migration because applied migrations are immutable.
create or replace function public.enforce_plan_entitlements()
returns trigger language plpgsql security definer set search_path = public as $$
declare plan_name text;
begin
  select sp.name into plan_name from public.profiles p join public.subscription_plans sp on sp.id = p.plan_id where p.user_id = new.user_id and p.account_status = 'active' and coalesce(p.subscription_expires_at, now()) > now();
  if plan_name is null then select case when p.account_status = 'trial' and p.trial_expires_at > now() then 'Muwoyo Start' end into plan_name from public.profiles p where p.user_id = new.user_id; end if;
  if plan_name is null then raise exception 'active_plan_required'; end if;
  if new.custom_domain is distinct from old.custom_domain and plan_name not in ('Muwoyo Big', 'Enterprise') then raise exception 'custom_domain_not_available_for_plan'; end if;
  return new;
end;
$$;

create or replace function public.enforce_product_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare plan_name text; product_limit integer; current_products integer;
begin
  select sp.name into plan_name from public.profiles p join public.subscription_plans sp on sp.id = p.plan_id where p.user_id = new.user_id and p.account_status = 'active' and coalesce(p.subscription_expires_at, now()) > now();
  if plan_name is null then select case when p.account_status = 'trial' and p.trial_expires_at > now() then 'Muwoyo Start' end into plan_name from public.profiles p where p.user_id = new.user_id; end if;
  if plan_name is null then raise exception 'active_plan_required'; end if;
  product_limit := case plan_name when 'Muwoyo Start' then 50 when 'Muwoyo Growth' then 150 when 'Muwoyo Big' then 500 else 2147483647 end;
  select count(*)::integer into current_products from public.products where user_id = new.user_id;
  if current_products >= product_limit then raise exception 'product_limit_reached:%', product_limit; end if;
  return new;
end;
$$;
