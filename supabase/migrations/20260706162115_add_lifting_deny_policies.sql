drop policy if exists "No direct lifting app settings access" on public.lifting_app_settings;
drop policy if exists "No direct lifting lift access" on public.lifting_lifts;
drop policy if exists "No direct lifting log access" on public.lifting_logs;

create policy "No direct lifting app settings access"
on public.lifting_app_settings
for all
to anon, authenticated
using (false)
with check (false);

create policy "No direct lifting lift access"
on public.lifting_lifts
for all
to anon, authenticated
using (false)
with check (false);

create policy "No direct lifting log access"
on public.lifting_logs
for all
to anon, authenticated
using (false)
with check (false);
