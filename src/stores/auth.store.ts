/**
 * auth.store.ts — Autenticación y licencia (RF-AU).
 *
 * Portado de pos-mobil. En pos-desktop no hay keychain ni AsyncStorage:
 * se persiste vía el shim lib/storage.ts (localStorage) y Platform.OS
 * siempre es 'windows', por lo que se usa la rama de fallback directo.
 */
import {create} from 'zustand';

import AsyncStorage from '../lib/storage';
import {AuthResponse} from '../models';
import {STORAGE_LICENSE_EXPIRY, LICENSE_GRACE_DAYS} from '../constants/app';

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
  restoreSession: () => Promise<boolean>;
  validateLicense: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

async function storeTokens(tokens: PersistedTokens) {
  await AsyncStorage.setItem(KEYCHAIN_AUTH, JSON.stringify(tokens));
}

async function readTokens(): Promise<PersistedTokens | null> {
  const raw = await AsyncStorage.getItem(KEYCHAIN_AUTH);
  return raw ? (JSON.parse(raw) as PersistedTokens) : null;
}

export async function getStoredTokens(): Promise<PersistedTokens | null> {
  return readTokens();
}

export async function saveStoredTokens(tokens: PersistedTokens): Promise<void> {
  await storeTokens(tokens);
}

function decodeUserFromToken(token: string): AuthResponse['user'] | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded)) as {
      sub?: string;
      tenant_id?: string;
      role_name?: string | null;
      permissions?: string[];
      name?: string;
    };
    return {
      id: payload.sub ?? '',
      tenant_id: payload.tenant_id ?? '',
      name: payload.name ?? '',
      role_name: payload.role_name ?? undefined,
      permissions: payload.permissions ?? [],
    };
  } catch {
    return null;
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
    await storeTokens({
      access_token: auth.access_token,
      refresh_token: auth.refresh_token,
    });
    await AsyncStorage.setItem(
      STORAGE_LICENSE_EXPIRY,
      auth.license.expires_at,
    );
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

  restoreSession: async () => {
    const tokens = await readTokens();
    if (!tokens) {
      return false;
    }
    const cachedExpiry = await AsyncStorage.getItem(STORAGE_LICENSE_EXPIRY);
    let licenseState: AuthState['licenseState'] = 'active';
    if (cachedExpiry) {
      const expiry = new Date(cachedExpiry).getTime();
      const graceEnd = expiry + LICENSE_GRACE_DAYS * 24 * 60 * 60 * 1000;
      if (Date.now() > graceEnd) {
        licenseState = 'expired';
      } else if (Date.now() > expiry) {
        licenseState = 'grace';
      }
    }
    const user = decodeUserFromToken(tokens.access_token);
    const license = cachedExpiry
      ? ({
          status: licenseState,
          expires_at: cachedExpiry,
          max_devices: 0,
        } as AuthResponse['license'])
      : null;
    set({isAuthenticated: true, licenseState, user, license});
    return true;
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
    await AsyncStorage.removeItem(KEYCHAIN_AUTH);
    await AsyncStorage.removeItem(STORAGE_LICENSE_EXPIRY);
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