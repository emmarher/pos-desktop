/**
 * components/CartSheet.tsx — Carrito lateral persistente (RF-VE-001..005) + impresión directa USB 80mm.
 *
 * Sidecar fijo en el lado derecho de la Terminal de ventas. Siempre visible
 * (con opción de minimizar/expandir) durante la venta. Muestra ítems
 * (desglose), método de pago, totales y confirma POST /sales (vía Rust).
 *
 * Tras vender, notifica onSaleDone con los items vendidos para actualizar
 * el stock local del grid y dispara impresión directa 80mm si hay impresora USB configurada.
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
import {buildTicket80mm} from '../lib/ticket';
import {printTicketDirect, getPersistedUsbPrinter} from '../services/hardware';
import {useAuthStore} from '../stores/auth.store';

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
    // Snapshot para ticket 80mm directo y para stock local (antes de limpiar)
    const snapshotItems = [...items];
    const snapshotSubtotal = subtotal;
    const snapshotDiscount = discount;
    const snapshotTotal = total;
    const snapshotPayments =
      payments.length > 0 ? [...payments] : [{method, amount: total} as typeof payments[number]];

    const tenant = useAuthStore.getState().tenant;
    const user = useAuthStore.getState().user;

    setSubmitting(true);
    try {
      const payload = buildSalePayload();
      const sale = await createSale(payload);
      const folio = sale.folio ?? 'V-?';

      // Impresión directa USB 80mm por defecto (Fase 1) — best-effort
      // Fallback: si no hay impresora persistida, intenta auto-detectar la térmica 80mm.
      // Se prefieren impresoras en línea (isOnline real desde WinSpool): una
      // apagada/desconectada acepta el spool igual y mentiría "impreso".
      let printed = false;
      let unconfirmed = false;
      let printError: string | null = null;
      let persisted = await getPersistedUsbPrinter();
      if (!persisted?.printerName) {
        try {
          const { listPrinters, persistUsbPrinter } = await import('../services/hardware');
          const list = await listPrinters();
          const online = list.filter(l => l.isOnline !== false);
          const pool = online.length > 0 ? online : list;
          if (pool.length > 0) {
            const pref = pool.find(l => /80mm|thermal|pos|receipt/i.test(l.name)) ?? pool[0];
            if (pref) {
              await persistUsbPrinter({
                printerName: pref.name,
                portName: pref.portName,
                driverName: pref.driverName,
              });
              persisted = { printerName: pref.name, portName: pref.portName, driverName: pref.driverName };
            }
          }
        } catch {
          /* sin impresoras disponibles -> mensaje de Hardware */
        }
      }
      if (persisted?.printerName) {
        try {
          const ticket = buildTicket80mm({
            businessName: tenant?.business_name ?? 'PUNTO DE VENTA',
            businessAddress: tenant?.address ?? null,
            businessPhone: tenant?.phone ?? null,
            folio,
            createdAt: (sale as unknown as {created_at?: string})?.created_at,
            cashierName: user?.name ?? null,
            items: snapshotItems,
            subtotal: snapshotSubtotal,
            discount: snapshotDiscount,
            total: snapshotTotal,
            payments: snapshotPayments.map(p => ({method: p.method, amount: p.amount})),
            change: (sale as unknown as {payment_change?: number})?.payment_change,
            footer: tenant?.receipt_footer ?? null,
          });
          const result = await printTicketDirect(ticket);
          if (result.outcome === 'printed') {
            printed = true;
          } else if (result.outcome === 'sent_unconfirmed') {
            unconfirmed = true;
          }
        } catch (printErr) {
          console.warn('[CartSheet] fallo impresión directa USB 80mm', printErr);
          printError =
            printErr instanceof Error ? printErr.message : String(printErr ?? '');
        }
      }

      // Actualizar stock local (sidecar) y notificar
      clearCart();
      onSaleDone?.({folio: sale.folio, id: sale.id, items: snapshotItems});
      if (printed) {
        toast.success(`Venta ${folio} · Ticket impreso (80mm)`);
      } else if (unconfirmed) {
        // Bytes aceptados pero el spooler no confirmó papel en ~15s.
        toast.success(`Venta ${folio} · Ticket enviado a impresora, sin confirmar impresión`);
      } else if (persisted?.printerName) {
        // La venta quedó registrada pero NO salió papel (impresora offline,
        // sin papel o error de spool): decirlo explícito, nunca "impreso".
        toast.success(`Venta ${folio} · Ticket generado, pero no se imprimió`);
        if (printError) {
          toast.error(`Impresora: ${printError}`);
        }
      } else {
        toast.success(`Venta registrada · Folio: ${folio}`);
        toast.error('Sin impresora: Configura USB 80mm en Hardware');
      }
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

  /* ── Expandido: sidebar completo (respeta BottomNavBar h-16) ───────────── */
  return (
    <aside className="fixed top-16 bottom-16 right-0 z-30 flex w-80 max-h-[calc(100dvh-8rem)] flex-col border-l border-[var(--color-border)] bg-[var(--color-surface-solid)] shadow-[0_4px_12px_var(--color-shadow)] sm:bottom-16 sm:max-h-[calc(100vh-8rem)] max-sm:bottom-16">
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
