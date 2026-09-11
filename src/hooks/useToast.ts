/**
 * hooks/useToast.ts — Mini store de notificaciones (sin window.alert).
 *
 * Tres tipos: success (púrpura), error (rosa), info (lila). Cada toast es
 * auto-ocultable (5s) y se muestra como overlay glass consistente con la
 * paleta púrpura/rosa. El frontend no abre alertas de sistema.
 */
import {create} from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, type?: ToastType) => void;
  remove: (id: number) => void;
}

let counter = 0;

export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message, type = 'info') => {
    const id = ++counter;
    set(state => ({toasts: [...state.toasts, {id, message, type}]}));
    // Auto-ocultar a los 5s para no interrumpir el flujo de trabajo.
    setTimeout(() => get().remove(id), 5000);
  },
  remove: id => set(state => ({
    toasts: state.toasts.filter(t => t.id !== id),
  })),
}));

/* Helpers de conveniencia — uso directo sin importar el store. */
export const toast = {
  success: (m: string) => useToast.getState().show(m, 'success'),
  error: (m: string) => useToast.getState().show(m, 'error'),
  info: (m: string) => useToast.getState().show(m, 'info'),
};
