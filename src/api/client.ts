/**
 * api/client.ts — Cliente HTTP del POS (capa única de red).
 *
 * Portado de pos-mobil. Cambios respecto al original:
 *   - buildBaseUrl lee la IP guardada con lib/storage (localStorage).
 *   - Todo lo demás (timeout, 401→refresh, errores tipados) idéntico.
 */
import {useServerStore} from '../stores/server.store';
import AsyncStorage from '../lib/storage';
import {HTTP_TIMEOUT_MS, STORAGE_SERVER_IP, STORAGE_SERVER_PORT} from '../constants/app';

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

async function buildBaseUrl(): Promise<string> {
  const {server} = useServerStore.getState();
  if (server) {
    return `http://${server.ip}:${server.port}`;
  }
  try {
    const ip = await AsyncStorage.getItem(STORAGE_SERVER_IP);
    if (ip) {
      const port = parseInt(
        (await AsyncStorage.getItem(STORAGE_SERVER_PORT)) ?? '3000',
        10,
      );
      return `http://${ip}:${port}`;
    }
  } catch {
    /* sin storage disponible */
  }
  throw new NetworkError('Servidor no configurado');
}

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
  const baseUrl = await buildBaseUrl();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  const headers: Record<string, string> = {'Content-Type': 'application/json'};
  if (auth) {
    const token = await getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (res.status === 401 && auth && !options.retried) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        return apiRequest<T>(path, {...options, retried: true});
      }
      throw new ApiError(401, 'UNAUTHORIZED', 'Sesión expirada');
    }

    if (!res.ok) {
      let payload: {code?: string; message?: string} = {};
      try {
        payload = await res.json();
      } catch {
        /* sin body */
      }
      throw new ApiError(
        res.status,
        payload.code ?? 'API_ERROR',
        payload.message ?? `Error ${res.status}`,
      );
    }

    if (res.status === 204) {
      return undefined as T;
    }
    const parsed = await res.json();
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'data' in parsed &&
      'statusCode' in parsed
    ) {
      return parsed.data as T;
    }
    return parsed as T;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new NetworkError('Tiempo de espera agotado');
    }
    throw new NetworkError();
  } finally {
    clearTimeout(timeout);
  }
}

async function getAccessToken(): Promise<string | null> {
  try {
    const {getStoredTokens} = await import('../stores/auth.store');
    const tokens = await getStoredTokens();
    return tokens?.access_token ?? null;
  } catch {
    return null;
  }
}

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
    return true;
  } catch {
    return false;
  }
}