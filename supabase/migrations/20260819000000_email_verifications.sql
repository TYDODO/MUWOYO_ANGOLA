-- Email OTP verification: server-managed codes only.
create extension if not exists pgcrypto;

create table if not exists public.email_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now()
);

alter table public.email_verifications enable row level security;
create index if not exists email_verifications_user_created_idx
  on public.email_verifications(user_id, created_at desc);
create index if not exists email_verifications_expiry_idx
  on public.email_verifications(expires_at);

-- The frontend never reads or writes OTP records. Edge Functions use service_role.
revoke all on table public.email_verifications from anon, authenticated;

create or replace function public.release_trial_credits_after_email_verification(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_ledger_id uuid;
  current_profile public.profiles;
begin
  select * into current_profile
  from public.profiles
  where user_id = p_user_id
  for update;

  if current_profile.user_id is null then
    raise exception 'profile_not_found';
  end if;

  insert into public.credit_ledger (user_id, amount, credit_type)
  values (p_user_id, 50, 'trial')
  on conflict do nothing
  returning id into inserted_ledger_id;

  if inserted_ledger_id is not null then
    update public.profiles
    set message_limit = greatest(message_limit, messages_received) + 50,
        free_messages_granted = true
    where user_id = p_user_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'credits_added', inserted_ledger_id is not null
  );
end;
$$;

revoke all on function public.release_trial_credits_after_email_verification(uuid) from public, anon, authenticated;
grant execute on function public.release_trial_credits_after_email_verification(uuid) to service_role;

create or replace function public.cleanup_expired_email_verifications()
returns integer
language sql
security definer
set search_path = public
as $$
  with deleted as (
    delete from public.email_verifications
    where expires_at < now() or consumed_at is not null
    returning id
  )
  select count(*)::integer from deleted;
$$;

revoke all on function public.cleanup_expired_email_verifications() from public, anon, authenticated;
grant execute on function public.cleanup_expired_email_verifications() to service_role;
