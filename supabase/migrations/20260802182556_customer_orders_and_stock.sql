alter table public.customers
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

alter table public.order_items
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null,
  add column if not exists variant_name text;

alter table public.orders
  alter column customer_id drop not null;

create unique index if not exists customers_auth_user_id_key
  on public.customers (auth_user_id)
  where auth_user_id is not null;

create index if not exists customers_email_lower_idx
  on public.customers (lower(email));

create index if not exists orders_customer_created_idx
  on public.orders (customer_id, created_at desc);

create index if not exists product_variants_product_active_idx
  on public.product_variants (product_id, active);

create or replace function public.create_web_order(
  p_auth_user_id uuid,
  p_email text,
  p_full_name text,
  p_phone text,
  p_tracking_requested boolean,
  p_purchase_type text,
  p_coupon_code text,
  p_items jsonb,
  p_fulfillment_type text,
  p_shipping_address text,
  p_customer_note text,
  p_whatsapp_opt_in boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers%rowtype;
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_coupon public.coupons%rowtype;
  v_item jsonb;
  v_items_result jsonb := '[]'::jsonb;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := left(trim(coalesce(p_full_name, '')), 100);
  v_quantity integer;
  v_unit_price numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_total numeric := 0;
  v_discount_percent numeric := 0;
  v_item_count integer := 0;
  v_variant_name text;
  v_tracking boolean := coalesce(p_tracking_requested, false)
    and v_name <> ''
    and v_phone ~ '^[0-9]{10,15}$';
begin
  if p_purchase_type not in ('retail', 'wholesale') then raise exception 'Tipo de compra no válido.'; end if;
  if p_fulfillment_type not in ('pickup', 'shipping') then raise exception 'Forma de entrega no válida.'; end if;
  if p_fulfillment_type = 'shipping' and trim(coalesce(p_shipping_address, '')) = '' then raise exception 'Ingresá la dirección de envío.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then raise exception 'El pedido no tiene productos válidos.'; end if;

  if p_auth_user_id is not null then
    select * into v_customer from public.customers where auth_user_id = p_auth_user_id for update;
  end if;
  if v_customer.id is null and p_auth_user_id is not null and v_email <> '' then
    select * into v_customer from public.customers where lower(email) = v_email order by created_at limit 1 for update;
  end if;
  if v_tracking and v_customer.id is null then
    select * into v_customer from public.customers where phone = v_phone order by created_at limit 1 for update;
  end if;

  if v_tracking and v_customer.id is null then
    insert into public.customers (auth_user_id, email, full_name, phone, default_address, whatsapp_opt_in, whatsapp_opted_in_at)
    values (p_auth_user_id, nullif(v_email, ''), v_name, v_phone, nullif(trim(coalesce(p_shipping_address, '')), ''), coalesce(p_whatsapp_opt_in, false), case when p_whatsapp_opt_in then now() else null end)
    returning * into v_customer;
  elsif v_tracking then
    update public.customers set
      auth_user_id = coalesce(auth_user_id, p_auth_user_id),
      email = coalesce(nullif(v_email, ''), email),
      full_name = v_name,
      phone = v_phone,
      default_address = coalesce(nullif(trim(coalesce(p_shipping_address, '')), ''), default_address),
      whatsapp_opt_in = whatsapp_opt_in or coalesce(p_whatsapp_opt_in, false),
      whatsapp_opted_in_at = coalesce(whatsapp_opted_in_at, case when p_whatsapp_opt_in then now() else null end),
      updated_at = now()
    where id = v_customer.id
    returning * into v_customer;
  end if;

  if trim(coalesce(p_coupon_code, '')) <> '' then
    select * into v_coupon
    from public.coupons
    where upper(code) = upper(trim(p_coupon_code))
      and active = true
      and (starts_at is null or starts_at <= now())
      and (expires_at is null or expires_at >= now())
    limit 1;
    if v_coupon.id is null then raise exception 'El cupón no es válido o está vencido.'; end if;
    v_discount_percent := greatest(0, least(100, coalesce(v_coupon.discount_percent, 0)));
  end if;

  insert into public.orders (order_number, customer_id, status, purchase_type, fulfillment_type, subtotal, total, item_count, coupon_id, coupon_code, shipping_address, customer_note)
  values ('ITH-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), v_customer.id, 'pending', p_purchase_type, p_fulfillment_type, 0, 0, 0, v_coupon.id, nullif(upper(trim(coalesce(p_coupon_code, ''))), ''), nullif(trim(coalesce(p_shipping_address, '')), ''), nullif(left(trim(coalesce(p_customer_note, '')), 1000), ''))
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := coalesce((v_item->>'quantity')::integer, 0);
    if v_quantity < 1 or v_quantity > 999 then raise exception 'Una cantidad del pedido no es válida.'; end if;

    select * into v_product from public.products
    where id = (v_item->>'productId')::uuid and status = 'published'
    for update;
    if v_product.id is null then raise exception 'Uno de los productos ya no está disponible.'; end if;

    v_variant := null;
    v_variant_name := null;
    if nullif(v_item->>'variantId', '') is not null then
      select * into v_variant from public.product_variants
      where id = (v_item->>'variantId')::uuid and product_id = v_product.id and active = true
      for update;
      if v_variant.id is null then raise exception 'La variante elegida ya no está disponible.'; end if;
      if v_variant.stock < v_quantity then raise exception 'No hay stock suficiente de %.', v_product.name; end if;
      update public.product_variants set stock = stock - v_quantity where id = v_variant.id;
      v_variant_name := concat_ws(' · ', nullif(v_variant.color, ''), nullif(v_variant.size, ''));
      v_unit_price := case when p_purchase_type = 'wholesale' then v_variant.wholesale_price else v_variant.retail_price end;
    else
      if exists (select 1 from public.product_variants where product_id = v_product.id and active = true) then raise exception 'Elegí color o talle para %.', v_product.name; end if;
      v_unit_price := case when p_purchase_type = 'wholesale' then v_product.wholesale_price else v_product.retail_price end;
    end if;

    if v_product.stock < v_quantity then raise exception 'No hay stock suficiente de %.', v_product.name; end if;
    if v_unit_price is null or v_unit_price <= 0 then raise exception 'El producto % no tiene un precio válido.', v_product.name; end if;
    update public.products set stock = stock - v_quantity where id = v_product.id;

    v_line_total := round(v_unit_price * v_quantity, 2);
    v_subtotal := v_subtotal + v_line_total;
    v_item_count := v_item_count + v_quantity;
    insert into public.order_items (order_id, product_id, variant_id, product_name, variant_name, sku, quantity, unit_price, line_total)
    values (v_order.id, v_product.id, v_variant.id, v_product.name, v_variant_name, coalesce(v_variant.sku, v_product.sku), v_quantity, v_unit_price, v_line_total);
    v_items_result := v_items_result || jsonb_build_array(jsonb_build_object('productId', v_product.id, 'name', v_product.name, 'variant', v_variant_name, 'quantity', v_quantity, 'unitPrice', v_unit_price));
  end loop;

  v_total := round(v_subtotal * (1 - v_discount_percent / 100), 2);
  update public.orders set subtotal = v_subtotal, total = v_total, item_count = v_item_count where id = v_order.id;

  return jsonb_build_object('id', v_order.id, 'orderNumber', v_order.order_number, 'subtotal', v_subtotal, 'discountPercent', v_discount_percent, 'total', v_total, 'items', v_items_result);
end;
$$;

revoke all on function public.create_web_order(uuid,text,text,text,boolean,text,text,jsonb,text,text,text,boolean) from public, anon, authenticated;
grant execute on function public.create_web_order(uuid,text,text,text,boolean,text,text,jsonb,text,text,text,boolean) to service_role;
