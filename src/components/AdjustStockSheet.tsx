/**
 * components/AdjustStockSheet.tsx — Ajuste de stock (RF-IN-005).
 *
 * Portado de pos-mobile a React DOM/Tailwind. POST /inventory/adjustments
 * desde Rust; positivo = entrada, negativo = salida; motivo obligatorio.
 *
 * La cantidad es editable por teclado (mismo patrón que ProductSheet en modo
 * COUNT): acepta negativos (salida) y hasta 3 decimales. Enter guarda el
 * ajuste; al abrir, el campo recibe el foco con el texto seleccionado.
 */
import {useEffect, useRef, useState} from 'react';
import {Minus, Plus, X} from 'lucide-react';
import type {Product} from '../models';
import {adjustInventory} from '../api/endpoints';
import {toast} from '../hooks/useToast';
import POSButton from './POSButton';

interface AdjustStockSheetProps {
  product: Product | null;
  onClose: () => void;
  onAdjusted: () => void;
}

/** Tope de la cantidad (el server no impone límite; este evita typos absurdos). */
const MAX_QTY = 999999;

/** Redondea a 3 decimales (los productos por peso manejan fracciones). */
function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/**
 * Sanea el texto del input: solo dígitos, un '-' únicamente al inicio y un
 * separador decimal (punto o coma) con máximo 3 decimales.
 * "12a.5" → "12.5" · "-0,5" → "-0.5" · "1.2.3" → "1.23" · ".5" → ".5".
 */
function sanitizeQty(raw: string): string {
  let out = '';
  let hasDot = false;
  let decimals = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '-') {
      if (i === 0 && out === '') out = '-';
      continue;
    }
    if (ch === '.' || ch === ',') {
      if (hasDot) continue;
      hasDot = true;
      out += '.';
      continue;
    }
    if (ch < '0' || ch > '9') continue;
    if (hasDot) {
      decimals++;
      if (decimals > 3) break;
    }
    out += ch;
  }
  // Tope de longitud: 8 dígitos + signo + punto + 3 decimales.
  return out.slice(0, 13);
}

