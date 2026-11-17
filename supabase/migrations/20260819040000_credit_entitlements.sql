-- Keep message entitlements consistent with the commercial account status.
create or replace function public.ensure_message_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ledger_id uuid;
begin
  if new.account_status = 'trial' then
    insert into public.credit_ledger (user_id, amount, credit_type)
    values (new.user_id, 50, 'trial')
    on conflict do nothing
    returning id into ledger_id;

    if ledger_id is not null and new.message_limit < new.messages_received + 50 then
      new.message_limit := new.messages_received + 50;
    end if;
    new.free_messages_granted := true;
  elsif new.account_status = 'active' then
    insert into public.credit_ledger (user_id, amount, credit_type)
    values (new.user_id, 200, 'activation_bonus')
    on conflict do nothing
    returning id into ledger_id;

    if ledger_id is not null and new.message_limit < new.messages_received + 200 then
      new.message_limit := new.messages_received + 200;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profile_message_entitlement on public.profiles;
create trigger trg_profile_message_entitlement
before insert or update of account_status on public.profiles
for each row execute function public.ensure_message_entitlement();

-- Repair existing rows once while preserving any higher manual balance.
insert into public.credit_ledger (user_id, amount, credit_type)
select user_id, case when account_status = 'active' then 200 else 50 end,
       case when account_status = 'active' then 'activation_bonus' else 'trial' end
from public.profiles
where account_status in ('trial', 'active')
on conflict do nothing;

update public.profiles
set message_limit = greatest(
  message_limit,
  messages_received + case when account_status = 'active' then 200 else 50 end
),
free_messages_granted = case when account_status = 'trial' then true else free_messages_granted end
where account_status in ('trial', 'active');