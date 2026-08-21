# Changelog

Todas las versiones notables de **pos-desktop** se documentan aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.1.0/).
Este proyecto usa [Semantic Versioning](https://semver.org/).

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