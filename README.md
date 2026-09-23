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
│   ├── services/      # udp-discovery, serial, printer, scale, hardware
│   ├── screens/       # Connection, Login, Dashboard, POS, Inventario, etc.
│   ├── components/    # sistema de diseño glass
│   └── lib/           # shims de plataforma (storage, platform)
└── src-tauri/         # Backend Rust
    ├── src/           # udp.rs, serial.rs, printer.rs, scale.rs, lib.rs
    └── capabilities/  # permisos Tauri
```

## Garantía de calidad

Todo el código debe estar **optimizado para que la app no crashee, no tenga lag y ofrezca una UX fluida**. Ver requisitos en [AGENTS.md](./AGENTS.md) y en la [skill `pos-desktop`](./.opencode/skills/pos-desktop/SKILL.md).