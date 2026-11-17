alter table public.tutorial_videos
  add column if not exists is_intro_video boolean not null default false;

create unique index if not exists tutorial_videos_single_intro_idx
  on public.tutorial_videos (is_intro_video)
  where is_intro_video and is_published;
