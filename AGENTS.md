# AGENTS.md

Instrucciones para agentes de IA (y desarrolladores) que trabajen en **pos-desktop**.

## Regla de oro (obligatoria en TODO cambio de código)

> **El código SIEMPRE debe estar optimizado para que la app NO crashee, NO tenga lag, y ofrezca una UX optimizada y fluida.**

Esto es un requisito inamovible: cada PR, archivo o función debe cumplirlo. No es opcional ni postergable.

## Qué hace este proyecto

- **Frontend**: React 18 + TypeScript + Vite, renderizado en webview Tauri (WebView2). La UI es un **porte** de `pos-mobil` (React Native) usando react-native-web: se reutilizan components/screens/stores/api con shims de plataforma.
- **Backend (Rust)**: comandos Tauri para UDP discovery, puerto serial (impresora ESC/POS y báscula).
- **Arquitectura cliente-servidor**: el frontend delega la impresión y la lectura de báscula al servidor; el dispositivo con `can_print`/`can_scale` hace polling/heartbeat.

## Convenciones de calidad (obligatorias)

### Estabilidad (que no crashee)
- **Nunca** acceder a propiedades anidadas sin validar: usar optional chaining (`?.`), nullish coalescing (`??`), y helpers `safeGet`.
- Toda función que haga I/O (red, serial, UDP, storage) debe capturar errores con `try/catch` y degradar con gracia: mostrar estado de UI, reintentar con backoff, nunca lanzar excepciones no controladas al render.
- No asumir que el servidor está disponible: manejar timeout, `ECONNREFUSED`, respuestas no JSON, y estados de conexión (conectando/conectado/fallo).
- Los listeners (eventos serial/UDP/websocket) deben limpiarse en unmount/teardown para evitar doble-suscripción y fugas de memoria.
- Fronteras de error en React (ErrorBoundary) alrededor de pantallas y componentes críticos.

### Rendimiento (que no tenga lag)
- **Cero re-renders innecesarios**: componentes con `React.memo`, selectores Zustand granulares (seleccionar campos, no el store completo), `useCallback`/`useMemo` donde aporten, nunca definir funciones/objetos en el cuerpo del render para props que importan.
- **Listas grandes** (inventario, ventas, clientes): usar virtualización, paginación o al menos `FlatList`/`React.memo` con keys estables. Nunca renderizar miles de filas sin virtualizar.
- **I/O no bloqueante**: el hilo de Rust nunca debe bloquear; operaciones serial/UDP con timeouts. En JS, nada síncrono pesado en el hilo principal.
- **UDP y serial**: buffers limitados, parsing incremental, sin acumular datos infinitos. El broadcast de discovery debe ejecutarse con timeout y cancelarse.
- **Imágenes/recursos**: lazy load, sin re-descargas; el tema glass evita blur excesivo que penalice WebView2.
- Medir con DevTools de WebView2; los FPS de animaciones deben ser 60fps estables.

### UX optimizada y fluida
- Feedback inmediato en acciones: estados de carga (spinners esqueletos), deshabilitar botones mientras se procesa, y mensajes de error claros.
- Los flujos de POS (cobro, búsqueda de producto, corte de caja) deben ser de la menor cantidad de pasos posible, sin bloqueos ni modales anidados innecesarios.
- Estados de conexión visibles (barra de servidor conectado/desconectado), con reconexión automática transparente.
- Respetar el sistema de diseño **glass** existente en `pos-mobil` (theme tokens y componentes) al portar; no introducir diseños divergentes.
- Accesibilidad básica: contraste legible, foco visible, soporte de teclado para acciones frecuentes (buscar producto, cobrar).

## Porte desde pos-mobil (reglas específicas)

- Reutilizar **sin reescribir** la lógica pura: `models`, `constants`, `stores` (Zustand) y `api` (`client`, `discovery`, `endpoints`).
- Cambiar únicamente las dependencias de plataforma, vía shims en `src/lib/`:
  - `storage.ts`: API compatible con AsyncStorage (`getItem/setItem/removeItem`) sobre `localStorage`.
  - `platform.ts`: `Platform.OS === 'windows'`.
  - `react-native-udp` → comando Tauri `udp_discover`.
  - `react-native-keychain` / `react-native-device-info` → no usar; el device_id se genera y persiste en storage.
- La UI se porta con **react-native-web**: mantener imports de `react-native` y que Vite los alíe.
- Al portar una pantalla/componente, **verificar** que cumple la regla de oro (rendimiento + estabilidad) en el nuevo runtime; no copiar bugs de rendimiento del original.

## Cómo verificar

- `npm run tauri dev` para desarrollo.
- `npm run tauri build` para producción.
- TypeScript estricto: `npx tsc --noEmit`.
- Revisar en consola de WebView2: cero errores no controlados, cero warnings de memoria/react.
- Probar escenarios límite: servidor apagado, UDP sin respuesta, impresora/báscula desconectada, listas de miles de ítems, corte de caja.