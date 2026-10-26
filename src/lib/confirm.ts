/**
 * lib/confirm.ts — Helpers imperativos del diálogo de confirmación.
 *
 *   if (!(await confirmAction({title: 'Eliminar producto'}))) return;
 *
 *   const motivo = await promptAction({title: 'Cancelar venta', input: {...}});
 *   if (!motivo) return;   // null = el usuario canceló
 *
 * El host que los hace visibles es `<ConfirmDialog/>` (montado en App.tsx).
 */
import {useConfirmStore} from '../stores/confirm.store';
import type {ConfirmOptions, PromptOptions} from '../stores/confirm.store';

export type {ConfirmOptions, PromptOptions, ConfirmTone, ConfirmIcon} from '../stores/confirm.store';

/** Pregunta sí/no. Resuelve `true` solo si el usuario confirma. */
export const confirmAction = (options: ConfirmOptions): Promise<boolean> =>
  useConfirmStore.getState().openConfirm(options);

/** Pide un texto corto (ej. motivo de cancelación). `null` si cancela. */
export const promptAction = (options: PromptOptions): Promise<string | null> =>
  useConfirmStore.getState().openPrompt(options);
