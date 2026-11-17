-- Persist referral attribution at signup and award one commission per confirmed setup.
alter table public.profiles
  add column if not exists province text,
  add column if not exists referred_by uuid,
  add column if not exists referral_code_used text;

create index if not exists profiles_referred_by_idx
  on public.profiles(referred_by);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  referral_code text := nullif(trim(new.raw_user_meta_data->>'referral_code'), '');
  affiliate_id uuid;
begin
  if referral_code is not null then
    select id into affiliate_id
    from public.affiliate_profiles
    where upper(affiliate_code) = upper(referral_code)
    limit 1;
  end if;

  insert into public.profiles (
    user_id, email, phone, full_name, province, created_by,
    account_status, message_limit, messages_received, free_messages_granted,
    referred_by, referral_code_used
  )
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'phone',
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    nullif(new.raw_user_meta_data->>'province', ''),
    nullif(new.raw_user_meta_data->>'created_by', '')::uuid,
    'trial',
    0,
    0,
    false,
    affiliate_id,
    referral_code
  )
  on conflict (user_id) do update set
    province = coalesce(public.profiles.province, excluded.province),
    referred_by = coalesce(public.profiles.referred_by, excluded.referred_by),
    referral_code_used = coalesce(public.profiles.referral_code_used, excluded.referral_code_used);

  insert into public.user_roles (user_id, role)
  values (new.id, 'client')
  on conflict do nothing;
  return new;
end;
$$;

create or replace function public.create_affiliate_commission_for_setup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affiliate_id uuid;
begin
  if new.request_type <> 'setup'
     or new.status <> 'confirmed'
     or old.status = 'confirmed' then
    return new;
  end if;

  select referred_by into v_affiliate_id
  from public.profiles
  where user_id = new.user_id;

  if v_affiliate_id is not null and not exists (
    select 1 from public.affiliate_commissions
    where affiliate_commissions.affiliate_id = v_affiliate_id
      and affiliate_commissions.related_transaction_id = new.id::text
      and affiliate_commissions.movement_type = 'commission'
  ) then
    insert into public.affiliate_commissions (
      affiliate_id, amount_kz, movement_type, source, description, related_transaction_id
    ) values (
      v_affiliate_id, round(new.amount_kz * 0.10), 'commission', 'setup_payment',
      'Comissão pela ativação de cliente indicado', new.id::text
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_create_affiliate_commission_for_setup on public.top_up_requests;
create trigger trg_create_affiliate_commission_for_setup
after update of status on public.top_up_requests
for each row execute function public.create_affiliate_commission_for_setup();

-- Backfill referrals already saved by code, and issue missing setup commissions.
update public.profiles p
set referred_by = ap.id
from public.affiliate_profiles ap
where p.referred_by is null
  and p.referral_code_used is not null
  and upper(p.referral_code_used) = upper(ap.affiliate_code);

insert into public.affiliate_commissions (
  affiliate_id, amount_kz, movement_type, source, description, related_transaction_id
)
select p.referred_by, round(r.amount_kz * 0.10), 'commission', 'setup_payment',
      'Comissão pela ativação de cliente indicado', r.id::text
from public.top_up_requests r
join public.profiles p on p.user_id = r.user_id
where r.request_type = 'setup'
  and r.status = 'confirmed'
  and p.referred_by is not null
  and not exists (
    select 1 from public.affiliate_commissions c
    where c.affiliate_id = p.referred_by
      and c.related_transaction_id = r.id::text
      and c.movement_type = 'commission'
  );
