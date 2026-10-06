create or replace function public.cancel_follow_up_after_inbound()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.direction='inbound' then
    update public.follow_up_jobs set status='cancelled' where user_id=new.user_id and status='pending' and exists(select 1 from public.whatsapp_contacts c where c.id=follow_up_jobs.contact_id and c.phone_number=new.phone_number);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_cancel_follow_up_after_inbound on public.messages;
create trigger trg_cancel_follow_up_after_inbound after insert on public.messages for each row execute function public.cancel_follow_up_after_inbound();
