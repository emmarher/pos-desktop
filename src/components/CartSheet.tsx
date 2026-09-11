/**
 * components/CartSheet.tsx — Carrito lateral persistente (RF-VE-001..005).
 *
 * Sidecar fijo en el lado derecho de la Terminal de ventas. Siempre visible
 * (con opción de minimizar/expandir) durante la venta. Muestra ítems
 * (desglose), método de pago, totales y confirma POST /sales (vía Rust).
 *
 * Tras vender, notifica onSaleDone con los items vendidos para actualizar
 * el stock local del grid de productos.
 */
import {useEffect, useState} from 'react';
import {X, ShoppingCart, ChevronLeft, ChevronRight} from 'lucide-react';
import {useCartStore} from '../stores/cart.store';
import type {CartItem, PaymentMethod} from '../models';
import {createSale} from '../api/endpoints';
import {ApiError} from '../api/client';
import {toast} from '../hooks/useToast';
import POSButton from './POSButton';
import {formatWeightKg} from '../lib/scale';

interface CartSheetProps {
  /** Si está minimizado, muestra solo el header delgado */
  collapsed: boolean;
  /** Alternar minimizar/expandir */
  onToggleCollapse: () => void;
  /** Notifica éxito de venta con los items (para deducir stock local) */
  onSaleDone?: (sale: {folio: string; id: string; items: CartItem[]}) => void;
}

const METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  CREDIT: 'Crédito',
  VOUCHER: 'Voucher',
};

const METHODS: PaymentMethod[] = ['CASH', 'CARD', 'TRANSFER', 'CREDIT'];

export default function CartSheet({collapsed, onToggleCollapse, onSaleDone}: CartSheetProps) {
  const items = useCartStore(s => s.items);
  const removeItem = useCartStore(s => s.removeItem);
  const clearCart = useCartStore(s => s.clearCart);
  const addPayment = useCartStore(s => s.addPayment);
  const payments = useCartStore(s => s.payments);
  const buildSalePayload = useCartStore(s => s.buildSalePayload);

  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!collapsed) setMethod('CASH');
  }, [collapsed]);

  const subtotal = items.reduce((s, it) => s + it.subtotal, 0);
  const discount = items.reduce((s, it) => s + it.discount, 0);
  const total = Math.max(0, subtotal - discount);
  const unitCount = items.reduce((s, it) => s + it.quantity, 0);
  const itemCount = items.length;

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
      // Capturar items ANTES de limpiar el carrito (para stock local)
      const soldItems = [...items];
      clearCart();
      onSaleDone?.({folio: sale.folio, id: sale.id, items: soldItems});
      toast.success(`Venta registrada · Folio: ${sale.folio}`);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'No se pudo registrar la venta.';
      toast.error(`Error al vender: ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Minimizado: header delgado con resumen ─────────────────────────── */
  if (collapsed) {
    return (
      <aside className="fixed bottom-20 right-5 z-40 flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-solid)] px-3 py-2 shadow-[0_4px_12px_var(--color-shadow)]">
        <button
          className="flex h-8 w-8 items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
          onClick={onToggleCollapse}
          aria-label="Expandir carrito"
          data-testid="btn-expand-cart"
        >
          <ChevronRight size={18} />
        </button>
        <ShoppingCart size={18} className="text-[var(--color-primary)]" />
        <span className="text-[var(--font-regular)] font-semibold text-[var(--color-text)]">
          {itemCount} {itemCount === 1 ? 'ítem' : 'ítems'}
        </span>
        <span className="text-[var(--font-medium)] font-extrabold text-[var(--color-primary)]">
          ${total.toFixed(2)}
        </span>
      </aside>
    );
  }

  /* ── Expandido: sidebar completo ─────────────────────────────────────── */
  return (
    <aside className="fixed top-16 bottom-0 right-0 z-40 flex w-80 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface-solid)] shadow-[0_4px_12px_var(--color-shadow)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
        <button
          className="flex h-8 w-8 items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
          onClick={onToggleCollapse}
          aria-label="Minimizar carrito"
          data-testid="btn-collapse-cart"
        >
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-[var(--font-medium)] font-extrabold text-[var(--color-text)]">
          Carrito · {itemCount} {itemCount === 1 ? 'ítem' : 'ítems'} · {unitCount}{' '}
          {unitCount === 1 ? 'unidad' : 'unidades'}
        </h2>
        <div className="w-8" />
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full min-h-40 items-center justify-center">
            <p className="text-[var(--font-regular)] text-[var(--color-text-secondary)]">
              El carrito está vacío
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {items.map(item => {
              const isMass = item.weightKg != null && !item.isCaj;
              const isCaj = item.isCaj === true;
              const displayQty = isMass
                ? formatWeightKg(item.weightKg!) + ' kg'
                : isCaj
                ? `1 caja × ${formatWeightKg(item.weightKg!)} kg`
                : `${item.quantity} × $${item.unitPrice.toFixed(2)}`;
              return (
                <div key={item.key} className="flex items-center p-3">
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
                  <button
                    className="ml-2 p-1 text-[var(--color-danger)] hover:opacity-70"
                    onClick={() => removeItem(item.key)}
                  >
                    <X size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pago + totales + acciones */}
      <div className="border-t border-[var(--color-border)] p-4">
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
            >
              {METHOD_LABELS[m]}
            </button>
          ))}
        </div>

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
          variant="success"
          data-testid="btn-confirm-sale"
        />
      </div>
    </aside>
  );
}
