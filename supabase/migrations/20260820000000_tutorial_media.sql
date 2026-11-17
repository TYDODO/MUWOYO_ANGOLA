alter table public.tutorial_videos
  add column if not exists subtitle text,
  add column if not exists cover_url text;

insert into storage.buckets (id, name, public)
values ('tutorial-media', 'tutorial-media', true)
on conflict (id) do update set public = true;

create policy "admins upload tutorial media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'tutorial-media'
  and public.is_admin(auth.uid())
);

create policy "admins update tutorial media"
on storage.objects for update to authenticated
using (
  bucket_id = 'tutorial-media'
  and public.is_admin(auth.uid())
)
with check (
  bucket_id = 'tutorial-media'
  and public.is_admin(auth.uid())
);

create policy "admins delete tutorial media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'tutorial-media'
  and public.is_admin(auth.uid())
);

create policy "public read tutorial media"
on storage.objects for select to public
using (bucket_id = 'tutorial-media');
