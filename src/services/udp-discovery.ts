/**
 * services/udp-discovery.ts — UDP broadcast "POS_DISCOVER" (RF-DS-001).
 *
 * Portado de pos-mobil. En pos-desktop el socket UDP vive en Rust
 * (src-tauri/src/udp.rs); este módulo es un envoltorio tipado del comando
 * Tauri `udp_discover` y mantiene el parseo de la respuesta.
 */

export interface UdpDiscoveryResult {
  ip: string;
  port?: number;
  tenantId?: string;
  deviceName?: string;
  apiVersion?: string;
}

interface UdpDiscoverOptions {
  message: string;
  port: number;
  /** Tiempo de espera de respuesta (ms) — usado por el comando Rust */
  timeoutMs?: number;
}

export async function udpDiscover(
  options: UdpDiscoverOptions,
): Promise<UdpDiscoveryResult | null> {
  try {
    const {invoke} = await import('@tauri-apps/api/core');
    const result = await invoke<{
      ip: string;
      port?: number;
      tenant_id?: string;
      device_name?: string;
      api_version?: string;
    } | null>('udp_discover', {
      message: options.message,
      port: options.port,
      timeoutMs: options.timeoutMs ?? 3000,
    });
    if (!result) {
      return null;
    }
    return {
      ip: result.ip,
      port: result.port,
      tenantId: result.tenant_id,
      deviceName: result.device_name,
      apiVersion: result.api_version,
    };
  } catch {
    // Comando no disponible (p. ej. fuera de Tauri) → fallback al
    // siguiente método de discovery (QR/manual).
    return null;
  }
}