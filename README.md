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
- `styles/index.css`: catálogo, tarjetas, filtros, buscador, carrito y modales.
- `styles/registro.css`: registro.
- `styles/cuenta.css`: acceso y perfil.
- `styles/admin.css`: panel de administración.
