# Ithiel Web

Catálogo y panel de gestión de Ithiel. Es un sitio estático en HTML, CSS y JavaScript que consume Supabase directamente desde el navegador.

## Ejecutar localmente

No requiere instalar dependencias. Desde la carpeta del proyecto:

```powershell
python -m http.server 8000
```

Abrí `http://localhost:8000` para ver el catálogo. Las demás vistas están en:

- `http://localhost:8000/registro.html`
- `http://localhost:8000/cuenta.html`
- `http://localhost:8000/admin.html`

Es importante usar un servidor local y no abrir los archivos con doble clic, porque la autenticación y las rutas de Supabase dependen del origen del sitio.

## Estilos

- `styles/shared.css`: accesibilidad, estados de mensajes, animaciones base y preferencias de movimiento reducido.
- `styles/cart-floating.css`: acceso flotante al pedido en páginas secundarias.
- `styles/admin-v2.css`: ajustes visuales activos del panel de administración.

Los estilos específicos de cada vista permanecen dentro de su HTML. Las hojas
anteriores que ya no estaban enlazadas se retiraron para evitar mantener código
duplicado o confundirlas con los estilos realmente publicados.

## Publicación

Los cambios del sitio se publican subiendo este repo a la rama que usa el hosting.
Antes de confirmar producción:

1. Probar catálogo, detalle, carrito, registro y cuenta en escritorio y móvil.
2. Subir el commit a GitHub.
3. Verificar que `https://ithielbazarymakeup.site` use ese commit.
4. Aplicar por separado el ajuste de CORS indicado en `supabase/README.md`.

No se deben copiar claves privadas de Supabase al frontend. La clave pública
incluida en el sitio es la clave publicable para navegador.


## Integración Telegram
El bot de Telegram es parte del flujo operativo y se conserva como integración activa con Supabase.
