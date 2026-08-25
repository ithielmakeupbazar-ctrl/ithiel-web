-- Etiquetas internas separadas de pago y seguimiento, visibles solo a administradores.
alter table public.orders
  add column if not exists internal_label text not null default 'sin_etiqueta'
  check (internal_label in ('sin_etiqueta','esperando_transferencia','preparar','entregado'));

create index if not exists orders_internal_label_created_idx
  on public.orders (internal_label, created_at desc);
