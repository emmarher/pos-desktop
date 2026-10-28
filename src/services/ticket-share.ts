/**
 * services/ticket-share.ts — Guarda el ticket con diálogo nativo y abre
 * la carpeta para compartirlo (WhatsApp, correo, etc.).
 */
import {save} from '@tauri-apps/plugin-dialog';
import {revealItemInDir} from '@tauri-apps/plugin-opener';
import {invoke} from '@tauri-apps/api/core';

export type TicketFileKind = 'png' | 'pdf';

/** Pide ruta, escribe el archivo y lo revela en el explorador. */
export async function saveTicketFile(
  kind: TicketFileKind,
  dataBase64: string,
  baseName: string,
): Promise<string | null> {
  const path = await save({
    defaultPath: `${baseName}.${kind}`,
    filters: [{name: kind.toUpperCase(), extensions: [kind]}],
  });
  if (!path) return null;
  await invoke('save_file_base64', {path, dataBase64});
  await revealItemInDir(path);
  return path;
}
