drop policy if exists business_members_self_or_owner_read on public.business_members;
create policy business_members_self_or_owner_read on public.business_members
for select to authenticated
using (
  user_id = auth.uid()
  or business_id = public.current_business_id()
);

drop policy if exists business_permissions_self_or_owner_read on public.business_member_permissions;
create policy business_permissions_self_or_owner_read on public.business_member_permissions
for select to authenticated
using (
  business_id = public.current_business_id()
  or exists (
    select 1
    from public.business_members member
    where member.id = business_member_permissions.member_id
      and member.user_id = auth.uid()
  )
);
