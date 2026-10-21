# pos-desktop

Aplicación de escritorio **POS (Punto de Venta)** para Windows, construida con **Tauri v2** (Rust + React/TypeScript).

Es la versión desktop del frontend `pos-mobil` (React Native): reutiliza su lógica de negocio (models, stores, api) y su sistema de diseño glass, reemplazando la capa nativa RN por un webview Tauri con backend Rust para **comunicación UDP** (discovery del servidor) y **puerto serial** (impresora ESC/POS + báscula).

## Requisitos

- Rust / Cargo (>= 1.77)
- Node.js ^20.19.0 || >=22.12.0 (requerido por Vite 7 — `crypto.hash`; recomendado `22.12 LTS`, ver `.nvmrc`)
- Windows 10/11 con WebView2 Runtime (incluido por defecto)
- Servidor `pos-server` (Fastify) accesible en la red local (descubierto vía UDP)

## Comandos

```bash
# instalar dependencias
npm install

# desarrollo (hot reload, ventana Tauri)
npm run tauri dev

# build de producción (MSI/NSIS, instalación por usuario, sin admin)
npm run tauri build
```

## Estructura

```
pos-desktop/
├── src/               # Frontend React/TS (portado de pos-mobil)
│   ├── api/           # client, discovery, endpoints
│   ├── stores/        # Zustand (auth, cart, server, sync)
│   ├── models/        # tipos y modelos de dominio
│   ├── constants/     # app, theme (design tokens glass)
│   ├── hooks/         # useTheme, useToast, useProductCatalog (catálogo paginado)
│   ├── services/      # udp-discovery, serial, printer, scale, hardware
│   ├── screens/       # Connection, Login, Dashboard, POS, Inventario, etc.
│   ├── components/    # sistema de diseño glass
│   └── lib/           # shims de plataforma (storage, platform)
└── src-tauri/         # Backend Rust
    ├── src/           # udp.rs, serial.rs, printer.rs, scale.rs, lib.rs
    └── capabilities/  # permisos Tauri
```

## Catálogo, búsqueda y paginación

El catálogo (Caja e Inventario) **no se trae entero de una vez**: se pagina contra
`GET /products` con `q` (nombre, SKU, código interno o código de barras), `category_id`,
`limit` y `offset`. El máximo del server es **1000 productos por página** (`limit=2000` → 400).

- La búsqueda va **contra el servidor** con debounce de 300 ms (`SEARCH_DEBOUNCE_MS`) — ya no
  se filtra en memoria, que era lo que hacía que los productos fuera de la primera página
  fueran invisibles e imposibles de encontrar.
- Sin texto de búsqueda, el hook `src/hooks/useProductCatalog.ts` va **acumulando páginas** de
  200 (`CATALOG_PAGE_SIZE`) hasta 1000 (`CATALOG_MAX_AUTO_ITEMS`).
- Con texto de búsqueda, la página es de 20 (`SEARCH_LIMIT`) y aparece el botón
  **"Cargar más (X de Y)"** mientras queden resultados (`total`).
- Al crear o editar un producto, la fila se **resalta y se hace scroll** hasta ella.

## Categorías: color automático

El color de la etiqueta **no se elige a mano**: el selector está deshabilitado en
`src/components/CategorySheet.tsx` (el bloque JSX queda comentado, listo para reactivarse).

- Al **crear** una categoría se asigna automáticamente el **primer color libre de la paleta**
  (`pickAutoColor()`), para que cada categoría sea distinguible de un vistazo. Si la paleta se
  agota, se reutiliza el primero.
- Al **editar** se conserva el color que ya tenía.
- El formulario muestra el color asignado en **solo lectura** ("Asignado automáticamente").

## Garantía de calidad

Todo el código debe estar **optimizado para que la app no crashee, no tenga lag y ofrezca una UX fluida**. Ver requisitos en [AGENTS.md](./AGENTS.md) y en la [skill `pos-desktop`](./.opencode/skills/pos-desktop/SKILL.md).