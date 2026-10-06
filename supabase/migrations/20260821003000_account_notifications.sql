-- Welcome and trial notifications are created by the database so signup does not
-- depend on a client-side insert or on RLS permissions.
create or replace function public.notify_new_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.account_status, 'trial') = 'trial' then
    insert into public.notifications (user_id, title, message, type, link)
    values
      (new.user_id, 'Bem-vindo à Muwoyo', 'A sua conta foi criada com sucesso. Complete o onboarding para começar.', 'welcome', '/dashboard'),
      (new.user_id, 'Período de teste iniciado', 'Tem 50 mensagens gratuitas para testar a automação. Quando terminarem, ative a sua conta para continuar.', 'trial_start', '/dashboard');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_new_account on public.profiles;
create trigger trg_notify_new_account
after insert on public.profiles
for each row execute function public.notify_new_account();
