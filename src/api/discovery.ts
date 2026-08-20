/**
 * api/discovery.ts — Descubrimiento del servidor (RF-DS-001..004).
 *
 * Portado de pos-mobil. Cambios:
 *   - El UDP broadcast lo ejecuta Rust vía comando Tauri `udp_discover`
 *     (ver src-tauri/src/udp.rs); no hay socket UDP en JS.
 *   - Se elimina el fallback del emulador Android (10.0.2.2).
 *   - Storage vía lib/storage (localStorage).
 */
import {invoke} from '@tauri-apps/api/core';

import AsyncStorage from '../lib/storage';
import {
  STORAGE_SERVER_IP,
  STORAGE_SERVER_PORT,
  UDP_DISCOVERY_PORT,
  UDP_DISCOVERY_MESSAGE,
} from '../constants/app';
import {useServerStore, ServerInfo} from '../stores/server.store';

export interface DiscoveredServer extends ServerInfo {
  tenantCode?: string;
}

export async function connectToSavedServer(): Promise<boolean> {
  const ip = await AsyncStorage.getItem(STORAGE_SERVER_IP);
  const portRaw = await AsyncStorage.getItem(STORAGE_SERVER_PORT);
  if (!ip) {
    return false;
  }
  const port = portRaw ? parseInt(portRaw, 10) : 3000;
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

export async function discoverServer(): Promise<DiscoveredServer | null> {
  const store = useServerStore.getState();

  const saved = await connectToSavedServer();
  if (saved) {
    const ip = (await AsyncStorage.getItem(STORAGE_SERVER_IP))!;
    const port = parseInt(
      (await AsyncStorage.getItem(STORAGE_SERVER_PORT)) ?? '3000',
      10,
    );
    store.resetFailures();
    store.setServer({ip, port});
    store.setStatus('connected');
    return {ip, port};
  }

  store.registerFailure();

  const udp = await broadcastDiscover();
  if (udp) {
    await AsyncStorage.setItem(STORAGE_SERVER_IP, udp.ip);
    await AsyncStorage.setItem(STORAGE_SERVER_PORT, String(udp.port));
    store.resetFailures();
    store.setServer(udp);
    store.setStatus('connected');
    return udp;
  }

  store.setStatus('failed');
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
        port: result.port ?? 3000,
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
    const port = parseInt(u.searchParams.get('port') ?? '3000', 10);
    const tenantCode = u.searchParams.get('tenant');
    return {ip, port, tenantCode: tenantCode ?? undefined};
  } catch {
    return null;
  }
}

export async function applyServer(server: DiscoveredServer): Promise<void> {
  await AsyncStorage.setItem(STORAGE_SERVER_IP, server.ip);
  await AsyncStorage.setItem(STORAGE_SERVER_PORT, String(server.port));
  const store = useServerStore.getState();
  store.resetFailures();
  store.setServer(server);
  store.setStatus('connected');
}