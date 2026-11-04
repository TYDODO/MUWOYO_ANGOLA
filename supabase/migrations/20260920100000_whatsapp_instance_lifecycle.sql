-- Preserve disconnected WhatsApp identities and make lifecycle state explicit.
alter table public.instances
  add column if not exists disconnected_at timestamptz;

-- The old one-instance-per-user index would reject a second WhatsApp number.
drop index if exists public.instances_user_id_unique;

create index if not exists instances_user_lifecycle_idx
  on public.instances(user_id, status, created_at desc);

create or replace function public.mark_instance_disconnected(p_instance_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.instances
  set connection_state = 'disconnected',
      evolution_state = 'close',
      status = 'disconnected',
      disconnected_at = now(),
      qr_code = null
  where id = p_instance_id;
$$;

revoke all on function public.mark_instance_disconnected(uuid) from public, anon, authenticated;
