-- Human handoff pauses pending follow-up jobs for the matching contact.
create or replace function public.cancel_follow_up_after_human_transfer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.transfer_status = 'on' then
    update public.follow_up_jobs
    set status = 'paused'
    where user_id = new.user_id
      and status = 'pending'
      and exists (
        select 1
        from public.whatsapp_contacts c
        where c.id = follow_up_jobs.contact_id
          and c.phone_number = regexp_replace(new.customer_phone, '\\D', '', 'g')
      );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cancel_followup_on_human_transfer on public.human_transfer_requests;
create trigger trg_cancel_followup_on_human_transfer
after insert or update of transfer_status on public.human_transfer_requests
for each row execute function public.cancel_follow_up_after_human_transfer();
