alter table public.stores
  add column if not exists logo_size integer not null default 64;

alter table public.stores
  drop constraint if exists stores_logo_size_range;
alter table public.stores
  add constraint stores_logo_size_range
  check (logo_size between 32 and 160);

alter table public.product_images
  add column if not exists media_type text not null default 'image',
  add column if not exists color text,
  add column if not exists size text;

alter table public.product_images
  drop constraint if exists product_images_media_type_valid;
alter table public.product_images
  add constraint product_images_media_type_valid
  check (media_type in ('image', 'video'));
