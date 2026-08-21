# Changelog

Todas las versiones notables de **pos-desktop** se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
Este proyecto usa [Semantic Versioning](https://semver.org/).

## [0.3.0] — 2026-08-21 — Fase 2 (comunicación serial: impresora + báscula)

### Añadido

- **`services/hardware.ts`**: envoltorio de los comandos Rust de hardware
  (`list_ports`, `open_port`, `close_port`, `write_port`, `read_port`,
  `start_hardware`, `stop_hardware`) para impresora ESC/POS y báscula.
- **`HardwareScreen`**: nueva pantalla de configuración de hardware — lista
  puertos serial, prueba de impresora, lectura de peso de la báscula e
  inicio/detención del orquestador de hardware de Rust.
- **Ruta `/hardware`** + acceso desde el Dashboard (botón engranaje).

### Completa la capa serial (Rust — ya existía como scaffold)

- `serial.rs`: lista/abre/cierra/escribe/lee puertos serial.
- `printer.rs`: builder ESC/POS (init, alineación, wrap, feed, corte, barcode, QR).
- `scale.rs`: parser configurable de báscula (regex/fixed/line) con presets.
- `hardware.rs`: orquestador que hace poll de `/print-jobs` (impresión) y lee la
  báscula emitiendo eventos `scale-reading`.

### Pendiente

- Imprimir el ticket real tras la venta (marcar `print_jobs` COMPLETED/FAILED).
- Heartbeat de báscula publicando `device_status` (POST desde Rust).
- Lectura de peso estable en el flujo de venta por peso / CAJ.
- **Fase 3** — Sync command-based y QoS.
- **Fase 4** — Empaquetado MSI/NSIS.

## [0.2.0] — 2026-08-21 — Fase 0 (HTTP→Rust) + Fase 1 (paridad de pantallas)

### Añadido

- **Fase 0 — Capa HTTP en Rust (seguridad)**: las peticiones al backend ya NO salen
  del webview. Nuevo módulo `src-tauri/src/api.rs` con `reqwest`: comandos
  `api_set_server`, `api_set_token` y `api_request`. El token de sesión y la IP/puerto
  viven en `ApiState` de Rust (el JWT no circula por el DOM).
- **Tema púrpura/rosa** en `theme.ts` y `main.css`, con **tema LIGHT por defecto**
  (main.tsx y useTheme.ts sin depender de `prefers-color-scheme`).
- **`ConnectionScreen` conectada al UDP Rust**: discovery automático
  (`POS_DISCOVER`), auto-reintento, banner "servidor no disponible", conexión manual
  (IP + puerto) y QR.
- **`LoginScreen` real**: tenant + PIN, `POST /auth/login` vía Rust, ID de dispositivo
  estable (RF-AU-004), "¿Cambiar servidor?".
- **`PosTerminalScreen` (Terminal/POS)**: búsqueda global, categorías reales, catálogo
  grid responsive, sheet de producto con selector de **3 precios** (Público/Mayoreo/
  Especial), carrito con método de pago y `POST /sales`.
- **`InventoryScreen`**: lista real del backend, KPIs (total/agotados/categorías),
  filtro por categoría, **ajustar stock** (cantidad ± y motivo) solo Admin.
- **`ReportsScreen`**: `GET /reports/quick-stats` (ventas hoy/ayer, ticket promedio,
  desglose por método y por categoría) + `GET /reports/sales-history`. Visible solo con
  `reports:read`.
- **Componentes portados** a React DOM/Tailwind: `BottomNavBar`, `TopAppBar`,
  `SearchInput`, `FilterChip`, `ProductCard`, `ProductSheet`, `CartSheet`, `Fab`,
  `KpiCard`, `StatusChip`, `AdjustStockSheet`.
- Helper `constants/prices.ts` (`getProductPrices`).
- `TODO.md` con el roadmap y seguimiento de fases.

### Corregido

- `client.ts` reescrito para invocar `api_request` de Rust (eliminado `fetch` del
  webview); conserva `ApiError`/`NetworkError` y el refresh en 401.
- `discovery.ts` y `ConnectionScreen` sincronizan el servidor descubierto a Rust
  (`syncServerToRust`).
- Errores de tipos en los componentes portados (iconos lucide, placeholder RN→HTML).

### Verificado

- `cargo check` (Rust) y `tsc --noEmit` en 0 errores.
- `npm run build` (Vite) compila los assets.

### Pendiente

- **Recibo digital** post-venta + "Imprimir" (puente a ESC/POS de la Fase 2).
- **FAB "+" crear producto** funcional (`POST /products` con precios).
- **Cortes de caja** (`/cashier/*`).
- **Fase 2 — Comunicación serial**: completar impresora ESC/POS y báscula en Rust,
  poll de `/print-jobs` desde Rust, UI de configuración de hardware.
- **Fase 3** — Sync command-based y QoS.
- **Fase 4** — Empaquetado MSI/NSIS.

## [Sin publicar]

### Añadido
- Proyecto Tauri v2 (Rust + React/TS) en `pos-desktop/`.
- Documentación base: `README.md`, `CHANGELOG.md`, `AGENTS.md` y skill opencode `pos-desktop`.

### Corregido
- **UI Components**: Resueltos errores de compilación TypeScript en `POSButton`, `GlassBackground`, `GlassSurface` y `ConnectionScreen`.
  - `POSButton`: extendido `ButtonHTMLAttributes`, añadido `data-testid`, eliminado import `React` innecesario.
  - `GlassBackground`/`GlassSurface`: aceptan `className` y `style` via `HTMLAttributes` spread.
  - `ConnectionScreen`: eliminados destructurados sin usar, tipado correcto en `onInput`, selector `lastError` añadido.
- Build Vite y `tsc --noEmit` pasan sin errores.

### Planificado
- Scaffold Tauri (src-tauri, capabilities, vite).
- Porte de núcleo: models, constants, stores y api desde `pos-mobil`.
- Shims de plataforma: `storage` (AsyncStorage → localStorage) y `platform` (OS = windows).
- Porte de UI vía react-native-web (alias en Vite).
- Comando Rust `udp_discover` (broadcast UDP 5000, mensaje `POS_DISCOVER`).
- Capa serial en Rust (`serialport`): lista de puertos, open, write, read, eventos.
- ESC/POS (impresora) y parser configurable de báscula en Rust.
- Orquestador de hardware: poll de `/print-jobs` + heartbeat de `/scale`.
- Backend `pos-server`: módulos `print-jobs` y `scale`.
- Empaquetado MSI/NSIS sin privilegios de administrador.