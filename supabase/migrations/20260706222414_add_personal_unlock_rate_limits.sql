create table if not exists public.personal_unlock_rate_limits (
  key_hash text not null,
  action text not null,
  window_seconds integer not null,
  window_start timestamptz not null,
  attempt_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (key_hash, action, window_seconds, window_start),
  constraint personal_unlock_rate_limits_key_hash_length check (length(key_hash) between 32 and 128),
  constraint personal_unlock_rate_limits_action_length check (length(action) between 1 and 64),
  constraint personal_unlock_rate_limits_window_positive check (window_seconds > 0),
  constraint personal_unlock_rate_limits_attempt_count_positive check (attempt_count >= 0)
);

alter table public.personal_unlock_rate_limits enable row level security;

revoke all on table public.personal_unlock_rate_limits from anon, authenticated;
grant select, insert, update, delete on table public.personal_unlock_rate_limits to service_role;

drop policy if exists "No direct personal unlock rate limit access" on public.personal_unlock_rate_limits;

create policy "No direct personal unlock rate limit access"
on public.personal_unlock_rate_limits
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.record_personal_unlock_attempt(
  p_key_hash text,
  p_action text,
  p_window_seconds integer,
  p_limit integer
)
returns table (
  allowed boolean,
  attempt_count integer,
  retry_after_seconds integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_attempt_count integer;
  v_retry_after_seconds integer;
begin
  if p_key_hash is null or length(p_key_hash) < 32 then
    raise exception 'Invalid rate limit key.';
  end if;

  if p_action is null or length(trim(p_action)) = 0 then
    raise exception 'Invalid rate limit action.';
  end if;

  if p_window_seconds is null or p_window_seconds <= 0 or p_limit is null or p_limit <= 0 then
    raise exception 'Invalid rate limit window.';
  end if;

  v_window_start := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);
  v_retry_after_seconds := greatest(
    1,
    ceil(extract(epoch from ((v_window_start + make_interval(secs => p_window_seconds)) - v_now)))::integer
  );

  delete from public.personal_unlock_rate_limits
  where updated_at < v_now - interval '2 hours';

  insert into public.personal_unlock_rate_limits (
    key_hash,
    action,
    window_seconds,
    window_start,
    attempt_count,
    updated_at
  )
  values (
    p_key_hash,
    p_action,
    p_window_seconds,
    v_window_start,
    1,
    v_now
  )
  on conflict (key_hash, action, window_seconds, window_start)
  do update
  set attempt_count = public.personal_unlock_rate_limits.attempt_count + 1,
      updated_at = excluded.updated_at
  returning public.personal_unlock_rate_limits.attempt_count into v_attempt_count;

  return query select
    v_attempt_count <= p_limit,
    v_attempt_count,
    v_retry_after_seconds;
end;
$$;

revoke all on function public.record_personal_unlock_attempt(text, text, integer, integer) from public;
revoke all on function public.record_personal_unlock_attempt(text, text, integer, integer) from anon;
revoke all on function public.record_personal_unlock_attempt(text, text, integer, integer) from authenticated;
grant execute on function public.record_personal_unlock_attempt(text, text, integer, integer) to service_role;
