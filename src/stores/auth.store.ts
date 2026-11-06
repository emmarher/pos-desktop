/**
 * auth.store.ts — Autenticación y licencia (RF-AU).
 *
 * En pos-desktop no hay keychain ni AsyncStorage: se persiste vía el shim
 * lib/storage.ts (localStorage) y Platform.OS siempre es 'windows'.
 *
 * DECISIÓN (sesión): los tokens viven SOLO en memoria. Cada arranque de la
 * app exige login; nunca se restaura una sesión anterior. Así el access
 * token siempre viene de /auth/login, con los permisos resueltos de BD.
 * Se conservan (sin ser credenciales) la IP del servidor y el branding.
 */
import {create} from 'zustand';

import AsyncStorage from '../lib/storage';
import {AuthResponse} from '../models';
import {
  STORAGE_LICENSE_EXPIRY,
  STORAGE_TENANT,
  STORAGE_LICENSE,
  LICENSE_GRACE_DAYS,
} from '../constants/app';

/** Clave de versiones anteriores; solo se usa para borrar restos. */
const KEYCHAIN_AUTH = 'pos.auth.tokens';

export interface PersistedTokens {
  access_token: string;
  refresh_token: string;
}

export interface AuthState {
  tenantId: string | null;
  userId: string | null;
  deviceId: string | null;
  user: AuthResponse['user'] | null;
  tenant: AuthResponse['tenant'] | null;
  license: AuthResponse['license'] | null;
  isAuthenticated: boolean;
  licenseState: 'active' | 'grace' | 'expired' | 'unknown';
  isLoading: boolean;
  error: string | null;

  setSession: (auth: AuthResponse) => Promise<void>;
  validateLicense: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

/** Tokens de la sesión actual: SOLO memoria (nunca localStorage). */
let memoryTokens: PersistedTokens | null = null;

function storeTokens(tokens: PersistedTokens) {
  memoryTokens = tokens;
}

async function readTokens(): Promise<PersistedTokens | null> {
  return memoryTokens;
}

export async function getStoredTokens(): Promise<PersistedTokens | null> {
  return readTokens();
}

export async function saveStoredTokens(tokens: PersistedTokens): Promise<void> {
  storeTokens(tokens);
}

/**
 * Borra credenciales que versiones anteriores sí persistían. Se llama una
 * vez al arrancar: una instalación que auto-entraba deja de hacerlo al
 * actualizar, sin esperar a que el usuario cierre sesión.
 */
export async function clearPersistedSession(): Promise<void> {
  memoryTokens = null;
  try {
    await AsyncStorage.removeItem(KEYCHAIN_AUTH);
  } catch {
    /* best-effort: si falla, la memoria ya está limpia */
  }
}

export const useAuthStore = create<AuthState>(set => ({
  tenantId: null,
  userId: null,
  deviceId: null,
  user: null,
  tenant: null,
  license: null,
  isAuthenticated: false,
  licenseState: 'unknown',
  isLoading: false,
  error: null,

  setSession: async auth => {
    // Solo memoria: al cerrar la app no queda credencial (ver clearPersistedSession).
    storeTokens({
      access_token: auth.access_token,
      refresh_token: auth.refresh_token,
    });
    await AsyncStorage.setItem(
      STORAGE_LICENSE_EXPIRY,
      auth.license.expires_at,
    );
    // Cachear branding: navbar necesita logo/nombre al reiniciar (incluso offline).
    await AsyncStorage.setItem(STORAGE_TENANT, JSON.stringify(auth.tenant));
    await AsyncStorage.setItem(STORAGE_LICENSE, JSON.stringify(auth.license));
    set({
      tenantId: auth.user.tenant_id,
      userId: auth.user.id,
      deviceId: auth.device.device_id,
      user: auth.user,
      tenant: auth.tenant,
      license: auth.license,
      isAuthenticated: true,
      licenseState: 'active',
      error: null,
    });
  },

  validateLicense: async () => {
    const cachedExpiry = await AsyncStorage.getItem(STORAGE_LICENSE_EXPIRY);
    if (!cachedExpiry) {
      set({licenseState: 'unknown'});
      return;
    }
    const expiry = new Date(cachedExpiry).getTime();
    const graceEnd = expiry + LICENSE_GRACE_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() > graceEnd) {
      set({licenseState: 'expired'});
    } else if (Date.now() > expiry) {
      set({licenseState: 'grace'});
    } else {
      set({licenseState: 'active'});
    }
  },

  logout: async () => {
    memoryTokens = null;
    await AsyncStorage.removeItem(KEYCHAIN_AUTH);
    await AsyncStorage.removeItem(STORAGE_LICENSE_EXPIRY);
    await AsyncStorage.removeItem(STORAGE_TENANT);
    await AsyncStorage.removeItem(STORAGE_LICENSE);
    set({
      tenantId: null,
      userId: null,
      deviceId: null,
      user: null,
      tenant: null,
      license: null,
      isAuthenticated: false,
      licenseState: 'unknown',
    });
  },

  clearError: () => set({error: null}),
}));