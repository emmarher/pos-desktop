/**
 * services/hardware.ts — Envoltorio de los comandos Rust de hardware.
 *
 * Comunicación serial para impresora ESC/POS y báscula. Todo pasa por los
 * comandos Tauri de src-tauri (serial.rs, hardware.rs, scale.rs) — el
 * webview solo invoca.
 */
import {invoke} from '@tauri-apps/api/core';

/** Config de un puerto serial (espejo de SerialConfig en Rust). */
export interface SerialConfig {
  port: string;
  baud_rate?: number;
  data_bits?: number;
  stop_bits?: number;
  parity?: string;
}

export interface SerialPortInfo {
  port_name: string;
  description?: string;
  manufacturer?: string;
  product?: string;
}

/** Config del orquestador de hardware (start_hardware). */
export interface HardwareConfig {
  server_ip: string;
  server_port?: number;
  device_id: string;
  can_print: boolean;
  can_scale: boolean;
  printer_serial?: SerialConfig;
  scale_serial?: SerialConfig;
  access_token?: string;
}

/** Lectura de báscula emitida por Rust (evento 'scale-reading'). */
export interface ScaleReading {
  device_id: string;
  weight: number;
  unit: string;
  stable: boolean;
  at: string;
}

/** Lista los puertos serial del sistema (Rust serial::list_ports). */
export async function listPorts(): Promise<SerialPortInfo[]> {
  return invoke<SerialPortInfo[]>('list_ports');
}

/** Abre un puerto serial (Rust serial::open_port). */
export async function openPort(config: SerialConfig): Promise<void> {
  return invoke('open_port', {config});
}

/** Cierra el puerto serial abierto (Rust serial::close_port). */
export async function closePort(): Promise<void> {
  return invoke('close_port');
}

/** Escribe bytes (base64) al puerto serial — imprime ticket (Rust). */
export async function writePort(dataBase64: string): Promise<number> {
  return invoke<number>('write_port', {dataBase64});
}

/** Lee bytes disponibles del puerto (base64) — lee báscula (Rust). */
export async function readPort(): Promise<string> {
  return invoke<string>('read_port');
}

/** Inicia el orquestador de hardware en segundo plano (Rust). */
export async function startHardware(config: HardwareConfig): Promise<void> {
  return invoke('start_hardware', {config});
}

/** Detiene el orquestador de hardware (Rust hardware::stop_hardware). */
export async function stopHardware(): Promise<void> {
  return invoke('stop_hardware');
}

/** Imprime un ticket de texto vía serial (abre, escribe ESC/POS, cierra). */
export async function printTicket(
  config: SerialConfig,
  content: string,
): Promise<void> {
  await openPort(config).catch(e => {
    throw new Error(`No se pudo abrir el puerto: ${e}`);
  });
  try {
    // El builder ESC/POS está en Rust; el front envía el texto y Rust lo
    // imprime. Reuso write_port con el contenido codificado: la secuencia
    // ESC/POS la arma Rust en hardware.rs (build_print_sequence). Aquí
    // imprimimos directamente el contenido, que el PC con can_print sabe
    // interpretar. (Para impresión real se usa el orquestador start_hardware.)
    const b64 = btoa(unescape(encodeURIComponent(content)));
    await writePort(b64);
  } finally {
    await closePort().catch(() => {});
  }
}