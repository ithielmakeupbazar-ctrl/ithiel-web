alter table public.orders
  alter column customer_id drop not null;

do $migration$
declare
  v_definition text;
  v_updated text;
begin
  v_definition := pg_get_functiondef(
    'public.create_web_order(uuid,text,text,text,boolean,text,text,jsonb,text,text,text,boolean)'::regprocedure
  );

  if position('jsonb_array_length(p_items), v_coupon.id' in v_definition) > 0 then
    return;
  end if;

  v_updated := replace(
    v_definition,
    'p_fulfillment_type, 0, 0, 0, v_coupon.id,',
    'p_fulfillment_type, 0, 0, jsonb_array_length(p_items), v_coupon.id,'
  );

  if v_updated = v_definition then
    raise exception 'No se encontró el item_count provisional anterior.';
  end if;

  execute v_updated;
end;
$migration$;
