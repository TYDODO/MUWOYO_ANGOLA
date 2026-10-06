update public.subscription_plans
set price_kz = case name
  when 'Muwoyo Start' then 12999
  when 'Muwoyo Growth' then 19999
  when 'Muwoyo Big' then 34999
  else price_kz
end
where name in ('Muwoyo Start', 'Muwoyo Growth', 'Muwoyo Big');
