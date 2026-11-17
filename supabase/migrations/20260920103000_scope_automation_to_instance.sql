-- Keep campaign and follow-up automation tied to the WhatsApp identity that created it.
alter table public.campaigns
  add column if not exists whatsapp_instance_id uuid references public.instances(id) on delete set null;

alter table public.follow_up_rules
  add column if not exists whatsapp_instance_id uuid references public.instances(id) on delete set null;

alter table public.follow_up_jobs
  add column if not exists whatsapp_instance_id uuid references public.instances(id) on delete set null;

create index if not exists campaigns_instance_idx
  on public.campaigns(user_id, whatsapp_instance_id, created_at desc);

create index if not exists follow_up_rules_instance_idx
  on public.follow_up_rules(user_id, whatsapp_instance_id, created_at desc);

create index if not exists follow_up_jobs_instance_idx
  on public.follow_up_jobs(user_id, whatsapp_instance_id, status, due_at);