/** Texto → número. Texto vacío o solo '-' se consideran 0. */
function parseQty(text: string): number {
  if (text === '' || text === '-') return 0;
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normaliza el texto al salir del campo: "12." → "12", "007" → "7",
 * "12.500" → "12.5", vacío → "1". El cero se conserva para que el submit
 * muestre el error explícito. Sanea antes de interpretar para que un texto
 * con coma o letras no termine en NaN.
 */
function normalizeQtyText(text: string): string {
  const clean = sanitizeQty(text);
  if (clean === '' || clean === '-' || clean === '.' || clean === '-.') return '1';
  const n = Number(clean);
  if (!Number.isFinite(n)) return '1';
  return String(round3(n));
}

export default function AdjustStockSheet({product, onClose, onAdjusted}: AdjustStockSheetProps) {
  const [quantity, setQuantity] = useState(1);
  /** Texto del input de cantidad (permite editar/borrar mientras se escribe). */
  const [qtyText, setQtyText] = useState('1');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  /* Errores inline por campo (validación visible, no window.alert). */
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setQuantity(1);
    setQtyText('1');
    setReason('');
    setErrors({});
  }, [product]);

  /* Foco automático + selección del texto al abrir (mismo patrón que ProductSheet). */
  useEffect(() => {
    if (product && qtyInputRef.current) {
      qtyInputRef.current.focus();
      requestAnimationFrame(() => qtyInputRef.current?.select());
    }
  }, [product?.id]);

  if (!product) return null;

  /** Fija cantidad y texto a la vez (botones +/- y normalización). */
  const applyQuantity = (n: number) => {
    const clamped = Math.max(-MAX_QTY, Math.min(MAX_QTY, round3(n)));
    setQuantity(clamped);
    setQtyText(String(clamped));
  };

  /** Normaliza el texto del input y devuelve la cantidad resultante. */
  const commitQtyText = (): number => {
    const normalized = normalizeQtyText(qtyText);
    setQtyText(normalized);
    const n = parseQty(normalized);
    setQuantity(n);
    return n;
  };

  const handleSubmit = async (qtyOverride?: number) => {
    const qty = qtyOverride ?? quantity;
    // Validación inline: motivo y cantidad obligatorios (notifica sin alert).
    const e: Record<string, string> = {};
    if (!reason.trim()) e.reason = 'El motivo del ajuste es obligatorio.';
    if (qty === 0) e.quantity = 'La cantidad no puede ser cero.';
    else if (Math.abs(qty) > MAX_QTY) e.quantity = `La cantidad no puede superar ${MAX_QTY}.`;
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSubmitting(true);
    try {
      await adjustInventory({product_id: product.id, quantity: qty, reason: reason.trim()});
      onAdjusted();
      onClose();
      toast.success(
        qty > 0
          ? `Se agregaron ${String(round3(qty))} unidades a ${product.name}.`
          : `Se retiraron ${String(round3(Math.abs(qty)))} unidades de ${product.name}.`,
      );
    } catch (err) {
      toast.error(`Error al ajustar: ${err}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-t-[var(--radius-xl)] bg-[var(--color-surface-solid)] p-6 pb-10"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[var(--color-border)]" />
        <h2 className="text-center text-[var(--font-medium)] font-extrabold text-[var(--color-text)]">
          Ajustar stock
        </h2>
        <p className="mt-1 text-center text-[var(--font-small)] text-[var(--color-text-secondary)]">
          {product.name} · Stock actual: {product.stock}
        </p>

        {/* Selector de cantidad (editable por teclado) */}
        <div className="my-6 flex items-center justify-center gap-6">
          <button
            type="button"
            className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:opacity-80"
            onClick={() => applyQuantity(quantity - 1)}
            aria-label="Restar una unidad"
            data-testid="adjust-qty-minus"
          >
            <Minus size={22} />
          </button>
          <div className="min-w-28 text-center">
            <div className="flex items-center justify-center">
              {quantity > 0 && (
                <span className="text-[var(--font-xlarge)] font-extrabold text-[var(--color-text)]">+</span>
              )}
              <input
                ref={qtyInputRef}
                type="text"
                inputMode="decimal"
                value={qtyText}
                onChange={e => {
                  const clean = sanitizeQty(e.target.value);
                  setQtyText(clean);
                  setQuantity(parseQty(clean));
                  if (errors.quantity) setErrors(existing => ({...existing, quantity: ''})); // limpiar error al escribir.
                }}
                onBlur={commitQtyText}
                onFocus={() => requestAnimationFrame(() => qtyInputRef.current?.select())}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSubmit(commitQtyText());
                  }
                }}
                className={`w-24 bg-transparent text-center text-[var(--font-xlarge)] font-extrabold outline-none ${
                  errors.quantity ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'
                }`}
                aria-label="Cantidad a ajustar"
                data-testid="adjust-qty-input"
              />
            </div>
            <span className="text-[var(--font-micro)] text-[var(--color-text-secondary)]">
              {quantity > 0 ? 'entrada' : quantity < 0 ? 'salida' : 'cero'}
            </span>
          </div>
          <button
            type="button"
            className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] text-[var(--color-primary)] hover:opacity-80"
            onClick={() => applyQuantity(quantity + 1)}
            aria-label="Sumar una unidad"
            data-testid="adjust-qty-plus"
          >
            <Plus size={22} />
          </button>
        </div>
        {errors.quantity && (
          <p className="mt-1 text-center text-[var(--font-micro)] text-[var(--color-danger)]">{errors.quantity}</p>
        )}

        {/* Motivo */}
        <label className="mb-1 block text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
          Motivo *
        </label>
        <textarea
          className={`mb-5 min-h-12 w-full rounded-[var(--radius-md)] border p-3 text-[var(--font-regular)] text-[var(--color-text)] outline-none ${
            errors.reason
              ? 'border-[var(--color-danger)] bg-[var(--color-danger-soft)]/50'
              : 'border-[var(--color-border)] bg-[var(--color-input)]'
          }`}
          placeholder="Ej. Entrada de mercancía / Merma / Conteo"
          value={reason}
          onChange={e => {
            setReason(e.target.value);
            if (errors.reason) setErrors(existing => ({...existing, reason: ''})); // limpiar error al escribir.
          }}
        />
        {errors.reason && <p className="mt-1 text-[var(--font-micro)] text-[var(--color-danger)]">{errors.reason}</p>}

        <POSButton title={submitting ? 'Guardando…' : 'Guardar ajuste'} onPress={() => void handleSubmit()} loading={submitting} large />
        <div className="mt-4 flex justify-center">
          <button className="flex items-center gap-1 text-[var(--font-small)] text-[var(--color-danger)] hover:text-[var(--color-primary)]" onClick={onClose}>
            <X size={14} /> Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
