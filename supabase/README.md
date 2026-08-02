# Supabase

Los cambios de esta carpeta deben publicarse en el proyecto
`bfuexiblfuqwykktltrp` en este orden:

1. Aplicar `migrations/20260802182556_customer_orders_and_stock.sql`.
2. Desplegar `admin-api-v2`.
3. Desplegar `web-catalog`.
4. Desplegar `register-customer-v2`.
5. Desplegar `create-order`.

La migración vincula clientes con usuarios, agrega variantes a los ítems y crea
`create_web_order`, que registra el pedido y descuenta el stock en una sola
transacción.

Después del despliegue hay que comprobar:

- El preflight CORS desde `https://ithielbazarymakeup.site`.
- Crear un pedido de prueba y confirmar estado `pending` y descuento de stock.
- Ver el pedido en `cuenta.html` y en el panel administrativo.
- Editar, pausar y eliminar una categoría sin productos asociados.
- Crear un producto con variantes y verlo en el catálogo público.

No se deben guardar claves `service_role` ni secretos dentro del repositorio.
