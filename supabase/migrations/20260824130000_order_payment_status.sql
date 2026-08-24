-- Separa el cobro por transferencia del avance operativo del pedido.
alter table public.orders
  add column if not exists payment_status text not null default 'pending'
  check (payment_status in ('pending', 'paid'));

create index if not exists orders_payment_status_created_idx
  on public.orders (payment_status, created_at desc);
