-- Conserva las subcategorias que ya eran correctas antes de la reorganizacion.
update public.products p
set subcategory_id = backup.subcategory_id,
    updated_at = now()
from public.catalog_placement_backup_20260802 backup
join public.categories original_category on original_category.id = backup.category_id
where p.id = backup.product_id
  and p.category_id = backup.category_id
  and original_category.name in ('Bazar', 'Lenceria', 'Makeup')
  and p.subcategory_id is distinct from backup.subcategory_id;

