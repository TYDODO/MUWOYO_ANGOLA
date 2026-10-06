-- Align the public package names with the current commercial offer.
update public.top_up_packages
set name = 'Muwoyo Big',
    messages = 2500,
    price_kz = 30000,
    position = 3,
    is_active = true
where lower(name) = lower('Muwoyo Medium II');