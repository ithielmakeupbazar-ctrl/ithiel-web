-- Administración operativa: papelera recuperable y trazabilidad.
alter table public.products
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id);

create index if not exists products_active_admin_idx
  on public.products (created_at desc) where deleted_at is null;
create index if not exists products_trash_admin_idx
  on public.products (deleted_at desc) where deleted_at is not null;

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  action text not null check (char_length(action) between 3 and 80),
  entity_type text not null check (char_length(entity_type) between 3 and 80),
  entity_id uuid,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;
revoke all on public.admin_audit_log from anon, authenticated;
create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);

-- Los productos archivados por la papelera continúan fuera del catálogo público.
-- La retención es de 30 días: la API solo permite purgar tras ese período.
