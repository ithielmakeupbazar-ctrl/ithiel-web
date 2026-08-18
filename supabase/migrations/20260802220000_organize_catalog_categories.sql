-- Reorganiza el catalogo importado por el titulo y consolida subcategorias.
do $$
declare
  bazar_id uuid;
  blanqueria_id uuid;
begin
  select id into bazar_id from public.categories where name = 'Bazar';
  select id into blanqueria_id from public.categories where name = 'Blanquería';

  update public.subcategories set category_id = bazar_id, name = 'Termos, mates y botellas'
  where category_id = blanqueria_id and name = 'Bazar';
  update public.subcategories set category_id = bazar_id, name = 'Regalería'
  where category_id = blanqueria_id and name = 'Regaleria';
  update public.subcategories set category_id = bazar_id, name = 'Librería'
  where category_id = blanqueria_id and name = 'Libreria';
  update public.subcategories set category_id = bazar_id, name = 'Accesorios'
  where category_id = blanqueria_id and name = 'Bijouterie';
end $$;

insert into public.subcategories (category_id, name)
select c.id, names.name
from public.categories c
cross join (values
  ('Regalería'), ('Librería'), ('Accesorios')
) as names(name)
where c.name = 'Bazar'
  and not exists (
    select 1 from public.subcategories s
    where s.category_id = c.id and lower(s.name) = lower(names.name)
  );

insert into public.subcategories (category_id, name)
select c.id, 'Ropa térmica y pijamas'
from public.categories c
where c.name = 'Lenceria'
  and not exists (
    select 1 from public.subcategories s
    where s.category_id = c.id and s.name = 'Ropa térmica y pijamas'
  );

create table if not exists public.catalog_placement_backup_20260802 (
  product_id uuid primary key references public.products(id) on delete cascade,
  category_id uuid references public.categories(id),
  subcategory_id uuid references public.subcategories(id),
  product_status text not null,
  backed_up_at timestamptz not null default now()
);

alter table public.catalog_placement_backup_20260802 enable row level security;

insert into public.catalog_placement_backup_20260802
  (product_id, category_id, subcategory_id, product_status)
select id, category_id, subcategory_id, status
from public.products
on conflict (product_id) do nothing;

