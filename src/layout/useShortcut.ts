/**
 * layout/useShortcut.ts — Atajos de teclado de escritorio.
 *
 * Portado de pos-mobil. En lugar del evento 'keyPress' de RNW, se usa el
 * evento nativo `keydown` de window (WebView2).
 */
import {useEffect, useRef} from 'react';

export interface ShortcutEvent {
  key: string;
  code?: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export type ShortcutHandler = (event: ShortcutEvent) => boolean;

export function useShortcut(handler: ShortcutHandler): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      // Ignorar si el foco está en un input editable (el atajo global
      // no debe interferir con la escritura en campos).
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      const normalized: ShortcutEvent = {
        key: event.key.toLowerCase(),
        code: event.code,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
      };
      try {
        const consumed = handlerRef.current(normalized);
        if (consumed) {
          event.preventDefault();
          event.stopPropagation();
        }
      } catch {
        // Un handler con error no debe tumbar el manejo de teclado global.
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}