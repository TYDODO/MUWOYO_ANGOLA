-- Custom OTP is the source of truth for email confirmation.
alter table public.profiles
  add column if not exists email_verified boolean not null default false;

-- Preserve access for existing accounts; only new profiles remain pending.
update public.profiles
set email_verified = true
where email_verified = false
  and created_at < now();

create index if not exists profiles_email_verified_idx
  on public.profiles(email_verified);

create or replace function public.mark_email_verified(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  changed boolean;
begin
  update public.profiles
  set email_verified = true
  where user_id = p_user_id
  returning true into changed;

  if changed is null then raise exception 'profile_not_found'; end if;
  return jsonb_build_object('ok', true, 'already_verified', not changed);
end;
$$;

revoke all on function public.mark_email_verified(uuid) from public, anon, authenticated;
grant execute on function public.mark_email_verified(uuid) to service_role;
