-- Keep the Medium II package aligned with the current commercial offer.
update public.top_up_packages
set messages = 2500,
    price_kz = 30000,
    position = 3,
    is_active = true
where lower(name) = lower('Muwoyo Medium II');