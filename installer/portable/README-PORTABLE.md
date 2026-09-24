# Distribución portable — POS Desktop (Windows)

> Sin admin, sin instalador MSI: copiar, ejecutar, listo.

## Contenido de la carpeta de distribución

```text
distribucion-pos-desktop/
  pos-desktop.exe        # binario release de `tauri build` (target/release/)
  version.txt            # versión (MISMA que tauri.conf.json + package.json + tag)
  instalar-desktop.bat   # instalador/actualizador idempotente (este repo)
```

## Instalación / actualización (en la caja)

1. Copiar la carpeta (USB) o descargar el ZIP.
2. Doble clic a `instalar-desktop.bat` (agregar `/startup` para auto-arranque).
3. El script copia a `%LOCALAPPDATA%\POS Desktop\pos-desktop.exe` (nombre
   estable), crea accesos en Escritorio + Menú inicio y reporta la versión.
4. **Actualizar = repetir**: compara `version.txt`; si es igual solo refresca
   accesos; si es nueva, cierra la app, reemplaza el exe y listo. No hay
   desinstalador (borrar `%LOCALAPPDATA%\POS Desktop` + accesos si se requiere).

## Primera ejecución en caja

1. Abrir POS Desktop → wizard de licencia (pegar `.lic`) — una sola vez.
2. Conexión (IP del server) → login → cambio de PIN inicial.
3. Hardware → seleccionar impresora USB 80mm.
4. Barra de tareas: fijar manualmente una vez (Windows no permite por script).

## Notas de release

- El `.exe` sale de `npm run tauri build` en máquina sin WDAC
  (`src-tauri/target/release/pos-desktop.exe`).
- Sincronizar SIEMPRE: `version.txt` ↔ `tauri.conf.json:version` ↔
  `package.json:version` ↔ tag git.
- Requiere WebView2 Runtime (inbox en Win10/11 desde 2021).
