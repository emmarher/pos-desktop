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
  /** Nombre del spooler Windows (80mm USB). Si está presente → WinSpool RAW. */
  printer_name?: string;
  scale_serial?: SerialConfig;
  access_token?: string;
}

export interface PrinterInfo {
  name: string;
  driverName?: string;
  portName?: string;
  isOnline: boolean;
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

/** Lista impresoras Windows spooler (Rust printer_usb::list_printers). */
export async function listPrinters(): Promise<PrinterInfo[]> {
  try {
    return await invoke<PrinterInfo[]>('list_printers');
  } catch {
    return [];
  }
}

/** Envía bytes RAW (base64) a impresora por nombre del spooler. */
export async function printRawUsb(printerName: string, dataBase64: string): Promise<number> {
  return invoke<number>('print_raw_usb', {printerName, dataBase64});
}

/** Imprime ticket de prueba por USB (80mm 48 chars) via Rust. */
export async function printTestUsb(printerName: string): Promise<void> {
  return invoke('print_test_usb', {printerName});
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
    const b64 = btoa(unescape(encodeURIComponent(content)));
    await writePort(b64);
  } finally {
    await closePort().catch(() => {});
  }
}

/** Imprime ticket por USB spooler (80mm) — WinSpool RAW. */
export async function printTicketUsb(printerName: string, content: string): Promise<void> {
  const b64 = btoa(unescape(encodeURIComponent(content)));
  await printRawUsb(printerName, b64);
}