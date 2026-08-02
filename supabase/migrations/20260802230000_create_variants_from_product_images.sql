create table if not exists public.variant_autofill_backup_20260802 (
  product_id uuid primary key references public.products(id),
  original_stock integer,
  backed_up_at timestamptz not null default now()
);

alter table public.variant_autofill_backup_20260802 enable row level security;

with image_counts as (
  select product_id, count(*)::int as image_count
  from public.product_images
  group by product_id
  having count(*) > 1
)
insert into public.variant_autofill_backup_20260802 (product_id, original_stock)
select p.id, greatest(coalesce(p.stock, 0), 0)
from public.products p
join image_counts images on images.product_id = p.id
where not exists (
  select 1 from public.product_variants variants where variants.product_id = p.id
)
on conflict (product_id) do nothing;

with ranked_images as (
  select
    images.product_id,
    images.image_url,
    row_number() over (partition by images.product_id order by images.position, images.created_at, images.id)::int as option_number,
    count(*) over (partition by images.product_id)::int as option_count
  from public.product_images images
  join public.variant_autofill_backup_20260802 backup on backup.product_id = images.product_id
)
insert into public.product_variants (
  product_id, color, sku, stock, retail_price, wholesale_price, active, image_url
)
select
  product.id,
  'Opción ' || image.option_number,
  left(coalesce(nullif(product.sku, ''), 'ITH-' || left(replace(product.id::text, '-', ''), 12)), 72)
    || '-V' || lpad(image.option_number::text, 2, '0'),
  (greatest(coalesce(product.stock, 0), 0) / image.option_count)
    + case when image.option_number <= greatest(coalesce(product.stock, 0), 0) % image.option_count then 1 else 0 end,
  product.retail_price,
  product.wholesale_price,
  true,
  image.image_url
from ranked_images image
join public.products product on product.id = image.product_id
where not exists (
  select 1 from public.product_variants variants where variants.product_id = product.id
);
