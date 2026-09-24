# Changelog

Todas las versiones notables de **pos-desktop** se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
Este proyecto usa [Semantic Versioning](https://semver.org/).

## [Sin publicar] — Revert PRN-2: sin espera de confirmación (rama installer)

### Quitado

- **Revert de la confirmación de papel vía `GetJobW`**: el poll bloqueaba el
  comando Tauri hasta ~3s y congelaba la app. Se vuelve a envío directo con
  pre-chequeo offline (PRN-1 intacto: offline/sin papel/error se rechazan antes
  de enviar; 9 líneas de feed intactas). Se conserva el mensaje honesto
  "generado, pero no se imprimió" ante rechazo previo o fallo de spool.

## [Sin publicar] — Fix impresión honesta + margen de corte (rama installer)

### Corregido

- **Falso "Ticket impreso"**: WinSpool acepta el trabajo aunque la impresora
  esté apagada/desconectada (queda encolado y `WritePrinter` reporta éxito).
  `send_raw_winspool` ahora consulta `GetPrinterW` (nivel 2) ANTES de enviar y
  falla honesto ante offline/sin papel/error/no disponible; además
  `list_printers` reporta `is_online` real (antes siempre `true`) y el
  auto-detectado de `CartSheet` prefiere impresoras en línea.
- **Mensajes**: venta con impresora pero sin papel → "Venta {folio} · Ticket
  generado, pero no se imprimió" (+ motivo); reimpresión encolada/fallida →
  "Ticket generado, pero no se imprimió (encolado)." / "No se imprimió:
  <motivo> — el ticket quedó registrado." Nunca más "impreso" sin papel.
- **Margen de corte**: `build_print_sequence` emite **9 líneas en blanco**
  antes de `GS V` (antes feed de 3 que cortaba sobre el texto). Punto único:
  cubre venta, reimpresión, poll y prueba.

### Verificado

- `cargo test --lib` 17/17 (incluye `status_unavailable_reason_maps_win32_bits`
  y `print_sequence_feeds_nine_blank_lines_before_cut` nuevos), `tsc` limpio,
  `vite build` OK.

## [Sin publicar] — Distribución solo-exe (rama installer)

### Cambiado

- **`tauri.conf.json`**: `"bundle": {"active": false}` (targets intactos para
  retomar MSI/NSIS luego). Motivo: el CLI 2.10.1 no acepta `--bundles none` y
  cualquier bundle dispara WiX/makensis. Con esto, `npx tauri build` termina en
  `target/release/pos-desktop.exe` sin descargas extra — la vía portable
  aprobada.

## [Sin publicar] — Distribución portable desktop (rama installer)

### Añadido

- **`installer/portable/instalar-desktop.bat`**: instalador/actualizador
  idempotente sin admin — copia `pos-desktop.exe` a
  `%LOCALAPPDATA%\POS Desktop\` (nombre estable), compara `version.txt`
  (igual = solo refresca accesos; nueva = cierra app y reemplaza),
  crea accesos Escritorio + Menú inicio (+ Startup con `/startup`).
  Actualizar = reemplazar, sin desinstalador.
- **`installer/portable/README-PORTABLE.md`**: layout de distribución,
  primera ejecución en caja y reglas de versionado.
- **`installer/portable/version.txt`**: `0.1.0` (sincronizar con
  `tauri.conf.json` + `package.json` + tag en cada release).

### Notas

- La barra de tareas no se fija por script (bloqueo de Windows): fijado
  manual una vez; sobrevive a updates por el nombre estable.
- Mecanismo de accesos probado aislado (SpecialFolders + WScript.Shell OK).

## [Sin publicar] — Fix: subir licencia vencida avisaba éxito (rama installer)

### Corregido

- **Wizard y menú mostraban éxito al subir una licencia vencida**: el servidor
  la APLICA (200 + `status: expired`, desactiva el tenant, audita SUSPENDED —
  verificado empíricamente con `.lic` firmado expirado en BD temporal) y la UI
  festejaba "activada" + marcaba `active`, dejando al usuario en una app que
  responde 403 en todo sin explicación. Ahora ambas superficies detectan
  `status === 'expired'` y muestran error nombrando la fecha
  ("…está vencida desde … pide a tu proveedor una renovación"), sin tocar el
  estado local; el wizard permanece visible.

## [Sin publicar] — F-I2c installer: renovación de licencia en menú usuario (rama installer)

### Añadido

- **Menú de usuario → sección Licencia renovable**: botón "Renovar / subir
  licencia" con textarea (pegar `payload.firma`) + "Elegir .lic" (file picker
  nativo, sin plugins Tauri). Sube vía `POST /license/upload` con sesión y
  refresca `GET /license/status` → store + caché de expiración. Cierra el hueco
  trial→extendida: antes solo el wizard (visible únicamente en `expired`)
  permitía activar.
- **`api/endpoints`**: `uploadLicense()` + `getLicenseStatus()`.

## [Sin publicar] — F-I2b installer: cambio de PIN forzado en login (rama installer)

### Añadido

- **`LoginScreen`**: ante 403 de PIN inicial muestra el panel "Crea tu PIN nuevo"
  (nuevo + confirmación, solo dígitos, 4-6) y botón "Guardar PIN y entrar":
  llama a `POST /auth/change-pin` y reintenta login solo. Sin duplicar sesión.
- **`api/endpoints`**: `changePin()` + `isMustChangePin()` (el envoltorio de error
  no trae `code` máquina —se detecta por status 403 + mensaje estable—,
  documentado inline).

## [Sin publicar] — F-I1 installer: trial solo en dev (rama installer)

### Cambiado

- **`LicenseActivation`**: el botón "Probar 1 día gratis" y su texto solo se
  renderizan cuando `!import.meta.env.PROD` (decisión: sin trial en prod; en
  producción el wizard solo acepta `.lic` del proveedor).
- Agregado el `src/vite-env.d.ts` estándar (`/// <reference types="vite/client" />`)
  que faltaba — sin él, `import.meta.env` no tipaba y `tsc` fallaba.

## [Sin publicar] — Fix reimpresión de tickets

### Corregido

- **Reimprimir desde Tickets ahora sí imprime**: `reprintTicket` intentaba solo
  encolar (`POST /print-jobs`), pero el consumidor de la cola (orquestador Rust
  `start_hardware`) no corre en desktop — `startHardware` no tiene ningún
  llamador en la UI — así que todo quedaba en PENDING y solo se veía el toast
  "encolado". Ahora intenta primero impresión **directa USB** (mismo camino
  probado de `CartSheet` al vender) y solo delega a la cola cuando el equipo no
  tiene impresora local configurada (evita duplicados: con impresora local, un
  fallo se propaga como error en vez de encolar copia). El toast distingue:
  "Ticket reimpreso (80mm)." vs "Ticket encolado para impresión.".

## [Sin publicar] — Integración Licencia (rama printer, merge origin/printer 721c826)

### Añadido (del remoto)

- **Wizard primera ejecución `LicenseActivation`** (`4cc5046`): drag&drop `.lic`,
  file picker Tauri (plugins dialog 2.4.1 + fs 2.4.4), textarea pegado y trial
  1 día gratis `POST /license/trial`; `AppRoutes` con `useBootstrapLicenseProbe`
  (wizard cuando `licenseState=expired`, auto-cierre con `GET /license/status` 200);
  cliente bootstrap-aware (`auth:false` en upload/trial/status, manejo 404 `NO_LICENSE`).
- **Fix probe bootstrap** (`76aab60`): `resolveServer()` centralizado con fallback dev
  `127.0.0.1`, reintento al cambiar IP, retry 3s; `.nvmrc` 22.12.0 + `engines`
  `^20.19.0||>=22.12.0`; capabilities fs en kebab con scope `$HOME/$DESKTOP/$DOCUMENT/$DOWNLOAD/$TEMP`.

### Preservado (local, sin conflictos en el merge)

- Precios manuales (Público/Mayoreo/Especial), unidades Pieza/Kilo, tweaks
  Reports/Tickets, sidebar carrito, impresión USB directa, imágenes.

### Verificado

- `npm install`, `npx tsc --noEmit` limpio, `vite build` OK (solo warnings
  preexistentes de chunks).
- **Rust**: `cargo check -p tauri` limpio. Los 18 errores E0463/E0599 eran cascada
  de un fingerprint corrupto de `serialize-to-javascript-impl` (el `.dll` del
  proc-macro nunca se emitía; `Template`/`#[raw]`/`render_default` vienen de ese
  crate, no de tauri-macros) — se arregló con
  `cargo clean -p serialize-to-javascript-impl` (posible causa: mtimes
  inconsistentes en el registry). Las versiones están bien pareadas
  (macros/codegen/plugin 2.6.x es lo último estable y compatible con lib 2.10.3).
- **Bloqueado por entorno (pendiente IT)**: el workspace completo aún no compila
  aquí — Application Control (os error 4551) bloquea los build-scripts de los
  plugins (`tauri-plugin-fs`). Empaquetar en máquina sin esa política.

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
- **CRUD completo de productos** en Inventario: crear (POST /products), editar (PATCH
  /products/:id), eliminar (borrado lógico, DELETE /products/:id) — cada acción gated
  por permisos `products:create/update/delete` del JWT. `ProductFormSheet` portado con
  categoría, unidades, precio/costo, stock mínimo, 3 precios por tipo y flags
  báscula/fraccional.
- **Menú de usuario en el avatar** (TopAppBar): dropdown con nombre, rol, tenant y estado
  de licencia + botón "Cerrar sesión".
- **Visibilidad de errores de carga**: Inventario y Terminal muestran el error real de la
  API (red, 401, licencia, permiso) con botón **Reintentar** en lugar de lista vacía muda.
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