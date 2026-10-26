/**
 * lib/serverBase.ts — Fuente ÚNICA de la dirección del servidor POS.
 *
 * ────────────────────────────────────────────────────────────────────────
 * Por qué existe este módulo:
 *   - La dirección del servidor vive en dos sitios: el store Zustand
 *     (`server.store.ts`, SOLO memoria) y `AsyncStorage` (persistida).
 *   - Antes, la API leía ambos (`resolveServer`), pero la resolución de
 *     imágenes leía únicamente el store. Tras reiniciar la app con sesión
 *     guardada el store está vacío, la API seguía funcionando por el
 *     fallback a storage y las MINIATURAS caían al placeholder aunque el
 *     catálogo cargara bien.
 *   - Aquí se centraliza: lectura persistida, hidratación del store al
 *     arrancar, resolución async (API) y hook reactivo (imágenes).
 * ────────────────────────────────────────────────────────────────────────
 */
import {useServerStore, type ServerInfo} from '../stores/server.store';
import AsyncStorage from './storage';
import {API_PORT, STORAGE_SERVER_IP, STORAGE_SERVER_PORT} from '../constants/app';

/**
 * Origen de respaldo SOLO en dev: server y desktop en la misma máquina.
 * En build de producción es `null` (nunca se inventa un servidor).
 */
const DEV_FALLBACK_ORIGIN: string | null = (() => {
  try {
    // @ts-ignore import.meta env (Vite)
    return import.meta.env?.DEV ? `http://127.0.0.1:${API_PORT}` : null;
  } catch {
    return null;
  }
})();

/** Puerto seguro (número finito) o el default del API. */
function safePort(raw: string | number | null | undefined): number {
  const port = typeof raw === 'number' ? raw : parseInt(raw ?? '', 10);
  return Number.isFinite(port) && port > 0 ? port : API_PORT;
}

/** `http://ip:puerto` o null si no hay host. */
function toOrigin(info: ServerInfo | null | undefined): string | null {
  const ip = info?.ip?.trim();
  if (!ip) return null;
  return `http://${ip}:${safePort(info?.port)}`;
}

/**
 * Servidor persistido de una sesión anterior (null si no hay o si el
 * storage falla: la app debe arrancar igual, solo sin imágenes remotas).
 */
export async function readServerFromStorage(): Promise<ServerInfo | null> {
  try {
    const ip = (await AsyncStorage.getItem(STORAGE_SERVER_IP))?.trim() ?? '';
    if (!ip) return null;
    const portRaw = await AsyncStorage.getItem(STORAGE_SERVER_PORT);
    return {ip, port: safePort(portRaw)};
  } catch {
    return null;
  }
}

/**
 * Hidrata el store desde AsyncStorage. Se llama UNA vez en el boot de la
 * app. No pisa un servidor ya fijado por discovery o conexión manual.
 */
export async function hydrateServerStore(): Promise<void> {
  if (useServerStore.getState().server?.ip) return;
  const saved = await readServerFromStorage();
  if (!saved || useServerStore.getState().server?.ip) return;
  useServerStore.setState({
    server: saved,
    status: 'connected',
    lastError: null,
  });
}

/**
 * Resuelve el servidor igual que antes lo hacía el cliente HTTP:
 * store en memoria → storage persistido → fallback dev (misma máquina).
 */
export async function resolveServerInfo(): Promise<ServerInfo | null> {
  const stored = useServerStore.getState().server;
  if (stored?.ip) return {ip: stored.ip, port: safePort(stored.port)};
  const persisted = await readServerFromStorage();
  if (persisted) return persisted;
  return DEV_FALLBACK_ORIGIN ? {ip: '127.0.0.1', port: API_PORT} : null;
}

/**
 * Origen HTTP del backend SIN React (para callers no-componente):
 * `http://ip:puerto`. En dev, si aún no hay servidor configurado, usa el
 * mismo fallback que la API (127.0.0.1) para no divergir.
 */
export function getServerOrigin(): string | null {
  return toOrigin(useServerStore.getState().server) ?? DEV_FALLBACK_ORIGIN;
}

/**
 * Hook reactivo: se re-renderiza cuando el servidor aparece o cambia
 * (p. ej. la hidratación del boot termina después del primer render).
 * Devuelve null mientras no haya servidor → el caller muestra placeholder.
 */
export function useServerOrigin(): string | null {
  return useServerStore(state => toOrigin(state.server) ?? DEV_FALLBACK_ORIGIN);
}

/** Fallback dev expuesto para diagnósticos/tests. */
export const SERVER_ORIGIN_DEV_FALLBACK = DEV_FALLBACK_ORIGIN;
