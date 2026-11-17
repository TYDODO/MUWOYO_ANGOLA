create table if not exists public.inbox_history_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  instance_name text not null,
  remote_jid text not null,
  phone_number text not null,
  cursor_page integer not null default 1 check (cursor_page > 0),
  target_last_message_at timestamptz not null,
  last_synced_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, instance_name, remote_jid)
);

create index if not exists inbox_history_sync_pending_idx
  on public.inbox_history_sync_jobs(instance_name, status, updated_at);

alter table public.inbox_history_sync_jobs enable row level security;
drop policy if exists inbox_history_sync_owner_read on public.inbox_history_sync_jobs;
create policy inbox_history_sync_owner_read
  on public.inbox_history_sync_jobs for select to authenticated
  using (auth.uid() = user_id);

create or replace function public.set_inbox_history_sync_job_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_inbox_history_sync_job_updated_at on public.inbox_history_sync_jobs;
create trigger trg_inbox_history_sync_job_updated_at
  before update on public.inbox_history_sync_jobs
  for each row execute function public.set_inbox_history_sync_job_updated_at();