alter table public.campaigns
  add column if not exists dispatch_claimed_until timestamptz;

create index if not exists campaigns_due_dispatch_idx
  on public.campaigns(status, scheduled_at, dispatch_claimed_until);

alter table public.welcome_message_configs
  add column if not exists send_order text[] not null default array['audio', 'image', 'video', 'text'];

create or replace function public.claim_campaign_dispatch(
  p_campaign_id uuid,
  p_allow_draft boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'service_role_required'; end if;

  update public.campaigns
  set status = 'sending',
      dispatch_claimed_until = now() + interval '150 seconds',
      updated_at = now()
  where id = p_campaign_id
    and (
      (status = 'scheduled' and scheduled_at <= now())
      or status in ('sending', 'processing')
      or (p_allow_draft and status in ('draft', 'error'))
    )
    and (dispatch_claimed_until is null or dispatch_claimed_until <= now())
  returning id into claimed_id;

  return claimed_id is not null;
end;
$$;
revoke all on function public.claim_campaign_dispatch(uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_campaign_dispatch(uuid, boolean) to service_role;

create or replace function public.dispatch_due_campaigns()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  project_url text;
  service_key text;
  campaign_row record;
  dispatched integer := 0;
begin
  select decrypted_secret into project_url from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
  select decrypted_secret into service_key from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
  if project_url is null or service_key is null then
    raise warning 'Campaign scheduler skipped: Supabase URL or service role key is missing in Vault';
    return 0;
  end if;

  for campaign_row in
    select campaign.id
    from public.campaigns campaign
    where (
      (campaign.status = 'scheduled' and campaign.scheduled_at <= now())
      or campaign.status in ('sending', 'processing')
    )
      and (campaign.dispatch_claimed_until is null or campaign.dispatch_claimed_until <= now())
    order by coalesce(campaign.scheduled_at, campaign.created_at), campaign.id
    limit 50
  loop
    perform net.http_post(
      url := rtrim(project_url, '/') || '/functions/v1/campaign-send',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object('campaignId', campaign_row.id, 'source', 'scheduler')
    );
    dispatched := dispatched + 1;
  end loop;

  return dispatched;
end;
$$;
revoke all on function public.dispatch_due_campaigns() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  if exists (select 1 from cron.job where jobname = 'dispatch-due-campaigns') then
    perform cron.unschedule('dispatch-due-campaigns');
  end if;
  perform cron.schedule(
    'dispatch-due-campaigns',
    '* * * * *',
    'select public.dispatch_due_campaigns();'
  );
exception when others then
  raise warning 'Could not schedule due campaigns: %', sqlerrm;
end;
$$;
