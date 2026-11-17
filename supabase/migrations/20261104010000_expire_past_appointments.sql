drop function if exists public.update_expired_appointments();

create function public.update_expired_appointments()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_count integer;
begin
  update public.appointments
  set status = 'expired',
      updated_at = now()
  where scheduled_at < now()
    and status in ('pending', 'confirmed')
    and (auth.uid() is null or user_id = auth.uid());

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

revoke all on function public.update_expired_appointments() from public, anon;
grant execute on function public.update_expired_appointments() to authenticated, service_role;

do $$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'expire-past-appointments') then
    perform cron.unschedule('expire-past-appointments');
  end if;
  perform cron.schedule(
    'expire-past-appointments',
    '* * * * *',
    'select public.update_expired_appointments();'
  );
exception when others then
  raise warning 'Could not schedule appointment expiration: %', sqlerrm;
end;
$$;
