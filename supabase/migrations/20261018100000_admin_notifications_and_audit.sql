create or replace function public.notify_admin_of_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_row record;
  display_name text := coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email, 'Novo utilizador');
begin
  for admin_row in select user_id from public.user_roles where role = 'admin' loop
    insert into public.notifications (user_id, title, message, type, link)
    values (admin_row.user_id, 'Novo utilizador registado', display_name || ' criou uma conta na Muwoyo.', 'admin_new_user', '/admin/utilizadores');
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_notify_admin_new_user on auth.users;
create trigger trg_notify_admin_new_user
after insert on auth.users
for each row execute function public.notify_admin_of_new_user();

create or replace function public.notify_admin_of_plan_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_row record;
  profile_name text;
  profile_email text;
  plan_name text;
  notification_title text;
  notification_message text;
  notification_type text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select p.full_name, p.email into profile_name, profile_email
  from public.profiles p where p.user_id = new.user_id;
  select sp.name into plan_name
  from public.subscription_plans sp where sp.id = new.plan_id;

  if new.status = 'pending' then
    notification_title := 'Novo comprovativo de pagamento';
    notification_message := coalesce(profile_name, profile_email, new.user_id::text) || ' enviou pagamento do plano ' || coalesce(plan_name, 'removido') || '.';
    notification_type := 'admin_payment_submitted';
  elsif new.status = 'active' then
    notification_title := 'Pagamento confirmado';
    notification_message := 'O pagamento ' || new.payment_id || ' foi confirmado.';
    notification_type := 'admin_payment_confirmed';
  elsif new.status = 'rejected' then
    notification_title := 'Pagamento rejeitado';
    notification_message := 'O pagamento ' || new.payment_id || ' foi rejeitado.';
    notification_type := 'admin_payment_rejected';
  else
    return new;
  end if;

  for admin_row in select user_id from public.user_roles where role = 'admin' loop
    insert into public.notifications (user_id, title, message, type, link)
    values (
      admin_row.user_id,
      notification_title,
      notification_message,
      notification_type,
      case when new.status = 'pending' then '/admin/comprovativos' else '/admin/pagamentos' end
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_notify_admin_plan_payment on public.plan_subscriptions;
create trigger trg_notify_admin_plan_payment
after insert or update on public.plan_subscriptions
for each row execute function public.notify_admin_of_plan_payment();

create or replace function public.admin_list_business_audit_log(p_limit integer default 250)
returns setof public.business_audit_log
language sql
stable
security definer
set search_path = public
as $$
  select log.*
  from public.business_audit_log log
  where public.is_admin(auth.uid())
  order by log.created_at desc
  limit greatest(1, least(coalesce(p_limit, 250), 1000));
$$;

revoke all on function public.admin_list_business_audit_log(integer) from public, anon;
grant execute on function public.admin_list_business_audit_log(integer) to authenticated;