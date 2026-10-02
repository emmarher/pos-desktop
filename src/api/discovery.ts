/**
 * api/discovery.ts — Descubrimiento del servidor (RF-DS-001..004).
 *
 * Portado de pos-mobil. Cambios:
 *   - El UDP broadcast lo ejecuta Rust vía comando Tauri `udp_discover`
 *     (ver src-tauri/src/udp.rs); no hay socket UDP en JS.
 *   - Se elimina el fallback del emulador Android (10.0.2.2).
 *   - Capas de descubrimiento (en orden): guardado → mDNS → UDP → 127.0.0.1.
 *     El barrido /24 (`sweepLan`) es una acción manual de último recurso.
 *   - Storage vía lib/storage (localStorage).
 */
import {invoke} from '@tauri-apps/api/core';
import {syncServerToRust} from './client';

import AsyncStorage from '../lib/storage';
import {
  API_PORT,
  STORAGE_SERVER_IP,
  STORAGE_SERVER_PORT,
  UDP_DISCOVERY_PORT,
  UDP_DISCOVERY_MESSAGE,
} from '../constants/app';
import {useServerStore, ServerInfo} from '../stores/server.store';

export interface DiscoveredServer extends ServerInfo {
  tenantCode?: string | null;
}

export async function connectToSavedServer(): Promise<boolean> {
  const ip = await AsyncStorage.getItem(STORAGE_SERVER_IP);
  const portRaw = await AsyncStorage.getItem(STORAGE_SERVER_PORT);
  if (!ip) {
    return false;
  }
  const port = portRaw ? parseInt(portRaw, 10) : API_PORT;
  return testServer({ip, port});
}

export async function testServer(server: ServerInfo): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`http://${server.ip}:${server.port}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

/** Persiste el servidor hallado y actualiza el store. */
async function persistDiscovered(
  server: DiscoveredServer,
): Promise<DiscoveredServer> {
  await AsyncStorage.setItem(STORAGE_SERVER_IP, server.ip);
  await AsyncStorage.setItem(STORAGE_SERVER_PORT, String(server.port));
  const store = useServerStore.getState();
  store.resetFailures();
  store.setServer(server);
  store.setStatus('connected');
  return server;
}

export async function discoverServer(): Promise<DiscoveredServer | null> {
  const store = useServerStore.getState();

  // 1) Servidor guardado de una sesión anterior.
  if (await connectToSavedServer()) {
    const ip = (await AsyncStorage.getItem(STORAGE_SERVER_IP))!;
    const port = parseInt(
      (await AsyncStorage.getItem(STORAGE_SERVER_PORT)) ?? String(API_PORT),
      10,
    );
    return persistDiscovered({ip, port: Number.isFinite(port) ? port : API_PORT});
  }

  store.registerFailure();

  // 2) mDNS y UDP en paralelo (mismo timeout): cubre redes que filtran el
  //    broadcast y puertos no default, sin encadenar latencias. Se prefiere
  //    mDNS cuando ambos responden.
  const [mdns, udp] = await Promise.all([browseMdns(), broadcastDiscover()]);
  const found = mdns ?? udp;
  if (found) return persistDiscovered(found);

  // 3) Mismo equipo: server y desktop en la misma máquina (127.0.0.1).
  const local = await tryLocalhost();
  if (local) return persistDiscovered(local);

  store.setStatus('failed');
  return null;
}

/** mDNS: resuelve `_pos-server._tcp.local` vía Rust (`mdns_discover`). */
export async function browseMdns(): Promise<DiscoveredServer | null> {
  try {
    const result = await invoke<{
      ip: string;
      port?: number;
      tenant_id?: string;
      device_name?: string;
      api_version?: string;
    } | null>('mdns_discover', {timeoutMs: 3000});
    if (result) {
      const candidate: DiscoveredServer = {
        ip: result.ip,
        port: result.port ?? API_PORT,
        tenantCode: result.tenant_id,
        deviceName: result.device_name,
        apiVersion: result.api_version,
      };
      if (await testServer(candidate)) {
        return candidate;
      }
    }
  } catch {
    /* mDNS no disponible en esta plataforma/red */
  }
  return null;
}

export async function broadcastDiscover(): Promise<DiscoveredServer | null> {
  try {
    const result = await invoke<{
      ip: string;
      port?: number;
      tenant_id?: string;
      device_name?: string;
      api_version?: string;
    } | null>('udp_discover', {
      message: UDP_DISCOVERY_MESSAGE,
      port: UDP_DISCOVERY_PORT,
    });
    if (result) {
      const candidate: DiscoveredServer = {
        ip: result.ip,
        port: result.port ?? API_PORT,
        tenantCode: result.tenant_id,
        deviceName: result.device_name,
        apiVersion: result.api_version,
      };
      if (await testServer(candidate)) {
        return candidate;
      }
    }
  } catch {
    /* UDP no disponible en esta plataforma */
  }
  return null;
}

/** Fallback: server en la misma máquina (puerto guardado o default). */
export async function tryLocalhost(): Promise<DiscoveredServer | null> {
  const saved = await AsyncStorage.getItem(STORAGE_SERVER_PORT);
  const parsed = saved ? parseInt(saved, 10) : NaN;
  const candidate: DiscoveredServer = {
    ip: '127.0.0.1',
    port: Number.isFinite(parsed) && parsed > 0 ? parsed : API_PORT,
  };
  return (await testServer(candidate)) ? candidate : null;
}

/**
 * Barrido /24 (último recurso, manual): detecta el segmento local y prueba
 * el puerto del API en las 254 direcciones. Ruidoso y lento a propósito.
 */
export async function sweepLan(
  port: number = API_PORT,
): Promise<DiscoveredServer | null> {
  try {
    const prefix = await invoke<string | null>('local_subnet');
    if (!prefix) return null;
    const ips = await invoke<string[]>('sweep_subnet', {
      prefix,
      port,
      timeoutMs: 400,
    });
    for (const ip of ips) {
      const candidate: DiscoveredServer = {ip, port};
      if (await testServer(candidate)) {
        return candidate;
      }
    }
  } catch {
    /* barrido no disponible */
  }
  return null;
}

export function parseQrPairing(url: string): DiscoveredServer | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'pos:') {
      return null;
    }
    const ip = u.searchParams.get('ip');
    if (!ip) {
      return null;
    }
    const port = parseInt(u.searchParams.get('port') ?? String(API_PORT), 10);
    const tenantCode = u.searchParams.get('tenant');
    return {ip, port, tenantCode: tenantCode ?? undefined};
  } catch {
    return null;
  }
}

export async function applyServer(server: DiscoveredServer): Promise<void> {
  await AsyncStorage.setItem(STORAGE_SERVER_IP, server.ip);
  await AsyncStorage.setItem(STORAGE_SERVER_PORT, String(server.port));
  // Fijar el servidor en Rust (para que api_request salga de ahí).
  await syncServerToRust(server.ip, server.port ?? API_PORT);
  const store = useServerStore.getState();
  store.resetFailures();
  store.setServer(server);
  store.setStatus('connected');
}
