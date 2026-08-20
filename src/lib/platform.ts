/**
 * lib/platform.ts — Shims de plataforma para el porte desde pos-mobil.
 *
 * Pos-desktop corre en Windows (Tauri/WebView2). Este módulo emula la
 * superficie de react-native que el código portado usa para decidir el
 * camino de plataforma (p. ej. keychain vs AsyncStorage, UDP nativo vs
 * comando Tauri).
 */

export const Platform = {
  OS: 'windows',
  select: <T>(spec: { [key: string]: T }): T =>
    spec[Platform.OS] ?? spec.default,
} as const;

/** device_id persistente y estable por máquina (RF-AU-004). */
export function getOrCreateDeviceId(): string {
  const KEY = 'pos.device_id';
  const existing = localStorage.getItem(KEY);
  if (existing) {
    return existing;
  }
  // Identificador pseudo-aleatorio estable: UUID v4.
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(KEY, id);
  return id;
}

/** Nombre del dispositivo para el registro (RF-AU-004). */
export function getDeviceName(): string {
  return 'PC-POS';
}

/** Tipo de dispositivo para el registro. */
export function getDeviceType(): 'TABLET' | 'PC' {
  return 'PC';
}

/** Reescribe la función de uuid nativa ausente en algunos runtimes. */
export const PlatformSelect = Platform.select;