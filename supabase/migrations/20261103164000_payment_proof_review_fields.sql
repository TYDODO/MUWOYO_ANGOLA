alter table public.plan_subscriptions
  add column if not exists rejection_reason text,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references auth.users(id) on delete set null;

notify pgrst, 'reload schema';
