/**
 * api/client.ts — Cliente HTTP del POS (capa única de red).
 *
 * ────────────────────────────────────────────────────────────────────────
 * SEGURIDAD: TODAS las peticiones HTTP salen de RUST (comandos Tauri
 * `api_*`), NO del webview. Este cliente solo invoca comandos y traduce
 * errores a ApiError/NetworkError. El JWT vive en Rust (no circula por
 * el DOM).
 *
 * Flujo:
 *   - El discovery (Rust) u applyServer fija la IP/puerto en Rust
 *     (api_set_server) y el token en Rust (api_set_token).
 *   - apiRequest invoca `api_request(path, {method, body, auth})`.
 * ────────────────────────────────────────────────────────────────────────
 */
import {invoke} from '@tauri-apps/api/core';
import {useServerStore} from '../stores/server.store';
import AsyncStorage from '../lib/storage';
import {STORAGE_SERVER_IP, STORAGE_SERVER_PORT} from '../constants/app';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class NetworkError extends ApiError {
  constructor(message = 'Servidor no disponible') {
    super(0, 'NETWORK', message);
  }
}

/** Sincroniza el servidor descubierto hacia Rust (api_set_server). */
export async function syncServerToRust(ip: string, port: number): Promise<void> {
  try {
    await invoke('api_set_server', {ip, port});
  } catch (e) {
    console.warn('No se pudo fijar el servidor en Rust', e);
  }
}

/** Guarda el access token en Rust (api_set_token). */
export async function syncTokenToRust(token: string | null): Promise<void> {
  try {
    await invoke('api_set_token', {token});
  } catch (e) {
    console.warn('No se pudo fijar el token en Rust', e);
  }
}

/**
 * Ejecuta una petición HTTP vía Rust (api_request).
 * Arma la cabecera de auth desde el token de Rust (no del webview).
 */
export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    auth?: boolean;
    retried?: boolean;
  } = {},
): Promise<T> {
  const {method = 'GET', body, auth = true} = options;

  // Asegurar que Rust tenga el servidor configurado (si no, leer del storage
  // y fijarlo; si tampoco hay, lanzar NetworkError).
  const store = useServerStore.getState();
  const server = store.server ?? {
    ip: (await AsyncStorage.getItem(STORAGE_SERVER_IP)) ?? '',
    port: parseInt((await AsyncStorage.getItem(STORAGE_SERVER_PORT)) ?? '3000', 10),
  };
  if (!server.ip) {
    throw new NetworkError('Servidor no configurado');
  }
  await syncServerToRust(server.ip, server.port ?? 3000);

  // Sincronizar el token hacia Rust una vez por sesión (auth).
  if (auth) {
    const {getStoredTokens} = await import('../stores/auth.store');
    const tokens = await getStoredTokens();
    await syncTokenToRust(tokens?.access_token ?? null);
  }

  try {
    const result = await invoke<unknown>('api_request', {
      input: {
        path,
        method,
        auth,
        // invoke serializa el body; pasar undefined si es GET sin body
        body: body !== undefined ? (body as Record<string, unknown>) : undefined,
      },
    });
    return result as T;
  } catch (err) {
    // Los errores de Rust llegan como string (mensaje del backend/server).
    const message = typeof err === 'string' ? err : JSON.stringify(err);
    // 401 → intentar refresh y reintentar una vez.
    if (auth && !options.retried && /sesión|401|sessión|expirad/i.test(message)) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        return apiRequest<T>(path, {...options, retried: true});
      }
      throw new ApiError(401, 'UNAUTHORIZED', 'Sesión expirada');
    }
    throw new NetworkError(message ?? 'No se pudo conectar con el servidor');
  }
}

/** POST /auth/refresh vía Rust; guarda el nuevo par de tokens. */
async function tryRefreshToken(): Promise<boolean> {
  try {
    const {getStoredTokens, saveStoredTokens} = await import(
      '../stores/auth.store'
    );
    const tokens = await getStoredTokens();
    if (!tokens?.refresh_token) {
      return false;
    }
    const refreshed = await apiRequest<{
      access_token: string;
      refresh_token: string;
    }>('/auth/refresh', {
      method: 'POST',
      body: {refresh_token: tokens.refresh_token},
      auth: false,
    });
    await saveStoredTokens({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
    });
    await syncTokenToRust(refreshed.access_token);
    return true;
  } catch {
    return false;
  }
}