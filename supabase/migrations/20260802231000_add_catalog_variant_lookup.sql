create or replace function public.web_catalog_variant_product_ids()
returns table(product_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct variants.product_id
  from public.product_variants variants
  where variants.active = true;
$$;

revoke all on function public.web_catalog_variant_product_ids() from public, anon, authenticated;
grant execute on function public.web_catalog_variant_product_ids() to service_role;
