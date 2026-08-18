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

  if position('nextval(''public.orders_order_number_seq'')' in v_definition) > 0 then
    return;
  end if;

  v_updated := replace(
    v_definition,
    $old$values ('ITH-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),$old$,
    $new$values (nextval('public.orders_order_number_seq'),$new$
  );

  if v_updated = v_definition then
    raise exception 'No se encontró la generación anterior de order_number.';
  end if;

  execute v_updated;
end;
$migration$;
