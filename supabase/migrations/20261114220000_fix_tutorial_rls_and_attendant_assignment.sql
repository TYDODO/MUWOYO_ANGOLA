drop policy if exists "admins manage tutorials" on public.tutorial_videos;
drop policy if exists "admins and subadmins manage tutorials" on public.tutorial_videos;
create policy "admins and subadmins manage tutorials"
on public.tutorial_videos
for all to authenticated
using (public.is_admin_or_subadmin(auth.uid()))
with check (public.is_admin_or_subadmin(auth.uid()));

drop policy if exists "admins upload tutorial media" on storage.objects;
drop policy if exists "admins update tutorial media" on storage.objects;
drop policy if exists "admins delete tutorial media" on storage.objects;
drop policy if exists "admins and subadmins upload tutorial media" on storage.objects;
drop policy if exists "admins and subadmins update tutorial media" on storage.objects;
drop policy if exists "admins and subadmins delete tutorial media" on storage.objects;

create policy "admins and subadmins upload tutorial media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'tutorial-media'
  and public.is_admin_or_subadmin(auth.uid())
);

create policy "admins and subadmins update tutorial media"
on storage.objects for update to authenticated
using (
  bucket_id = 'tutorial-media'
  and public.is_admin_or_subadmin(auth.uid())
)
with check (
  bucket_id = 'tutorial-media'
  and public.is_admin_or_subadmin(auth.uid())
);

create policy "admins and subadmins delete tutorial media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'tutorial-media'
  and public.is_admin_or_subadmin(auth.uid())
);

create or replace function public.auto_assign_new_inbox_conversation()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  business_id_value uuid;
  previous_assignee uuid;
  next_assignee uuid;
  assigned_count integer;
  max_attendants integer;
begin
  if new.assigned_to is not null or new.response_mode <> 'ai' then
    return new;
  end if;

  select id into business_id_value
  from public.businesses
  where owner_id = new.user_id;
  if business_id_value is null or not public.has_plan_feature(new.user_id, 'shared_inbox') then
    return new;
  end if;

  select case plan.name
    when 'Muwoyo Growth' then 3
    when 'Muwoyo Big' then 10
    when 'Enterprise' then 2147483647
    else 0
  end into max_attendants
  from public.profiles profile
  left join public.subscription_plans plan on plan.id = profile.plan_id
  where profile.user_id = new.user_id;
  if coalesce(max_attendants, 0) = 0 then
    return new;
  end if;

  perform pg_advisory_xact_lock(0, hashtext(new.user_id::text));
  select last_attendant_user_id into previous_assignee
  from private.attendant_assignment_cursor
  where business_id = business_id_value;

  select count(distinct assigned_to)::integer into assigned_count
  from public.inbox_conversations
  where user_id = new.user_id
    and assigned_to is not null
    and assigned_to <> new.user_id;

  select member.user_id into next_assignee
  from public.business_members member
  join public.business_member_permissions can_view
    on can_view.member_id = member.id
   and can_view.permission = 'inbox.view'
   and can_view.enabled
  join public.business_member_permissions can_send
    on can_send.member_id = member.id
   and can_send.permission = 'inbox.send'
   and can_send.enabled
  where member.business_id = business_id_value
    and member.role = 'attendant'
    and member.status = 'active'
    and (
      coalesce(assigned_count, 0) < max_attendants
      or exists (
        select 1 from public.inbox_conversations existing
        where existing.user_id = new.user_id and existing.assigned_to = member.user_id
      )
    )
  order by case when previous_assignee is null or member.user_id > previous_assignee then 0 else 1 end,
    member.created_at,
    member.user_id
  limit 1;

  if next_assignee is null then
    return new;
  end if;

  new.assigned_to := next_assignee;
  new.response_mode := 'human';
  new.status := 'human';
  insert into private.attendant_assignment_cursor(business_id, last_attendant_user_id, updated_at)
  values (business_id_value, next_assignee, now())
  on conflict (business_id) do update
  set last_attendant_user_id = excluded.last_attendant_user_id,
      updated_at = excluded.updated_at;
  return new;
end;
$$;
