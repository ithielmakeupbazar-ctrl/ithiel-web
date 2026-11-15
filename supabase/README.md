# Supabase — Ithiel Bazar

Proyecto de producción: `bfuexiblfuqwykktltrp` (`ithiel-hub`).

## Advertencia sobre migraciones históricas

La documentación anterior mencionaba `20260802182556_customer_orders_and_stock.sql`, pero **ese archivo no existe en el repositorio actual**. La base de datos ya tiene migraciones aplicadas anteriores a las cuatro migraciones conservadas en `supabase/migrations/`. No ejecutar manualmente ni recrear esa migración a partir de esta documentación.

Antes de cualquier cambio de esquema, comparar el historial de migraciones de Supabase con los archivos versionados, extraer un respaldo verificable y preparar una migración nueva y revisada. **No usar este repositorio como reconstrucción completa de una base vacía hasta recuperar el historial faltante.**

## Edge Functions

Código versionado en `supabase/functions/`:

- `admin-api-v2`
- `create-order`
- `register-customer-v2`
- `telegram-webhook`
- `validate-coupon`
- `web-catalog`
- `catalog-feed` (recuperada del despliegue, noviembre de 2026)
- `publication-worker` (recuperada del despliegue, noviembre de 2026)
- `stock-alerts` (recuperada del despliegue, noviembre de 2026)
- `order-notifications` (recuperada del despliegue, noviembre de 2026)

Las últimas cuatro fueron copiadas desde Supabase **sin volver a desplegarlas**. Comprobar diferencias de configuración y pruebas antes de un redespliegue; conservar los secretos únicamente en el entorno de Supabase.

## Verificación antes de publicar

1. Verificar origen permitido y preflight CORS desde `https://ithielbazarymakeup.site`.
2. Probar catálogo y fichas, imágenes, filtros y variantes.
3. Probar registro e inicio de sesión.
4. Probar creación de pedido con datos de prueba, descuentos y actualización de stock en un entorno seguro.
5. Comprobar visibilidad y estados del pedido en `cuenta.html` y `admin.html`.
6. Probar administración de categorías, productos, fotos y variantes.
7. Verificar alertas, integraciones externas, Telegram y procesamientos programados.
8. Validar controles de acceso y avisos de seguridad de Supabase.

No guardar claves secretas ni `service_role` en GitHub o HTML público. No modificar producción ni aplicar migraciones históricas sin respaldo y validación.
