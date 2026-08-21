/**
 * components/AdjustStockSheet.tsx — Ajuste de stock (RF-IN-005).
 *
 * Portado de pos-mobile a React DOM/Tailwind. POST /inventory/adjustments
 * desde Rust; positivo = entrada, negativo = salida; motivo obligatorio.
 */
import {useEffect, useState} from 'react';
import {Minus, Plus, X} from 'lucide-react';
import type {Product} from '../models';
import {adjustInventory} from '../api/endpoints';
import POSButton from './POSButton';

interface AdjustStockSheetProps {
  product: Product | null;
  onClose: () => void;
  onAdjusted: () => void;
}

export default function AdjustStockSheet({product, onClose, onAdjusted}: AdjustStockSheetProps) {
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setQuantity(1);
    setReason('');
  }, [product]);

  if (!product) return null;

  const handleSubmit = async () => {
    if (!reason.trim()) {
      window.alert('El motivo del ajuste es obligatorio.');
      return;
    }
    if (quantity === 0) {
      window.alert('La cantidad no puede ser cero.');
      return;
    }
    setSubmitting(true);
    try {
      await adjustInventory({product_id: product.id, quantity, reason: reason.trim()});
      onAdjusted();
      onClose();
      window.alert(
        quantity > 0
          ? `Se agregaron ${quantity} unidades a ${product.name}.`
          : `Se retiraron ${Math.abs(quantity)} unidades de ${product.name}.`,
      );
    } catch (err) {
      window.alert(`Error al ajustar: ${err}`);
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

        {/* Selector de cantidad */}
        <div className="my-6 flex items-center justify-center gap-6">
          <button
            className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] text-[var(--color-danger)] hover:opacity-80"
            onClick={() => setQuantity(q => Math.max(-999, q - 1))}
          >
            <Minus size={22} />
          </button>
          <div className="min-w-20 text-center">
            <span className="block text-[var(--font-xlarge)] font-extrabold text-[var(--color-text)]">
              {quantity > 0 ? `+${quantity}` : quantity}
            </span>
            <span className="text-[var(--font-micro)] text-[var(--color-text-secondary)]">
              {quantity > 0 ? 'entrada' : quantity < 0 ? 'salida' : 'cero'}
            </span>
          </div>
          <button
            className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary-soft)] text-[var(--color-primary)] hover:opacity-80"
            onClick={() => setQuantity(q => Math.min(999, q + 1))}
          >
            <Plus size={22} />
          </button>
        </div>

        {/* Motivo */}
        <label className="mb-1 block text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
          Motivo *
        </label>
        <textarea
          className="mb-5 min-h-12 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] p-3 text-[var(--font-regular)] text-[var(--color-text)] outline-none"
          placeholder="Ej. Entrada de mercancía / Merma / Conteo"
          value={reason}
          onChange={e => setReason(e.target.value)}
        />

        <POSButton title={submitting ? 'Guardando…' : 'Guardar ajuste'} onPress={handleSubmit} loading={submitting} large />
        <div className="mt-4 flex justify-center">
          <button className="flex items-center gap-1 text-[var(--font-small)] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]" onClick={onClose}>
            <X size={14} /> Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}