# Ithiel Bazar 2.0 — Consolidación en rama de pruebas

**Rama:** `cleanup/ithiel-2-0`
**Producción:** sin fusionar a `main`; no editar ni desplegar manualmente producción.

## Cambios implementados

1. **Identidad y animación.** Texto fijo ITHIEL con transición original letra por letra entre BAZAR, MAKEUP, BLANQUERÍA y LENCERÍA en `scripts/ithiel-text-morph.js`. Las letras compartidas cambian de posición usando Web Animations API; entrada/salida con desenfoque; compatible con `prefers-reduced-motion`. **No es el código comercial de React Bits Pro**: ese componente requiere su fuente y licencia para instalarse. Gotham se usa solo si está legalmente instalado en el dispositivo o aportado con licencia; Montserrat 200–900 es el fallback.
2. **Responsive.** Cabecera móvil, navegación inferior, catálogo a dos columnas, ajustes para teléfonos en horizontal y panel administrativo con pestañas horizontales. Las reglas están en `styles/ithiel-v2-consolidated.css`.
3. **Compra.** Se mantienen el precio mayorista y minorista en tarjeta, ficha de producto y carrito. No se alteraron las reglas existentes: el cálculo de la página usa `totalMinor>=30000 || totalQty>=15`. Mantener seguimiento, cupón, variantes y WhatsApp sin cambios en su funcionamiento.
4. **Dashboard.** Cabecera, navegación, tarjetas y ajustes móviles en estilos; la carga de datos, formularios y acciones de Supabase sigue en `admin.html`.
5. **Despliegue y QA.** Solo preview de Cloudflare Pages en rama. Antes de fusionar, cumplir el checklist funcional y visual siguiente.

## Estilos

Las antiguas hojas específicas de Ithiel 2.0 se integraron en una sola, manteniendo su orden original de cascada:

- `styles/ithiel-2-store.css`
- `styles/ithiel-2-admin.css`
- `styles/ithiel-v2-layout.css`
- `styles/ithiel-v2-redesign.css`
- `styles/ithiel-v2-mobile.css`

Esos archivos quedan como historial de referencia pero ya no se enlazan desde `index.html` ni `admin.html`. No eliminar sin revisar otras referencias.

## Pruebas estáticas efectuadas

- [x] `index.html` y `admin.html` enlazan `styles/ithiel-v2-consolidated.css` una vez.
- [x] `index.html` enlaza `scripts/ithiel-text-morph.js`.
- [x] Doble precio visible en plantilla de tarjetas y carrito.
- [x] Regla del umbral mayorista sin cambios.
- [x] Código de carrito y checkout por WhatsApp presente.
- [x] Inicio de sesión/OAuth y API de pedidos existentes.
- [x] En `admin.html` permanecen dashboard, productos, pedidos, clientes, cupones y control de stock.
- [x] Reglas Light/Dark, mobile y reducción de movimiento presentes.
- [x] Último despliegue de Cloudflare Pages marcado `success`.

## Pruebas manuales obligatorias antes de publicar

- [ ] Android vertical 360–430 px: sin desplazamiento horizontal; dos productos por fila, doble precio legible, navegación inferior funcional.
- [ ] Android horizontal: navegación y tarjetas móviles; no activación inesperada del sidebar de PC.
- [ ] Tablet 768–1024 px: no superposición de cabecera, botones ni menú.
- [ ] PC 1366/1440/1920 px: cuatro productos por fila, cabecera completa y menú lateral en admin.
- [ ] Light/Dark/System, incluidos cambios de tema después de navegar y refrescar.
- [ ] Animación completa durante cuatro transiciones: palabras enteras y legibles; desactivada al reducir movimiento.
- [ ] Selección de cada catálogo y subcategoría; búsqueda, paginación, imagen, variante y ficha.
- [ ] Carrito: incrementar, disminuir, quitar, conservar tras recarga, recalcular precios mayorista/minorista.
- [ ] Umbral mayorista: casos por monto, por cantidad y por debajo del umbral.
- [ ] Pedido por WhatsApp: confirmar que el texto y monto corresponden a la lógica vigente, sin enviar pedido de prueba real.
- [ ] Ingreso con correo y Google, sesión persistente, cierre de sesión y permisos de administrador.
- [ ] Panel: pedidos, stock, precios, altas, edición y categorías; verificar cambios sin afectar datos reales.
- [ ] Consola: sin errores JS, recursos no encontrados ni solicitudes fallidas.
- [ ] Revisar contraste, foco de teclado y lectores de pantalla.

**Estado:** implementación de presentación y pruebas estáticas completadas; recorrido funcional de extremo a extremo y aprobación visual pendientes. No fusionar el PR mientras no se hayan completado.
