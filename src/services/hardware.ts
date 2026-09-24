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

/**
 * Resultado tri-estado de impresión (PRN-2, espejo de Rust PrintResult).
 * - printed: spooler confirmó JOB_STATUS_PRINTED/COMPLETE (papel afuera).
 * - sent_unconfirmed: aceptado sin confirmación en ~15s (pudo salir papel).
 * - failed: rechazo previo o fallo del job (detail trae el motivo).
 */
export type PrintOutcome = 'printed' | 'sent_unconfirmed' | 'failed';

export interface PrintResult {
  outcome: PrintOutcome;
  detail?: string | null;
}

/** Lista impresoras Windows spooler (Rust printer_usb::list_printers). Filtra virtuales PDF/XPS salvo USB001 real. */
export async function listPrinters(): Promise<PrinterInfo[]> {
  try {
    const raw = await invoke<PrinterInfo[]>('list_printers');
    // Defensa extra en frontend (Rust ya filtra); USB001 físico nunca se filtra.
    return raw.filter(p => p.portName?.toUpperCase() === 'USB001' || !VIRTUAL_PRINTER_RE.test(p.name));
  } catch {
    return [];
  }
}

/** Envía bytes RAW (base64) a impresora por nombre del spooler. */
export async function printRawUsb(printerName: string, dataBase64: string): Promise<PrintResult> {
  return invoke<PrintResult>('print_raw_usb', {printerName, dataBase64});
}

/** Imprime ticket de prueba por USB (80mm 48 chars) via Rust. */
export async function printTestUsb(printerName: string): Promise<PrintResult> {
  return invoke<PrintResult>('print_test_usb', {printerName});
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

/* ── Fase 1: impresión directa USB 80mm por defecto ────────────────────── */

export const STORAGE_PRINTER_USB_KEY = 'pos.hardware.usb';

export interface PersistedUsbPrinter {
  printerName: string;
  portName?: string;
  driverName?: string;
}

const VIRTUAL_PRINTER_RE = /microsoft print to pdf|microsoft xps|xps document writer|onenote|fax|adobe pdf|pdf24|print to pdf/i;

/** Obtiene la impresora USB persistida (seleccionada en HardwareScreen). Ignora virtuales salvo USB001. */
export async function getPersistedUsbPrinter(): Promise<PersistedUsbPrinter | null> {
  try {
    const { default: AsyncStorage } = await import('../lib/storage');
    const raw = await AsyncStorage.getItem(STORAGE_PRINTER_USB_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedUsbPrinter;
    if (!parsed?.printerName) return null;
    // USB001 real nunca se considera virtual, aunque el nombre contenga "PDF" genérico.
    if (parsed.portName?.toUpperCase() !== 'USB001' && VIRTUAL_PRINTER_RE.test(parsed.printerName)) {
      await AsyncStorage.removeItem(STORAGE_PRINTER_USB_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Persiste la impresora USB seleccionada. */
export async function persistUsbPrinter(info: PersistedUsbPrinter): Promise<void> {
  const { default: AsyncStorage } = await import('../lib/storage');
  await AsyncStorage.setItem(STORAGE_PRINTER_USB_KEY, JSON.stringify(info));
}

/**
 * Impresión directa USB 80mm por defecto (Fase 1).
 * Lee la impresora persistida en storage, arma base64 y llama a
 * Rust `print_raw_usb` (que aplica build_print_sequence 48 + GS V corte).
 * No usa cola del servidor ni orquestador.
 *
 * Retorna el resultado tri-estado (PRN-2). Lanza Error en `failed` para
 * preservar el flujo try/catch de los callers (CartSheet, reimpresión);
 * `sent_unconfirmed` se retorna (el caller decide el mensaje).
 */
export async function printTicketDirect(content: string): Promise<PrintResult> {
  const persisted = await getPersistedUsbPrinter();
  const printerName = persisted?.printerName?.trim();
  if (!printerName) {
    throw new Error('Selecciona una impresora USB 80mm en Configuración → Hardware.');
  }
  const b64 = btoa(unescape(encodeURIComponent(content)));
  const result = await printRawUsb(printerName, b64);
  if (result.outcome === 'failed') {
    throw new Error(result.detail ?? 'La impresora no aceptó el trabajo.');
  }
  return result;
}