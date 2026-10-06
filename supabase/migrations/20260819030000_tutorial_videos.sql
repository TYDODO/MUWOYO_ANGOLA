create table if not exists public.tutorial_videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  video_url text not null,
  position integer not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tutorial_videos enable row level security;
create index if not exists tutorial_videos_position_idx on public.tutorial_videos(position, created_at);
create policy "published tutorials are public" on public.tutorial_videos for select using (is_published = true);
create policy "admins manage tutorials" on public.tutorial_videos for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create trigger trg_tutorial_videos_updated before update on public.tutorial_videos for each row execute function public.tg_set_updated_at();
