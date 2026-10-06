-- CRM, campaigns, follow-up and inbox layers over existing user-owned contacts/messages.
create table if not exists public.crm_stages (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null, position integer not null default 0, unique(user_id,name));
create table if not exists public.crm_contact_metadata (contact_id uuid primary key references public.whatsapp_contacts(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, stage_id uuid references public.crm_stages(id) on delete set null, owner_id uuid references auth.users(id) on delete set null, notes text, updated_at timestamptz not null default now());
create table if not exists public.crm_tags (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null, unique(user_id,name));
create table if not exists public.crm_contact_tags (contact_id uuid not null references public.whatsapp_contacts(id) on delete cascade, tag_id uuid not null references public.crm_tags(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, primary key(contact_id,tag_id));
create table if not exists public.crm_activities (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, contact_id uuid references public.whatsapp_contacts(id) on delete cascade, activity_type text not null, description text, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists public.inbox_conversations (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, contact_id uuid not null references public.whatsapp_contacts(id) on delete cascade, status text not null default 'open' check(status in ('open','closed','human')), assigned_to uuid references auth.users(id) on delete set null, unread_count integer not null default 0, last_message_at timestamptz, created_at timestamptz not null default now(), unique(user_id,contact_id));
create table if not exists public.campaigns (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null, description text, message_text text not null, status text not null default 'draft' check(status in ('draft','scheduled','processing','sending','completed','cancelled','error')), scheduled_at timestamptz, timezone text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.campaign_contacts (campaign_id uuid not null references public.campaigns(id) on delete cascade, contact_id uuid not null references public.whatsapp_contacts(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, status text not null default 'pending' check(status in ('pending','sent','delivered','read','failed','responded')), sent_at timestamptz, responded_at timestamptz, primary key(campaign_id,contact_id));
create table if not exists public.follow_up_rules (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null, delay_minutes integer not null default 120, max_attempts integer not null default 3, ai_instruction text, is_active boolean not null default false, created_at timestamptz not null default now());
create table if not exists public.follow_up_jobs (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, rule_id uuid not null references public.follow_up_rules(id) on delete cascade, contact_id uuid not null references public.whatsapp_contacts(id) on delete cascade, conversation_id uuid references public.inbox_conversations(id) on delete set null, status text not null default 'pending' check(status in ('pending','sent','cancelled','paused')), attempts integer not null default 0, due_at timestamptz not null, last_message_at timestamptz, created_at timestamptz not null default now());

insert into public.crm_stages(user_id,name,position) select p.user_id,s.name,s.position from public.profiles p cross join (values ('Novo',1),('Contactado',2),('Interessado',3),('Proposta',4),('Negociação',5),('Cliente',6),('Perdido',7)) s(name,position) where not exists(select 1 from public.crm_stages x where x.user_id=p.user_id);

create index if not exists crm_metadata_user_idx on public.crm_contact_metadata(user_id);
create index if not exists crm_activities_contact_idx on public.crm_activities(user_id,contact_id,created_at desc);
create index if not exists inbox_user_last_message_idx on public.inbox_conversations(user_id,last_message_at desc);
create index if not exists campaign_contacts_user_idx on public.campaign_contacts(user_id,campaign_id);
create index if not exists follow_up_jobs_due_idx on public.follow_up_jobs(user_id,status,due_at);

alter table public.crm_stages enable row level security; alter table public.crm_contact_metadata enable row level security; alter table public.crm_tags enable row level security; alter table public.crm_contact_tags enable row level security; alter table public.crm_activities enable row level security; alter table public.inbox_conversations enable row level security; alter table public.campaigns enable row level security; alter table public.campaign_contacts enable row level security; alter table public.follow_up_rules enable row level security; alter table public.follow_up_jobs enable row level security;

do $$ declare t text; begin for t in select unnest(array['crm_stages','crm_contact_metadata','crm_tags','crm_contact_tags','crm_activities','inbox_conversations','campaigns','campaign_contacts','follow_up_rules','follow_up_jobs']) loop execute format('create policy %I on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',t||'_tenant_policy',t); end loop; end $$;

create or replace function public.has_plan_feature(p_user_id uuid, p_feature text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from profiles p join subscription_plans s on s.id=p.plan_id where p.user_id=p_user_id and p.account_status='active' and p.subscription_expires_at>now() and (s.name='Enterprise' or (p_feature in ('campaigns','follow_up','shared_inbox') and s.name in ('Muwoyo Growth','Muwoyo Big')) or s.features ? p_feature))
$$;

create or replace function public.enforce_commercial_feature()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name='campaigns' and not public.has_plan_feature(new.user_id,'Campanhas') and not public.has_plan_feature(new.user_id,'campaigns') then raise exception 'campaigns_not_available_for_plan'; end if;
  if tg_table_name='follow_up_rules' and not public.has_plan_feature(new.user_id,'Follow Up') and not public.has_plan_feature(new.user_id,'follow_up') then raise exception 'follow_up_not_available_for_plan'; end if;
  return new;
end;
$$;
create trigger trg_campaign_plan before insert on public.campaigns for each row execute function public.enforce_commercial_feature();
create trigger trg_follow_up_plan before insert on public.follow_up_rules for each row execute function public.enforce_commercial_feature();

create or replace function public.sync_contact_to_inbox()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.inbox_conversations(user_id,contact_id,last_message_at,unread_count) values(new.user_id,new.id,new.last_message_at,1) on conflict(user_id,contact_id) do update set last_message_at=excluded.last_message_at, unread_count=inbox_conversations.unread_count+1;
  insert into public.crm_activities(user_id,contact_id,activity_type,description) values(new.user_id,new.id,'message_received','Mensagem recebida');
  return new;
end;
$$;
drop trigger if exists trg_sync_contact_inbox on public.whatsapp_contacts;
create trigger trg_sync_contact_inbox after insert or update of last_message_at on public.whatsapp_contacts for each row execute function public.sync_contact_to_inbox();

create or replace function public.cancel_follow_up_after_inbound()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.direction='inbound' then
    update public.follow_up_jobs set status='cancelled' where user_id=new.user_id and status='pending' and exists(select 1 from public.whatsapp_contacts c where c.id=follow_up_jobs.contact_id and c.phone_number=new.phone_number);
  end if;
  return new;
end;
$$;
create trigger trg_cancel_follow_up_after_inbound after insert on public.messages for each row execute function public.cancel_follow_up_after_inbound();
