/**
 * sync.store.ts — Estado de UI de sincronización (RF-SY).
 *
 * Portado verbatim desde pos-mobil. Solo refleja progreso para la UI.
 */
import {create} from 'zustand';

export interface SyncState {
  lastSyncAt: number | null;
  pendingCount: number;
  syncing: boolean;
  lastError: string | null;
  isOnline: boolean;

  setSyncing: (syncing: boolean) => void;
  setLastSync: (at: number) => void;
  setPendingCount: (count: number) => void;
  setLastError: (error: string | null) => void;
  setOnline: (online: boolean) => void;
  reset: () => void;
}

export const useSyncStore = create<SyncState>(set => ({
  lastSyncAt: null,
  pendingCount: 0,
  syncing: false,
  lastError: null,
  isOnline: false,

  setSyncing: syncing => set({syncing}),
  setLastSync: at => set({lastSyncAt: at}),
  setPendingCount: count => set({pendingCount: count}),
  setLastError: error => set({lastError: error}),
  setOnline: online => set({isOnline: online}),

  reset: () =>
    set({
      lastSyncAt: null,
      pendingCount: 0,
      syncing: false,
      lastError: null,
      isOnline: false,
    }),
}));