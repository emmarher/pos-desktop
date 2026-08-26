/**
 * components/CartSheet.tsx — Carrito de la venta (RF-VE-001..005).
 *
 * Portado de pos-mobile a React DOM/Tailwind. Muestra ítems (desglose
 * individual), método de pago, totales y confirma POST /sales (vía Rust).
 * Para productos MASS/CAJ muestra el peso en kg.
 */
import {useEffect, useState} from 'react';
import {X} from 'lucide-react';
import {useCartStore} from '../stores/cart.store';
import type {PaymentMethod} from '../models';
import {createSale} from '../api/endpoints';
import {ApiError} from '../api/client';
import {toast} from '../hooks/useToast';
import POSButton from './POSButton';
import {formatWeightKg} from '../lib/scale';

interface CartSheetProps {
  visible: boolean;
  onClose: () => void;
  onSaleDone?: (sale: {folio: string}) => void;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  CREDIT: 'Crédito',
  VOUCHER: 'Voucher',
};

const METHODS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'CREDIT'];

export default function CartSheet({visible, onClose, onSaleDone}: CartSheetProps) {
  const items = useCartStore(s => s.items);
  const removeItem = useCartStore(s => s.removeItem);
  const clearCart = useCartStore(s => s.clearCart);
  const addPayment = useCartStore(s => s.addPayment);
  const payments = useCartStore(s => s.payments);
  const buildSalePayload = useCartStore(s => s.buildSalePayload);

  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) setMethod('CASH');
  }, [visible]);

  if (!visible) return null;

  // Totales derivados
  const subtotal = items.reduce((s, it) => s + it.subtotal, 0);
  const discount = items.reduce((s, it) => s + it.discount, 0);
  const total = Math.max(0, subtotal - discount);
  const unitCount = items.reduce((s, it) => s + it.quantity, 0);

  const handleConfirm = async () => {
    if (items.length === 0) return;
    const existing = payments.reduce((s, p) => s + p.amount, 0);
    const remaining = Math.max(0, total - existing);
    if (remaining > 0) {
      addPayment({method, amount: remaining});
    }
    setSubmitting(true);
    try {
      const payload = buildSalePayload();
      const sale = await createSale(payload);
      const folio = sale.folio;
      clearCart();
      onClose();
      onSaleDone?.(sale as {folio: string});
      toast.success(`Venta registrada · Folio: ${folio}`);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'No se pudo registrar la venta.';
      toast.error(`Error al vender: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-[var(--radius-xl)] bg-[var(--color-surface-solid)] p-6 pb-10"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-[var(--color-border)]" />
        <h2 className="mb-3 text-center text-[var(--font-medium)] font-extrabold text-[var(--color-text)]">
          Carrito · {items.length} {items.length === 1 ? 'ítem' : 'ítems'} · {unitCount}{' '}
          {unitCount === 1 ? 'unidad' : 'unidades'}
        </h2>

        {/* Items (desglose individual) */}
        <div className="mb-4 max-h-60 flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <p className="py-6 text-center text-[var(--font-regular)] text-[var(--color-text-secondary)]">
              El carrito está vacío
            </p>
          ) : (
            items.map(item => {
              const isMass = item.weightKg != null && !item.isCaj;
              const isCaj = item.isCaj === true;
              const displayQty = isMass
                ? formatWeightKg(item.weightKg!) + ' kg'
                : isCaj
                ? `1 caja × ${formatWeightKg(item.weightKg!)} kg`
                : `${item.quantity} × $${item.unitPrice.toFixed(2)}`;
              return (
                <div
                  key={item.key}
                  className="flex items-center border-b border-[var(--color-border)] py-2"
                >
                  <div className="flex-1">
                    <p className="truncate text-[var(--font-regular)] font-semibold text-[var(--color-text)]">
                      {item.product.name}
                    </p>
                    <p className="text-[var(--font-small)] text-[var(--color-text-secondary)]">
                      {displayQty}
                    </p>
                  </div>
                  <span className="text-[var(--font-regular)] font-semibold text-[var(--color-text)]">
                    ${item.subtotal.toFixed(2)}
                  </span>
                  <button className="ml-3 p-1 text-[var(--color-danger)] hover:opacity-70" onClick={() => removeItem(item.key)}>
                    <X size={16} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Método de pago */}
        <p className="mb-1 text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
          Método de pago
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {METHODS.map(m => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`rounded-[var(--radius-round)] border px-3 py-1.5 text-[var(--font-small)] font-semibold transition-colors ${
                method === m
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/50 text-[var(--color-on-primary)]'
                  : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]'
              }`}
              data-testid={`pay-${m}`}
            >
              {METHOD_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Totales */}
        <div className="mb-2 flex justify-between">
          <span className="text-[var(--font-regular)] text-[var(--color-text-secondary)]">Subtotal</span>
          <span className="text-[var(--font-regular)] font-semibold text-[var(--color-text)]">${subtotal.toFixed(2)}</span>
        </div>
        {discount > 0 && (
          <div className="mb-2 flex justify-between">
            <span className="text-[var(--font-regular)] text-[var(--color-text-secondary)]">Descuento</span>
            <span className="text-[var(--font-regular)] font-semibold text-[var(--color-success)]">−${discount.toFixed(2)}</span>
          </div>
        )}
        <div className="mb-4 flex items-center justify-between border-t border-[var(--color-border)] pt-2">
          <span className="text-[var(--font-medium)] font-extrabold text-[var(--color-text)]">TOTAL</span>
          <span className="text-[var(--font-xlarge)] font-black text-[var(--color-primary)]">${total.toFixed(2)}</span>
        </div>

        <POSButton
          title={submitting ? 'Registrando…' : 'Confirmar venta'}
          onPress={handleConfirm}
          loading={submitting}
          disabled={items.length === 0}
          large
          data-testid="btn-confirm-sale"
        />
        <div className="mt-3 text-center">
          <button className="text-[var(--font-small)] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}