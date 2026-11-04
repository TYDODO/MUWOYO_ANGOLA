-- Keep one durable Evolution instance per account and store the 2.3.7 sync lifecycle.
alter table public.instances
  add column if not exists automation_active boolean not null default false,
  add column if not exists connected_at timestamptz,
  add column if not exists history_sync_status text not null default 'pending'
    check (history_sync_status in ('pending', 'syncing', 'completed', 'failed')),
  add column if not exists history_sync_progress integer not null default 0
    check (history_sync_progress between 0 and 100),
  add column if not exists history_sync_started_at timestamptz,
  add column if not exists history_sync_completed_at timestamptz,
  add column if not exists last_sync_at timestamptz;

-- Reconcile duplicate rows before restoring the account-level uniqueness. The
-- connected row wins; otherwise preserve the oldest row as the logical identity.
do $$
declare
  account record;
  canonical record;
  duplicate record;
begin
  for account in
    select user_id from public.instances group by user_id having count(*) > 1
  loop
    select * into canonical
    from public.instances
    where user_id = account.user_id
    order by (status = 'connected') desc,
      (connection_state in ('connected', 'open')) desc,
      last_connected_at desc nulls last,
      created_at asc
    limit 1;

    for duplicate in
      select id, instance_name from public.instances
      where user_id = account.user_id and id <> canonical.id
    loop
      update public.whatsapp_contacts
      set whatsapp_instance_id = canonical.id,
          instance_name = canonical.instance_name
      where whatsapp_instance_id = duplicate.id;
      update public.inbox_conversations
      set whatsapp_instance_id = canonical.id,
          instance_name = canonical.instance_name
      where whatsapp_instance_id = duplicate.id;
      update public.messages
      set whatsapp_instance_uuid = canonical.id,
          whatsapp_instance_id = canonical.instance_name
      where whatsapp_instance_uuid = duplicate.id;
      update public.campaigns
      set whatsapp_instance_id = canonical.id
      where whatsapp_instance_id = duplicate.id;
      update public.follow_up_rules
      set whatsapp_instance_id = canonical.id
      where whatsapp_instance_id = duplicate.id;
      update public.follow_up_jobs
      set whatsapp_instance_id = canonical.id
      where whatsapp_instance_id = duplicate.id;
      update public.blocked_contacts
      set instance_name = canonical.instance_name
      where user_id = account.user_id and instance_name = duplicate.instance_name;
      delete from public.instances where id = duplicate.id;
    end loop;
  end loop;
end $$;

create unique index if not exists instances_user_id_unique
  on public.instances(user_id);

create index if not exists instances_sync_status_idx
  on public.instances(user_id, history_sync_status, history_sync_progress);
