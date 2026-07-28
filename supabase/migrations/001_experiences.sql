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
