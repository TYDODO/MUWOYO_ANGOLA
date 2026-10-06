-- Automated transactional emails through Supabase Edge Functions + pg_net.
-- Configure Vault secrets before enabling production triggers:
--   SUPABASE_URL
--   SUPABASE_SERVICE_ROLE_KEY
-- The ZeptoMail secret is read only by the send-email Edge Function.

create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.email_dispatch_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  template_type text not null check (template_type in ('otp','welcome','trial_start','trial_expired','low_credits')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.email_dispatch_events enable row level security;
revoke all on table public.email_dispatch_events from anon, authenticated;
create index if not exists email_dispatch_events_user_created_idx
  on public.email_dispatch_events(user_id, created_at desc);

create or replace function public.invoke_email_edge_function(
  p_function_name text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  project_url text;
  service_key text;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'SUPABASE_URL'
  limit 1;
  select decrypted_secret into service_key
  from vault.decrypted_secrets
  where name = 'SUPABASE_SERVICE_ROLE_KEY'
  limit 1;

  if project_url is null or service_key is null then
    raise warning 'Email trigger skipped: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in Vault';
    return;
  end if;

  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/' || p_function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := p_payload
  );
exception when others then
  -- Email delivery must never roll back account creation or message consumption.
  raise warning 'Email trigger failed: %', sqlerrm;
end;
$$;
revoke all on function public.invoke_email_edge_function(text, jsonb) from public, anon, authenticated;
grant execute on function public.invoke_email_edge_function(text, jsonb) to service_role;

create or replace function public.dispatch_email_once(
  p_event_key text,
  p_user_id uuid,
  p_template_type text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  insert into public.email_dispatch_events (event_key, user_id, template_type, payload)
  values (p_event_key, p_user_id, p_template_type, p_payload)
  on conflict (event_key) do nothing
  returning id into inserted_id;

  if inserted_id is not null then
    perform public.invoke_email_edge_function('send-email', p_payload);
  end if;
end;
$$;
revoke all on function public.dispatch_email_once(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.dispatch_email_once(text, uuid, text, jsonb) to service_role;

create or replace function public.email_on_profile_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
  remaining integer;
begin
  display_name := coalesce(new.full_name, new.email, 'Cliente');
  remaining := greatest(coalesce(new.message_limit, 0) - coalesce(new.messages_received, 0), 0);

  -- OTP generation and delivery remain inside send-verification-code.
  perform public.invoke_email_edge_function(
    'send-verification-code',
    jsonb_build_object('user_id', new.user_id, 'email', new.email, 'name', display_name)
  );

  perform public.dispatch_email_once(
    'trial_start:' || new.user_id,
    new.user_id,
    'trial_start',
    jsonb_build_object(
      'to', jsonb_build_object('email', new.email, 'name', display_name),
      'template_type', 'trial_start',
      'template_data', jsonb_build_object('name', display_name, 'remaining', remaining)
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_email_on_profile_created on public.profiles;
create trigger trg_email_on_profile_created
after insert on public.profiles
for each row execute function public.email_on_profile_created();

create or replace function public.email_on_user_verified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    select coalesce(full_name, email, 'Cliente') into display_name
    from public.profiles where user_id = new.id;
    perform public.dispatch_email_once(
      'welcome:' || new.id || ':' || new.email_confirmed_at::text,
      new.id,
      'welcome',
      jsonb_build_object(
        'to', jsonb_build_object('email', new.email, 'name', coalesce(display_name, new.email)),
        'template_type', 'welcome',
        'template_data', jsonb_build_object('name', coalesce(display_name, new.email))
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_email_on_user_verified on auth.users;
create trigger trg_email_on_user_verified
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function public.email_on_user_verified();

create or replace function public.email_on_credit_boundary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_remaining integer;
  new_remaining integer;
  display_name text;
  template_name text;
  event_name text;
begin
  old_remaining := greatest(coalesce(old.message_limit, 0) - coalesce(old.messages_received, 0), 0);
  new_remaining := greatest(coalesce(new.message_limit, 0) - coalesce(new.messages_received, 0), 0);

  if new.account_status = 'trial' and old_remaining > 0 and new_remaining = 0 then
    template_name := 'trial_expired';
    event_name := 'trial_expired:' || new.user_id;
  elsif old_remaining > 5 and new_remaining between 1 and 5 then
    template_name := 'low_credits';
    event_name := 'low_credits:' || new.user_id || ':' || new_remaining;
  else
    return new;
  end if;

  select coalesce(full_name, email, 'Cliente') into display_name
  from public.profiles where user_id = new.user_id;
  perform public.dispatch_email_once(
    event_name,
    new.user_id,
    template_name,
    jsonb_build_object(
      'to', jsonb_build_object('email', new.email, 'name', coalesce(display_name, new.email)),
      'template_type', template_name,
      'template_data', jsonb_build_object('name', coalesce(display_name, new.email), 'remaining', new_remaining)
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_email_on_credit_boundary on public.profiles;
create trigger trg_email_on_credit_boundary
after update of message_limit, messages_received, account_status on public.profiles
for each row execute function public.email_on_credit_boundary();

revoke all on function public.email_on_profile_created() from public, anon, authenticated;
revoke all on function public.email_on_user_verified() from public, anon, authenticated;
revoke all on function public.email_on_credit_boundary() from public, anon, authenticated;
