/**
 * components/ToastContainer.tsx — Contenedor de notificias overlay (glass).
 *
 * Se monta una sola vez en AppRoutes y consume el store useToast. Cada toast
 * usa colores de la paleta púrpura/rosa: success=green-accent, error=rosa,
 * info=lila. Aparece/desaparece con transición, nunca usa window.alert.
 */
import {useToast} from '../hooks/useToast';
import {useShallow} from 'zustand/react/shallow';
import {X} from 'lucide-react';

export default function ToastContainer() {
  // useShallow: sin él, este selector devuelve un objeto nuevo en cada render,
  // lo que dispara "getSnapshot should be cached" y un bucle infinito de
  // re-renders (Maximum update depth exceeded) que deja la pantalla en blanco.
  const {toasts, remove} = useToast(
    useShallow(state => ({
      toasts: state.toasts,
      remove: state.remove,
    })),
  );

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-8 right-8 z-[200] flex flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          // Color de fondo según tipo (glass + tono de la paleta).
          className={`relative flex min-w-[420px] max-w-sm items-center gap-3 rounded-[var(--radius-md)] px-4 py-2.5 text-[var(--font-regular)] font-medium shadow-[0_4px_12px_var(--color-shadow)] backdrop-blur-[var(--glass-blur)] ${
            t.type === 'success'
              ? 'border border-[var (--color-primary)] bg-[var(--color-secondary-soft)]/60 text-[var(--color-primary-dark)]'
              : t.type === 'error'
              ? 'border border-[var(--color-danger)] bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
              : 'border border-[var(--color-info)] bg-[var(--color-primary-soft)] text-[var(--color-primary-dark)]'
          }`}
          data-testid={`toast-${t.type}`}
        >
          {/* Close button — cierra el toast de inmediato. */}
          <button
            className="absolute right-1.5 top-1.5 rounded-full p-0.5 hover:opacity-80"
            onClick={() => remove(t.id)}
            aria-label="Cerrar notificación"
          >
            <X size={13} />
          </button>
          <div className="mr-3">{t.message}</div>
        </div>
      ))}
    </div>
  );
}
