alter table public.lifting_lifts
add column equipment_type text not null default 'other';

update public.lifting_lifts
set equipment_type = 'dumbbell'
where uses_dumbbells = true;

alter table public.lifting_lifts
add constraint lifting_lifts_equipment_type_valid
check (equipment_type in ('dumbbell', 'machine', 'barbell', 'other'));
