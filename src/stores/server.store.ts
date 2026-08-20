/**
 * server.store.ts — Estado del servidor descubierto (RF-DS).
 *
 * Portado verbatim desde pos-mobil (Zustand). El discovery vive en
 * src/api/discovery.ts; en pos-desktop el UDP lo ejecuta Rust vía comando
 * Tauri `udp_discover`.
 */
import {create} from 'zustand';

export interface ServerInfo {
  ip: string;
  port: number;
  tenantCode?: string | null;
  deviceName?: string | null;
  apiVersion?: string | null;
}

export type ServerStatus = 'idle' | 'connecting' | 'connected' | 'failed';

export interface ServerState {
  server: ServerInfo | null;
  status: ServerStatus;
  consecutiveFailures: number;
  lastError: string | null;

  setServer: (server: ServerInfo | null) => void;
  setStatus: (status: ServerStatus) => void;
  setLastError: (error: string | null) => void;
  registerFailure: () => void;
  resetFailures: () => void;
}

export const useServerStore = create<ServerState>(set => ({
  server: null,
  status: 'idle',
  consecutiveFailures: 0,
  lastError: null,

  setServer: server => set({server}),
  setStatus: status => set({status}),
  setLastError: error => set({lastError: error}),

  registerFailure: () =>
    set(state => ({consecutiveFailures: state.consecutiveFailures + 1})),

  resetFailures: () => set({consecutiveFailures: 0}),
}));