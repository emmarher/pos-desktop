# TODO — pos-desktop (roadmap de desarrollo)

> Documento de planificación para sesiones futuras. Objetivo: **paridad funcional con
> pos-mobile** (Android) + capacidades extra del desktop (comunicación serial para
> impresora y báscula), moviendo las peticiones HTTP a **Rust** (Tauri) para mayor
> seguridad (el webview no ve token ni hace fetch directo).

---

## Principio rector

- **API desde Rust, no desde el frontend.** Todo `fetch`/HTTP debe hacerse en comandos
  Tauri (`src-tauri/src/api.rs` o similar), con el token gestionado en Rust. El frontend
  solo invoca comandos y recibe un `Result<serde_json::Value, String>`.
- Paridad de funciones con `pos-mobile`: cada pantalla/endpoint de Android debe existir
  en desktop. El desktop añade: impresión ESC/POS local y báscula serial (delegación de
  hardware al propio PC).

---

## FASE 0 — Migrar la capa HTTP a Rust (prerequisito de seguridad)

**Objetivo:** que NINGÚN `fetch` se haga desde el webview.

- [x] **`src-tauri/src/api.rs`** (nuevo módulo Rust): cliente HTTP con `reqwest`.
- [x] **Comando `api_request(path, method, body)`** expuesto en `lib.rs`.
- [x] **`src/api/client.ts`** reescrito: ya no usa `fetch`; llama
      `invoke('api_request', ...)` y traduce errores a `ApiError`/`NetworkError`.
- [x] `endpoints.ts` sin cambios de firma; internamente pasa por el nuevo `client.ts`.
- [x] Estado del servidor (IP/puerto/token) movido a `ApiState` en Rust
      (`api_set_server`, `api_set_token`).
- [ ] Persistir el token en Rust de forma segura (tauri-plugin-store/credenciales
      del SO; el login ya lo guarda vía setSession, pero se puede endurecer).

### Criterio de salida
- [x] El webview no contiene `fetch` a `http://IP` (todo pasa por `invoke`).
- [x] Login, productos, inventario y reportes funcionan vía comandos Rust.

---

## FASE 1 — Paridad de pantallas con pos-mobile (frontend)

**Objetivo:** mismas funciones que la app Android.

### Autenticación y conexión
- [x] `LoginScreen` real: tenant + PIN, persiste sesión en Rust (api_request).
- [x] `ConnectionScreen` conectada al UDP Rust (auto-reintento, banner, IP manual).
- [x] **Menú de usuario** en el avatar (TopAppBar): nombre, rol, tenant, estado de licencia
      y "Cerrar sesión".

### Terminal de ventas (POS)
- [x] `TerminalScreen`: búsqueda global con debounce, chips de categorías reales,
      catálogo grid, selector de cantidad + **3 precios por producto**.
- [x] Carrito (Zustand en memoria) + método de pago + `POST /sales` (vía Rust).
- [ ] Recibo digital con datos reales de `SaleResponse` + "Imprimir" (delegado a
      ESC/POS local en Fase 2) + "Compartir".
- [ ] Pantalla de "Nueva venta" navegable a un recibo (post-venta).

### Inventario
- [x] `InventoryScreen`: lista de productos reales, KPIs, filtro por categoría.
- [x] **CRUD completo de productos**: crear (`POST /products`), editar (`PATCH
      /products/:id`), eliminar (borrado lógico, `DELETE /products/:id`) y ajustar stock
      (`POST /inventory/adjustments`) — gated por `products:create/update/delete` e
      `inventory:adjust`. `ProductFormSheet` portado.

### Reportes
- [x] `ReportsScreen`: `GET /reports/quick-stats` (ventas hoy/ayer, ticket promedio,
      desglose por método y por categoría) + `GET /reports/sales-history`.
- [x] Pestaña "Reportes" visible solo con `reports:read`.

### Cortes de caja
- [ ] Portar los endpoints `/cashier/*` (turn-start, turn-end, daily) y su UI.

### Criterio de salida
- [ ] Cada pantalla de pos-mobile tiene su equivalente funcional en desktop.

---

## FASE 2 — Comunicación serial (impresora + báscula)

**Objetivo:** el PC con hardware imprime y pesa de forma nativa (Rust ya tiene
scaffold en `serial.rs`, `printer.rs`, `scale.rs`, `hardware.rs`).

### Impresora ESC/POS
- [x] `printer.rs`: builder ESC/POS (init, alineación, wrap, feed, corte, barcode, QR).
- [x] `list_ports` (serial/lugar del PC) y selección de impresora en UI de
      configuración (HardwareScreen).
- [ ] Imprimir el ticket real tras la venta (marcar `print_jobs` COMPLETED/FAILED vía
      Rust).
- [x] Orquestador con poll de `GET /print-jobs?status=PENDING` desde Rust e impresión
      local (RF-IM-002) — implementado en hardware.rs; falta exponer el flujo completo.

### Báscula
- [x] `scale.rs`: parser configurable (regex/fixed/line) con presets (Torrey/Rhino/
      Toledo/Genérico).
- [ ] Heartbeat cada 500ms publicando `device_status` (POST desde Rust) (RF-BA-002) —
      lectura emitida a UI vía evento `scale-reading`; falta el POST.
- [ ] Lectura del peso estable en el flujo de venta por peso / CAJ (RF-BA-003/004).
- [ ] `get_scale_reading` comando: peso actual cacheado.

### UI de configuración de hardware
- [x] `HardwareScreen`: listar puertos serial, probar impresora, leer peso de báscula,
      iniciar/detener orquestador de hardware. Ruta `/hardware` + acceso desde el
      Dashboard (engranaje).

### Criterio de salida
- [ ] Desde desktop se imprime un ticket real a la impresora del PC.
- [ ] La báscula del PC reporta peso y la venta por peso lo usa.

---

## FASE 3 — Sincronización y QoS (paridad completa)

- [ ] Sync command-based (`/sync/push`, `/sync/pull`, `/sync/ack`) desde Rust.
- [ ] Evento QoS post-venta y encuesta en desktop.
- [ ] Descubrimiento QR como fallback (RFC de emparejamiento).

---

## FASE 4 — Empaquetado y distribución (Windows)

- [ ] `npm run tauri build` → MSI/NSIS sin privilegios de admin.
- [ ] Configurar capacidades Tauri (permisos de procesos, store, opener).
- [ ] Ícono, nombre de ventana, tamaño mínimo (1280x800).
- [ ] Instalador que registra el back de Rust como dependencia del POS.

---

## Notas de arquitectura

- **Por qué Rust para HTTP**: el webview es un contenedor menos controlable; mover el
  token y las peticiones a Rust reduce superficie de ataque (el JWT no circula por el
  DOM) y da control de red nativo.
- **La impresión/báscula son DELEGADAS en desktop también** (RF-IM/RF-BA): el PC con
  `can_print`/`can_scale` ejecuta el hardware; los demás dispositivos encolan.
- El backend `pos-server` ya tiene los módulos REST para todo esto (reportes, ajustes,
  print-jobs, scale, sync). Sólo hace falta consumirlos desde Rust.
- Mantener `src/api/endpoints.ts` como única fuente de contratos tipados (el client Rust
  respeta la misma forma), para que migrar pantallas sea transparente.

---

## Prioridad sugerida (orden de trabajo)

1. **Fase 0** (HTTP→Rust) — base de seguridad, desbloquea todo.
2. **Fase 1** (pantallas) — paridad funcional visible.
3. **Fase 2** (serial) — valor único del desktop (impresora + báscula locales).
4. **Fase 3** (sync/QoS) y **Fase 4** (empaquetado).