do $migration$
declare
  v_definition text;
  v_updated text;
begin
  v_definition := pg_get_functiondef(
    'public.create_web_order(uuid,text,text,text,boolean,text,text,jsonb,text,text,text,boolean)'::regprocedure
  );

  if position('insert into public.orders (customer_id,' in v_definition) > 0 then
    return;
  end if;

  v_updated := replace(
    v_definition,
    'insert into public.orders (order_number, customer_id,',
    'insert into public.orders (customer_id,'
  );
  v_updated := replace(
    v_updated,
    'values (nextval(''public.orders_order_number_seq''), v_customer.id,',
    'values (v_customer.id,'
  );

  if v_updated = v_definition then
    raise exception 'No se encontró la inserción anterior de order_number.';
  end if;

  execute v_updated;
end;
$migration$;
