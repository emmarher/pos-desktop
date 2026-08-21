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

- [ ] **`src-tauri/src/api.rs`** (nuevo módulo Rust):
  - [ ] `POST/GET/PATCH` genérico sobre el servidor descubierto (usa `reqwest` con
        timeout, basado en la IP guardada en estado Rust).
  - [ ] Manejo del envoltorio `{statusCode, message, data}` (desempaquetar `data`).
  - [ ] Manejo del `Bearer` token en memoria de Rust (sin exponerlo al front).
  - [ ] `401 → refresh` automático dentro de Rust.
- [ ] **Comando `api_request(path, method, body)`** expuesto en `lib.rs`.
- [ ] **`src/api/client.ts`** reescrito: ya no usa `fetch`; llama
      `invoke('api_request', ...)` y traduce errores a `ApiError`/`NetworkError`.
- [ ] `endpoints.ts` sin cambios de firma; internamente pasa por el nuevo `client.ts`
      que usa Rust.
- [ ] Estado del servidor descubierto (IP/puerto) movido a `AppState` en Rust (o
      persistido de forma que Rust lo lea), para que las peticiones salgan de Rust.
- [ ] Almacenar el token de sesión de forma segura (Rust `tauri-plugin-store` o
      credenciales del SO; NO en `localStorage`).

### Criterio de salida
- El webview no contiene `fetch` a `http://IP` (grep debe dar 0 en `src/` salvo
  `invoke`).
- Login, productos e inventario funcionan vía comandos Rust.

---

## FASE 1 — Paridad de pantallas con pos-mobile (frontend)

**Objetivo:** mismas funciones que la app Android.

### Autenticación y conexión
- [ ] `LoginScreen` real (hoy es placeholder): tenant + PIN, persiste sesión en Rust.
- [ ] `ConnectionScreen` ya conectada al UDP Rust (verificar contra pos-mobile:
      auto-reintento 5s, banner "servidor no disponible", IP manual, búsqueda).

### Terminal de ventas (POS)
- [ ] `TerminalScreen`: búsqueda global con debounce, chips de categorías reales,
      catálogo grid, selector de cantidad + **3 precios por producto** (Público/
      Mayoreo/Especial).
- [ ] Carrito (Zustand en memoria) + método de pago + `POST /sales` (vía Rust).
- [ ] Recibo digital con datos reales de `SaleResponse` + "Imprimir" (delegado a ESC/POS
      local en Fase 3) + "Compartir".

### Inventario
- [ ] `InventoryScreen`: lista de productos reales, KPIs (total/agotados/categorías),
      filtro por categoría.
- [ ] **Editar/ajustar stock**: `POST /inventory/adjustments` (sheet con cantidad ± y
      motivo) — solo Admin (`inventory:adjust`).
- [ ] FAB "+" crear producto (`POST /products` con precios) — solo Admin
      (`products:create`).

### Reportes
- [ ] `ReportsScreen`: `GET /reports/quick-stats` (ventas hoy/ayer, ticket promedio,
      desglose por método y por categoría) + `GET /reports/sales-history`.
- [ ] Pestaña "Reportes" visible solo con `reports:read` (el Vendedor no la ve).

### Cortes de caja
- [ ] Portar los endpoints `/cashier/*` (turn-start, turn-end, daily) y su UI.

### Navegación
- [ ] BottomNav (Productos/Inventario/Reportes) + TopAppBar con avatar y "Cerrar sesión".
- [ ] Layout desktop responsive (ya existe `useWindowBreakpoint`).

### Criterio de salida
- Cada pantalla de pos-mobile tiene su equivalente funcional en desktop.
- Ventas, inventario, ajustes de stock y reportes operan contra el backend real.

---

## FASE 2 — Comunicación serial (impresora + báscula)

**Objetivo:** el PC con hardware imprime y pesa de forma nativa (Rust ya tiene
scaffold en `serial.rs`, `printer.rs`, `scale.rs`, `hardware.rs`).

### Impresora ESC/POS
- [ ] Completar `printer.rs`: builder de ticket (80mm, encabezado, items, totales,
      pagos, cambio, agradecimiento, corte).
- [ ] `list_ports` (serial/lugar del PC) y selección de impresora (USB/RAW_TCP_9100 o
      serie) en UI de configuración.
- [ ] Imprimir el ticket real tras la venta (marcar `print_jobs` COMPLETED/FAILED vía
      Rust).
- [ ] Cola de impresión delegada: poll de `GET /print-jobs?status=PENDING` desde Rust
      cada 2s y ejecución local (RF-IM-002).

### Báscula
- [ ] Completar `scale.rs`: parser configurable (Torrey/Rhino/Toledo/Genérico).
- [ ] Heartbeat cada 500ms publicando `device_status` (POST desde Rust) (RF-BA-002).
- [ ] Lectura del peso estable en el flujo de venta por peso / CAJ (RF-BA-003/004).
- [ ] `get_scale_reading` comando: peso actual cacheado.

### UI de configuración de hardware
- [ ] Pantalla "Hardware": listar puertos serial, probar impresora (impresión de
      prueba), probar báscula (leer peso), guardar config en Rust.

### Criterio de salida
- Desde desktop se imprime un ticket real a la impresora del PC.
- La báscula del PC reporta peso y la venta por peso lo usa.

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