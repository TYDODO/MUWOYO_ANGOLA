create table if not exists public.curated_voices (
  id uuid primary key default gen_random_uuid(),
  fish_reference_id text not null unique,
  display_name text not null,
  description text not null default '',
  gender text,
  language text,
  sample_audio_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint curated_voices_reference_id_valid
    check (fish_reference_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  constraint curated_voices_display_name_not_empty
    check (length(trim(display_name)) > 0)
);

create index if not exists curated_voices_active_order_idx
  on public.curated_voices (sort_order, display_name)
  where is_active;

alter table public.curated_voices enable row level security;
grant select on public.curated_voices to authenticated;

drop policy if exists curated_voices_read_active on public.curated_voices;
create policy curated_voices_read_active on public.curated_voices
  for select to authenticated
  using (is_active or public.is_admin(auth.uid()));

drop policy if exists curated_voices_admin_manage on public.curated_voices;
create policy curated_voices_admin_manage on public.curated_voices
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
