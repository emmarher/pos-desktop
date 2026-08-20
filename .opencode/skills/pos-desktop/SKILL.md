---
name: pos-desktop
description: Use when writing, editing, reviewing, porting or optimizing code in pos-desktop, the Tauri (Rust + React) POS desktop app ported from pos-mobil. Always enforce that the code is optimized so the app never crashes, never lags, and has an optimized, fluid UX.
---

# pos-desktop

Skill para trabajar en la app desktop POS basada en **Tauri v2** (Rust + React/TS + Vite + react-native-web), portada desde `pos-mobil`.

## Regla de oro

> **El código SIEMPRE debe estar optimizado para que la app NO crashee, NO tenga lag, y ofrezca una UX optimizada y fluida.**

Aplica a **todo**: código nuevo, porte de código existente, refactors y revisiones. Cada cambio se evalúa contra esta regla antes de darse por terminado.

## Contexto del proyecto

- **Frontend** (carpeta `src/`): React + TypeScript, UI portada de React Native con **react-native-web** (Vite aliasea `react-native`). Se reutilizan `models`, `constants`, `stores` (Zustand) y `api` de `pos-mobil`.
- **Backend Rust** (`src-tauri/src/`): comandos Tauri para UDP discovery (`udp.rs`), serial de impresora/báscula (`serial.rs`, `printer.rs`, `scale.rs`).
- **Arquitectura delegada**: el frontend no toca el serial directamente. Impresión → encolar `PrintJob` en el servidor; el dispositivo `can_print` hace polling y ejecuta. Báscula → el dispositivo `can_scale` envía heartbeat; el frontend consulta `GET /scale/current`.

## Cómo portar código de pos-mobil (reglas de oro del porte)

1. **Reutilizar, no reescribir**: lógica pura (models, constants, stores, endpoints, client) se copia sin cambios de comportamiento.
2. **Solo cambian las dependencias de plataforma**, mediante shims en `src/lib/`:
   - `storage.ts`: emula AsyncStorage (`getItem/setItem/removeItem`) sobre `localStorage`.
   - `platform.ts`: fuerza `Platform.OS === 'windows'`.
   - `react-native-udp` → comando Tauri `udp_discover` (Rust hace broadcast).
   - No usar `react-native-keychain` ni `react-native-device-info`: el `device_id` se genera y persiste en storage.
3. **Cada pantalla/componente portado debe validarse** contra la regla de oro en el runtime web (WebView2); no heredar bugs de rendimiento del original.
4. **UI**: mantener imports de `react-native` (react-native-web los resuelve). Respetar el sistema de diseño glass (theme tokens).

## Checklist de estabilidad (no crasheos)

- [ ] Acceso anidado siempre con `?.` / `??` / helpers seguros.
- [ ] Toda I/O (red, serial, UDP, storage) con `try/catch`, timeouts y degradación controlada.
- [ ] No asumir servidor disponible: manejar timeout, rechazo de conexión, JSON inválido, estados de conexión.
- [ ] Listeners limpiados en unmount/teardown (evitar doble-suscripción y fugas).
- [ ] `ErrorBoundary` en pantallas y componentes críticos.
- [ ] Datos serial/UDP con buffers limitados y parsing incremental.

## Checklist de rendimiento (sin lag)

- [ ] Componentes con `React.memo`; selectores Zustand granulares (por campo, no el store entero).
- [ ] `useCallback`/`useMemo` solo donde aportan; nunca definir funciones/objetos en el render para props críticas.
- [ ] Listas grandes virtualizadas o paginadas (nunca miles de filas sin virtualizar).
- [ ] Rust nunca bloquea: serial/UDP con timeouts; sin trabajo síncrono pesado en el hilo principal de JS.
- [ ] Discovery UDP con timeout y cancelación; sin acumulación de datos.
- [ ] Recursos con lazy load; blur del tema glass acotado para WebView2.
- [ ] Animaciones a 60fps estables.

## Checklist de UX

- [ ] Feedback inmediato: estados de carga, botones deshabilitados en proceso, errores claros.
- [ ] Flujos POS mínimos en pasos, sin bloqueos ni modales anidados.
- [ ] Indicador de conexión al servidor visible con reconexión automática.
- [ ] Diseño glass consistente con `pos-mobil`.
- [ ] Accesibilidad: contraste, foco visible, teclado para acciones frecuentes.

## Verificación

- `npm run tauri dev` y `npm run tauri build`.
- `npx tsc --noEmit` (TypeScript estricto).
- Consola de WebView2: cero errores no controlados, cero warnings de memoria.
- Pruebas límite: servidor apagado, UDP sin respuesta, impresora/báscula desconectadas, miles de ítems, corte de caja.