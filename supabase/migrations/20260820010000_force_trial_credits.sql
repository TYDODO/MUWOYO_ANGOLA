-- A trial account always has exactly the 50-message entitlement.
create or replace function public.force_trial_message_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.account_status = 'trial' then
    new.message_limit := 50;
    new.free_messages_granted := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_force_trial_message_limit on public.profiles;
create trigger trg_force_trial_message_limit
before insert or update of account_status, message_limit, messages_received on public.profiles
for each row execute function public.force_trial_message_limit();

update public.profiles
set message_limit = 50, free_messages_granted = true
where account_status = 'trial';