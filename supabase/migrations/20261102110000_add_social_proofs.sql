create table if not exists public.social_proofs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  proof_type text not null check (proof_type in ('product', 'service')),
  product_id uuid references public.products(id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  description text not null check (length(btrim(description)) > 0),
  media_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint social_proofs_product_type_check check (
    (proof_type = 'product' and product_id is not null)
    or (proof_type = 'service' and product_id is null)
  )
);

alter table public.social_proofs enable row level security;
create index if not exists social_proofs_owner_active_idx
  on public.social_proofs (user_id, is_active, proof_type, product_id);
create index if not exists social_proofs_search_idx
  on public.social_proofs using gin (to_tsvector('portuguese', title || ' ' || description));

create or replace function public.validate_social_proof_product_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.proof_type = 'product' and not exists (
    select 1 from public.products p
    where p.id = new.product_id and p.user_id = new.user_id
  ) then
    raise exception 'The selected product must belong to the social proof owner';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_social_proof_product_owner on public.social_proofs;
create trigger validate_social_proof_product_owner
  before insert or update of user_id, proof_type, product_id on public.social_proofs
  for each row execute function public.validate_social_proof_product_owner();

drop policy if exists "Owners read their social proofs" on public.social_proofs;
create policy "Owners read their social proofs" on public.social_proofs
  for select using (auth.uid() = user_id);

drop policy if exists "Owners insert their social proofs" on public.social_proofs;
create policy "Owners insert their social proofs" on public.social_proofs
  for insert with check (
    auth.uid() = user_id
    and (proof_type = 'service' or exists (
      select 1 from public.products p
      where p.id = product_id and p.user_id = auth.uid()
    ))
  );

drop policy if exists "Owners update their social proofs" on public.social_proofs;
create policy "Owners update their social proofs" on public.social_proofs
  for update using (auth.uid() = user_id) with check (
    auth.uid() = user_id
    and (proof_type = 'service' or exists (
      select 1 from public.products p
      where p.id = product_id and p.user_id = auth.uid()
    ))
  );

drop policy if exists "Owners delete their social proofs" on public.social_proofs;
create policy "Owners delete their social proofs" on public.social_proofs
  for delete using (auth.uid() = user_id);

create or replace function public.match_social_proofs(
  _user_id uuid,
  _query text,
  _context text,
  _product_id uuid default null,
  _limit integer default 5
)
returns table (
  id uuid,
  proof_type text,
  product_id uuid,
  title text,
  description text,
  media_url text,
  relevance real
)
language sql
stable
security definer
set search_path = public
as $$
  with search_query as (
    select websearch_to_tsquery('portuguese', coalesce(_query, '')) as query
  )
  select
    proof.id,
    proof.proof_type,
    proof.product_id,
    proof.title,
    proof.description,
    proof.media_url,
    ts_rank(
      to_tsvector('portuguese', proof.title || ' ' || proof.description),
      search_query.query
    ) as relevance
  from public.social_proofs proof
  cross join search_query
  where proof.user_id = _user_id
    and proof.is_active
    and (auth.uid() is null or auth.uid() = _user_id)
    and (
      (_context = 'product' and (
        (proof.proof_type = 'product' and _product_id is not null and proof.product_id = _product_id)
        or proof.proof_type = 'service'
      ))
      or (_context in ('service', 'company') and proof.proof_type = 'service')
    )
    and (numnode(search_query.query) = 0 or to_tsvector('portuguese', proof.title || ' ' || proof.description) @@ search_query.query)
  order by
    case when _context = 'product' and proof.proof_type = 'product' and proof.product_id = _product_id then 0 else 1 end,
    relevance desc,
    proof.created_at desc
  limit least(greatest(coalesce(_limit, 5), 1), 20);
$$;

revoke all on function public.match_social_proofs(uuid, text, text, uuid, integer) from public;
grant execute on function public.match_social_proofs(uuid, text, text, uuid, integer) to authenticated, service_role;

notify pgrst, 'reload schema';