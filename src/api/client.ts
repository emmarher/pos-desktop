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

/** ¿El error es de conectividad (no de autenticación ni de negocio)? */
export function isNetworkError(err: unknown): boolean {
  return err instanceof NetworkError;
}

/**
 * Limpia credenciales muertas en local (storage + Rust + estado Zustand).
 * Se invoca cuando el refresh token ya no es válido: evita sesiones
 * fantasma tras un reset de BD o expiración real.
 */
async function forceLocalLogout(): Promise<void> {
  try {
    const {useAuthStore} = await import('../stores/auth.store');
    await useAuthStore.getState().logout();
  } catch {
    /* la limpieza de UI es best-effort; lo crítico es el storage */
  }
  await syncTokenToRust(null);
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

    /* Formato nuevo de Rust: "[código] mensaje" para errores HTTP.
       Permite distinguir 401 (sesión muerta) de un fallo de red real. */
    const statusMatch = message.match(/^\[(\d{3})\]\s*([\s\S]*)$/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1] ?? '0', 10);
      const msg = statusMatch[2] || 'Error del servidor';
      if (auth && !options.retried && status === 401) {
        const refreshed = await tryRefreshToken();
        if (refreshed) {
          return apiRequest<T>(path, {...options, retried: true});
        }
        // Refresh imposible → sesión muerta: limpiar credenciales locales
        // y propagar el 401 (el router manda a login por isAuthenticated).
        await forceLocalLogout();
      }
      throw new ApiError(status, status === 401 ? 'UNAUTHORIZED' : 'HTTP_ERROR', msg);
    }

    /* Fallback legado: mensajes sin código. Solo se trata como sesión
       expirada si la heurística de texto lo indica; todo lo demás es
       error de red/conectividad. */
    if (
      auth &&
      !options.retried &&
      /sesión|sessión|expirad/i.test(message) &&
      !/No se pudo conectar/i.test(message)
    ) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        return apiRequest<T>(path, {...options, retried: true});
      }
      await forceLocalLogout();
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