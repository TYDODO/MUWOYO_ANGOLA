create table if not exists public.inbox_contact_presence (
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_number text not null,
  state text not null default 'offline' check (state in ('offline', 'online', 'typing', 'recording')),
  updated_at timestamptz not null default now(),
  primary key (user_id, phone_number)
);

alter table public.inbox_contact_presence enable row level security;
drop policy if exists inbox_contact_presence_user_policy on public.inbox_contact_presence;
create policy inbox_contact_presence_user_policy on public.inbox_contact_presence
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
alter table public.inbox_contact_presence replica identity full;
