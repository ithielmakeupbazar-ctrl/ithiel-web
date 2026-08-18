create schema if not exists private;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_admin() from public, anon;
grant usage on schema private to authenticated, service_role;
grant execute on function private.is_admin() to authenticated, service_role;

alter policy "Experiencias visibles para admins"
on public.experiences
using ((approved = true) or private.is_admin());

alter policy "Admins moderan experiencias"
on public.experiences
using (private.is_admin())
with check (private.is_admin());

drop function if exists public.is_admin();
