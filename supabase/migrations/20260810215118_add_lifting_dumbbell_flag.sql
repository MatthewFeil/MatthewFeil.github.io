alter table public.lifting_lifts
add column if not exists uses_dumbbells boolean not null default false;
