-- Remove only accounts created 30 days ago that never performed any activity.
-- Any tracked activity permanently protects the account from this cleanup rule.
alter table public.profiles
  add column if not exists activity_started_at timestamptz;

create or replace function public.mark_profile_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set activity_started_at = coalesce(activity_started_at, now())
  where user_id = coalesce(new.user_id, old.user_id);
  return new;
end;
$$;

drop trigger if exists trg_messages_mark_profile_activity on public.messages;
create trigger trg_messages_mark_profile_activity
after insert on public.messages
for each row execute function public.mark_profile_activity();

drop trigger if exists trg_instances_mark_profile_activity on public.instances;
create trigger trg_instances_mark_profile_activity
after insert or update of phone_number, status, connection_state on public.instances
for each row execute function public.mark_profile_activity();

drop trigger if exists trg_top_up_mark_profile_activity on public.top_up_requests;
create trigger trg_top_up_mark_profile_activity
after insert on public.top_up_requests
for each row execute function public.mark_profile_activity();

create or replace function public.delete_never_used_accounts()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  deleted_count integer;
begin
  with expired as (
    select user_id
    from public.profiles
    where created_at < now() - interval '90 days'
      and activity_started_at is null
      and coalesce(messages_received, 0) = 0
  ), deleted as (
    delete from auth.users
    where id in (select user_id from expired)
    returning id
  )
  select count(*)::integer into deleted_count from deleted;
  return coalesce(deleted_count, 0);
end;
$$;

revoke all on function public.delete_never_used_accounts() from public, anon, authenticated;
grant execute on function public.delete_never_used_accounts() to service_role;

do $$
begin
  create extension if not exists pg_cron;
  if not exists (select 1 from cron.job where jobname = 'delete-never-used-accounts') then
    perform cron.schedule('delete-never-used-accounts', '15 2 * * *', $job$select public.delete_never_used_accounts();$job$);
  end if;
exception when others then
  raise warning 'Could not schedule inactive account cleanup: %', sqlerrm;
end;
$$;
