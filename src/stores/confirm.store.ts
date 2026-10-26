/**
 * stores/confirm.store.ts — Diálogo de confirmación único (reemplaza window.confirm).
 *
 * Un solo host (`<ConfirmDialog/>`) montado en App; los call sites hacen
 * `const ok = await confirmAction({...})` y continúan solo si es true. Es el
 * hermano de `useToast`: store Zustand sin persistencia + helpers imperativos.
 *
 * Solo hay un diálogo a la vez: si llega otra petición mientras hay una
 * abierta, la anterior se resuelve como cancelada (false / null) para no dejar
 * promesas colgadas ni colas invisibles.
 */
import {create} from 'zustand';

export type ConfirmTone = 'primary' | 'danger';
export type ConfirmIcon = 'alert' | 'trash' | 'check';

export interface ConfirmOptions {
  /** Título corto y en imperativo: "Eliminar producto", "Confirmar venta". */
  title: string;
  /** Cuerpo de la pregunta (una o dos líneas como máximo). */
  message?: string;
  /** Default: 'Confirmar'. */
  confirmLabel?: string;
  /** Default: 'Cancelar'. */
  cancelLabel?: string;
  /** 'danger' pinta la acción de rojo y enfoca Cancelar (evita borrados accidentales). */
  tone?: ConfirmTone;
  /** Default: 'check' en primary, 'alert' en danger. */
  icon?: ConfirmIcon;
  /** Default: true. Click fuera del panel cancela. */
  dismissOnBackdrop?: boolean;
}

export interface PromptInputOptions {
  label: string;
  placeholder?: string;
  /** Default: true. */
  required?: boolean;
  /** Default: 1. */
  minLength?: number;
  /** Default: 500. */
  maxLength?: number;
  /** Default: 3. */
  rows?: number;
  /** Mensaje cuando no se cumple `minLength`. */
  requiredMessage?: string;
}

export interface PromptOptions extends ConfirmOptions {
  input: PromptInputOptions;
}

export type ConfirmRequest =
  | {id: number; mode: 'confirm'; options: ConfirmOptions; resolve: (ok: boolean) => void}
  | {id: number; mode: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void};

interface ConfirmState {
  request: ConfirmRequest | null;
  openConfirm: (options: ConfirmOptions) => Promise<boolean>;
  openPrompt: (options: PromptOptions) => Promise<string | null>;
  settle: (value: boolean | string | null) => void;
}

let counter = 0;

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,

  openConfirm: options =>
    new Promise<boolean>(resolve => {
      // Un diálogo a la vez: la petición anterior queda cancelada.
      get().settle(false);
      set({request: {id: ++counter, mode: 'confirm', options, resolve}});
    }),

  openPrompt: options =>
    new Promise<string | null>(resolve => {
      get().settle(null);
      set({request: {id: ++counter, mode: 'prompt', options, resolve}});
    }),

  settle: value => {
    const current = get().request;
    if (!current) return;
    // Limpiar ANTES de resolver: si el caller abre otro diálogo dentro del
    // .then, esta misma petición ya no debe volver a resolverse.
    set({request: null});
    if (current.mode === 'confirm') current.resolve(value === true);
    else current.resolve(typeof value === 'string' ? value : null);
  },
}));
