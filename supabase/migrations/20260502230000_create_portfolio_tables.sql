create extension if not exists pgcrypto;

create table if not exists public.portfolio_stocks (
  id uuid primary key default gen_random_uuid(),
  symbol text not null unique,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_stocks_symbol_format check (symbol ~ '^[A-Z0-9.=-]{1,16}$')
);

create table if not exists public.portfolio_logs (
  id uuid primary key default gen_random_uuid(),
  stock_id uuid not null references public.portfolio_stocks(id) on delete cascade,
  logged_at date not null default current_date,
  entry_type text not null,
  purchase_price numeric(18, 6) not null,
  total_purchase_amount numeric(18, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_logs_entry_type check (entry_type in ('additional_investment', 'reinvested_dividend')),
  constraint portfolio_logs_purchase_price_positive check (purchase_price > 0),
  constraint portfolio_logs_total_purchase_amount_positive check (total_purchase_amount > 0)
);

create index if not exists portfolio_logs_stock_id_idx on public.portfolio_logs(stock_id);
create index if not exists portfolio_logs_logged_at_idx on public.portfolio_logs(logged_at desc);

alter table public.portfolio_stocks enable row level security;
alter table public.portfolio_logs enable row level security;

drop policy if exists "No direct portfolio stock access" on public.portfolio_stocks;
drop policy if exists "No direct portfolio log access" on public.portfolio_logs;

create policy "No direct portfolio stock access"
on public.portfolio_stocks
for all
to anon, authenticated
using (false)
with check (false);

create policy "No direct portfolio log access"
on public.portfolio_logs
for all
to anon, authenticated
using (false)
with check (false);
