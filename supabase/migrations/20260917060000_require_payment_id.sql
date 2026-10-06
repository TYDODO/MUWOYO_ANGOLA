-- Every payment must have an immutable audit identifier.
alter table public.plan_subscriptions add column if not exists payment_id text;
update public.plan_subscriptions set payment_id = 'MWY-' || upper(replace(id::text, '-', '')) where payment_id is null;
alter table public.plan_subscriptions alter column payment_id set not null;
create unique index if not exists plan_subscriptions_payment_id_idx on public.plan_subscriptions(payment_id);
