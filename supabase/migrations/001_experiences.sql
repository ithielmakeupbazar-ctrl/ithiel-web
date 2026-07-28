create table if not exists public.experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  rating integer not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) between 3 and 600),
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.experiences enable row level security;

drop policy if exists "Experiencias publicadas visibles" on public.experiences;
create policy "Experiencias publicadas visibles"
on public.experiences for select
using (approved = true);

drop policy if exists "Clientas crean experiencias" on public.experiences;
create policy "Clientas crean experiencias"
on public.experiences for insert
to authenticated
with check (auth.uid() = user_id and approved = false);

create index if not exists experiences_approved_created_idx
on public.experiences (approved, created_at desc);

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

drop policy if exists "Experiencias visibles para admins" on public.experiences;
create policy "Experiencias visibles para admins"
on public.experiences for select
to authenticated
using (approved = true or public.is_admin());

drop policy if exists "Admins moderan experiencias" on public.experiences;
create policy "Admins moderan experiencias"
on public.experiences for update
to authenticated
using (public.is_admin())
with check (public.is_admin());