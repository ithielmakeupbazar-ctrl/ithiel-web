create or replace function public.set_order_status(p_order_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
begin
  if p_status not in ('pending', 'processing', 'completed', 'cancelled') then
    raise exception 'Estado no permitido.';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception 'Pedido no encontrado.'; end if;
  if v_order.status = p_status then
    return jsonb_build_object('order_id', p_order_id, 'status', p_status);
  end if;
  if v_order.status in ('completed', 'cancelled') then
    raise exception 'El pedido ya está cerrado.';
  end if;

  if p_status = 'cancelled' then
    for v_item in
      select product_id, variant_id, quantity
      from public.order_items
      where order_id = p_order_id
    loop
      update public.products
      set stock = coalesce(stock, 0) + v_item.quantity
      where id = v_item.product_id;

      if v_item.variant_id is not null then
        update public.product_variants
        set stock = coalesce(stock, 0) + v_item.quantity
        where id = v_item.variant_id;
      end if;
    end loop;
  end if;

  update public.orders
  set status = p_status,
      confirmed_at = case when p_status = 'completed' then now() else null end
  where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'status', p_status);
end;
$$;

revoke all on function public.set_order_status(uuid,text) from public, anon, authenticated;
grant execute on function public.set_order_status(uuid,text) to service_role;
