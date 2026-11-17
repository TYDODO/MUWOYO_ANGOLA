alter table public.stores
  add column if not exists hide_store_name boolean not null default false;
