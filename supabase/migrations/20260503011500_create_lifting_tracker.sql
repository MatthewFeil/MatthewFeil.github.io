create extension if not exists pgcrypto;

create table if not exists public.lifting_app_settings (
  id boolean primary key default true,
  password_salt text not null,
  password_hash text not null,
  updated_at timestamptz not null default now(),
  constraint lifting_app_settings_singleton check (id)
);

insert into public.lifting_app_settings (id, password_salt, password_hash)
values (true, 'lift-tracker-v1:', '6b1e33bfa360bd15d4cec05c1a4dc44ed3b046d8d2ef719c0d2f8a8656c5d924')
on conflict (id) do update
set password_salt = excluded.password_salt,
    password_hash = excluded.password_hash,
    updated_at = now();

create table if not exists public.lifting_lifts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  constraint lifting_lifts_name_not_blank check (length(trim(name)) > 0),
  constraint lifting_lifts_name_unique unique (name)
);

create table if not exists public.lifting_logs (
  id uuid primary key default gen_random_uuid(),
  lift_id uuid not null references public.lifting_lifts(id) on delete cascade,
  lifted_at date not null default current_date,
  weight numeric(8,2) not null,
  reps integer not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint lifting_logs_weight_positive check (weight > 0),
  constraint lifting_logs_reps_range check (reps between 1 and 10)
);

create index if not exists lifting_logs_lift_id_created_at_idx
on public.lifting_logs (lift_id, created_at desc);

alter table public.lifting_app_settings enable row level security;
alter table public.lifting_lifts enable row level security;
alter table public.lifting_logs enable row level security;

revoke all on table public.lifting_app_settings from anon, authenticated;
revoke all on table public.lifting_lifts from anon, authenticated;
revoke all on table public.lifting_logs from anon, authenticated;
