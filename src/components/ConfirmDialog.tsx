/**
 * components/ConfirmDialog.tsx — Host del diálogo de confirmación (glass).
 *
 * Se monta una sola vez en App.tsx y renderiza `null` mientras no haya
 * petición: cero costo cuando está cerrado. Lo abren `confirmAction()` y
 * `promptAction()` (lib/confirm.ts), que devuelven una promesa.
 *
 * Teclado (clave en caja, sin mouse):
 *   - Primary: el foco arranca en la acción → Enter confirma.
 *   - Danger:  el foco arranca en Cancelar → Enter no borra nada por accidente.
 *   - Prompt:  el foco arranca en el campo; Enter escribe salto de línea y
 *              Ctrl/Cmd+Enter confirma.
 *   - Escape y click en el fondo cancelan (salvo dismissOnBackdrop: false).
 */
import {useEffect, useId, useRef, useState} from 'react';
import {AlertTriangle, CheckCircle2, Trash2} from 'lucide-react';
import POSButton from './POSButton';
import {useConfirmStore} from '../stores/confirm.store';
import type {ConfirmRequest} from '../stores/confirm.store';

const ICONS = {
  alert: AlertTriangle,
  trash: Trash2,
  check: CheckCircle2,
} as const;

function ConfirmDialogPanel({
  request,
  settle,
}: {
  request: ConfirmRequest;
  settle: (value: boolean | string | null) => void;
}) {
  const {options} = request;
  const isPrompt = request.mode === 'prompt';
  const input = request.mode === 'prompt' ? request.options.input : null;

  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const messageId = useId();
  const inputId = useId();

  const tone = options.tone ?? 'primary';
  const iconName = options.icon ?? (tone === 'danger' ? 'alert' : 'check');
  const Icon = ICONS[iconName] ?? CheckCircle2;
  const confirmLabel = options.confirmLabel ?? 'Confirmar';
  const cancelLabel = options.cancelLabel ?? 'Cancelar';

  /** Cancelar: false en confirm, null en prompt (mismo contrato de las promesas). */
  const cancelValue = isPrompt ? null : false;

  const cancel = () => settle(cancelValue);

  const accept = () => {
    if (request.mode === 'confirm') {
      settle(true);
      return;
    }
    const trimmed = value.trim();
    const min = Math.max(1, request.options.input.minLength ?? 1);
    if ((request.options.input.required ?? true) && trimmed.length < min) {
      setError(
        request.options.input.requiredMessage ??
          (min > 1
            ? `Escribe al menos ${min} caracteres.`
            : 'Este campo es obligatorio.'),
      );
      return;
    }
    settle(trimmed);
  };

  /* Foco inicial (y restauración al cerrar) — sin robar el foco al resto. */
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const selector = isPrompt
      ? '[data-testid="confirm-input"]'
      : tone === 'danger'
        ? '[data-testid="confirm-cancel"]'
        : '[data-testid="confirm-accept"]';
    panelRef.current?.querySelector<HTMLElement>(selector)?.focus();
    return () => {
      if (previous?.isConnected && typeof previous.focus === 'function') previous.focus();
    };
    // Solo al montar: el panel se vuelve a montar por `key` en cada petición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
      return;
    }
    if (isPrompt && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      accept();
      return;
    }
    /* Trampa de foco: Tab cicla dentro del panel. */
    if (e.key !== 'Tab') return;
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), a[href]',
    );
    if (!nodes || nodes.length === 0) return;
    const list = Array.from(nodes);
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const handleBackdrop = () => {
    if (options.dismissOnBackdrop === false) return;
    cancel();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={handleBackdrop}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={options.message ? messageId : undefined}
        className="w-full max-w-sm rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-solid)] p-6 shadow-[0_12px_40px_var(--color-shadow)]"
        onMouseDown={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        data-testid="confirm-dialog"
      >
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-round)] ${
              tone === 'danger'
                ? 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]'
                : 'bg-[var(--color-primary-soft)] text-[var(--color-primary)]'
            }`}
          >
            <Icon size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h3
              id={titleId}
              className="text-[var(--font-medium)] font-extrabold leading-tight text-[var(--color-text)]"
            >
              {options.title}
            </h3>
            {options.message && (
              <p
                id={messageId}
                className="mt-1 text-[var(--font-small)] text-[var(--color-text-secondary)]"
              >
                {options.message}
              </p>
            )}
          </div>
        </div>

        {isPrompt && input && (
          <div className="mt-4">
            <label
              htmlFor={inputId}
              className="mb-1 block text-[var(--font-micro)] font-semibold text-[var(--color-text-secondary)]"
            >
              {input.label}
            </label>
            <textarea
              id={inputId}
              className={`w-full resize-none rounded-[var(--radius-md)] border bg-[var(--color-input)] px-3 py-2 text-[var(--font-regular)] text-[var(--color-text)] outline-none ${
                error
                  ? 'border-[var(--color-danger)]'
                  : 'border-[var(--color-border)] focus:border-[var(--color-primary)]'
              }`}
              placeholder={input.placeholder}
              value={value}
              rows={input.rows ?? 3}
              maxLength={input.maxLength ?? 500}
              aria-invalid={!!error}
              onChange={e => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              data-testid="confirm-input"
            />
            {error && (
              <p
                className="mt-1 text-[var(--font-micro)] font-semibold text-[var(--color-danger)]"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex gap-3">
          <POSButton
            type="button"
            title={cancelLabel}
            variant="ghost"
            className="flex-1"
            onPress={cancel}
            data-testid="confirm-cancel"
          />
          <POSButton
            type="button"
            title={confirmLabel}
            variant={tone === 'danger' ? 'dangerSolid' : 'primary'}
            className="flex-1"
            onPress={accept}
            data-testid="confirm-accept"
          />
        </div>
      </div>
    </div>
  );
}

/** Host: una sola instancia global. `key` reinicia el estado interno por petición. */
export default function ConfirmDialog() {
  const request = useConfirmStore(s => s.request);
  const settle = useConfirmStore(s => s.settle);
  if (!request) return null;
  return <ConfirmDialogPanel key={request.id} request={request} settle={settle} />;
}
