alter table public.lifting_lifts
drop constraint lifting_lifts_name_unique;

create unique index lifting_lifts_name_equipment_type_unique
on public.lifting_lifts (lower(name), equipment_type);