with source as (
  select p.id, p.name, c.name as current_category
  from public.products p
  join public.categories c on c.id = p.category_id
), classified as (
  select id, name, current_category,
    case
      when current_category = 'Makeup'
        and lower(name) ~ '(corpiñ|bóxer|boxer|medias|calcet|pijama|calza)' then 'Lenceria'
      when current_category = 'Makeup' then 'Makeup'
      when current_category = 'Bazar' and lower(name) ~ '(repasador)' then 'Blanquería'
      when current_category <> 'Blanquería' then current_category
      when lower(name) ~ '(maquill|makeup|desmaquill|cosm.tic)' then 'Makeup'
      when lower(name) ~ '(acolch|edred.n|s[áa]ban|frazad|manta|toall|mantel|cortin|black out|almohad|cubrecam|cubrecolch|protector de colch|repasador|paño|bata|pie de cama|fundas?|alfombra|poncho|set (7|9) piezas)' then 'Blanquería'
      when lower(name) ~ '(bombach|corpiñ|colaless|bóxer|boxer|ropa interior|medias|calcet|pijama|calza|remera|polera|t[ée]rmic|conjunto (niña|deportivo)|maxi buzo|buzos?|gorro|guante|malla|sandalia|gomones)' then 'Lenceria'
      else 'Bazar'
    end as target_category
  from source
), assigned as (
  select id, name, current_category, target_category,
    case
      when target_category = 'Bazar' and lower(name) ~ '(botella|bombilla|mate|termo|taza|vaso|utensilio|jarra|cocina|cafetero)' then 'Cocina y mesa'
      when target_category = 'Bazar' and lower(name) ~ '(cartuchera|mochila|set de arte)' then 'Librería'
      when target_category = 'Bazar' and lower(name) ~ '(aros?|collar|pulsera|hebilla|vincha|colita|cartera|bolso|paraguas)' then 'Accesorios'
      when target_category = 'Bazar' then 'Regalería'
      when target_category = 'Makeup' and lower(name) ~ '(esponja)' then 'Esponjas y vinchas'
      when target_category = 'Makeup' then 'Accesorios'
      when target_category = 'Lenceria' and lower(name) ~ '(bombach|colaless)' then 'Bombachas y colaless'
      when target_category = 'Lenceria' and lower(name) ~ '(bóxer|boxer)' then 'Boxer'
      when target_category = 'Lenceria' and lower(name) ~ '(corpiñ)' then 'Corpiños'
      when target_category = 'Lenceria' and lower(name) ~ '(medias|calcet)' then 'Medias'
      when target_category = 'Lenceria' and lower(name) ~ '(hombre|uomo)' then 'Ropa interior hombre'
      when target_category = 'Lenceria' and lower(name) ~ '(infantil|niñ|juvenil|disney|bebe)' then 'Ropa interior infantil'
      when target_category = 'Lenceria' then 'Ropa térmica y pijamas'
      when lower(name) ~ '(s[áa]ban.*ajust)' then 'Sábanas ajustables'
      when lower(name) ~ '(s[áa]ban)' then 'Juegos de sábanas'
      when lower(name) ~ '(acolch|edred.n|set (7|9) piezas)' then 'Acolchados'
      when lower(name) ~ '(frazad)' then 'Frazadas'
      when lower(name) ~ '(manta)' then 'Mantas'
      when lower(name) ~ '(toall|poncho)' then 'Toallas y toallones'
      when lower(name) ~ '(bata)' then 'Batas'
      when lower(name) ~ '(mantel)' then 'Manteles'
      when lower(name) ~ '(cortin|black out)' then 'Cortinas'
      when lower(name) ~ '(almohad|fundas?)' then 'Almohadas'
      when lower(name) ~ '(cubrecam|pie de cama)' then 'Cubrecamas'
      when lower(name) ~ '(cubrecolch|protector de colch)' then 'Cubrecolchón'
      when lower(name) ~ '(repasador)' then 'Repasadores'
      when lower(name) ~ '(paño)' then 'Paños de cocina'
      when lower(name) ~ '(alfombra)' then 'Alfombras'
      else 'Baño'
    end as target_subcategory
  from classified
), placement as (
  select a.id, c.id as category_id, s.id as subcategory_id
  from assigned a
  join public.categories c on c.name = a.target_category
  join public.subcategories s
    on s.category_id = c.id and lower(s.name) = lower(a.target_subcategory)
  where a.current_category = 'Blanquería'
     or (a.current_category = 'Makeup' and a.target_category = 'Lenceria')
     or (a.current_category = 'Bazar' and a.target_category = 'Blanquería')
)
update public.products p
set category_id = placement.category_id,
    subcategory_id = placement.subcategory_id,
    updated_at = now()
from placement
where p.id = placement.id
  and (p.category_id is distinct from placement.category_id
    or p.subcategory_id is distinct from placement.subcategory_id);

-- Oculta del catalogo solo copias posteriores totalmente identicas y sin pedidos.
update public.products p
set status = 'archived', updated_at = now()
where status <> 'archived'
  and not exists (select 1 from public.order_items oi where oi.product_id = p.id)
  and exists (
    select 1 from public.products older
    where older.created_at < p.created_at
      and lower(trim(older.name)) = lower(trim(p.name))
      and older.description is not distinct from p.description
      and older.retail_price is not distinct from p.retail_price
      and older.wholesale_price is not distinct from p.wholesale_price
      and older.supplier_price is not distinct from p.supplier_price
      and older.stock is not distinct from p.stock
      and array(select image_url from public.product_images where product_id = older.id order by position, image_url)
        = array(select image_url from public.product_images where product_id = p.id order by position, image_url)
  );

update public.subcategories s
set active = false
where not exists (select 1 from public.products p where p.subcategory_id = s.id)
  and s.name in ('COCINA', 'Cubrecolchon', 'Otros2', 'OTROS2', 'ROPA INTERIOR',
                 'SABANAS AJUSTABLES', 'TOALLERIA', 'VERANO', 'invierno');
