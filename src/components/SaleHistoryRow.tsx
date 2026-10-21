/**
 * components/SaleHistoryRow.tsx — Fila del historial de ventas (Reportes).
 *
 * Muestra folio, estado (CANCELADO), fecha, vendedor, estado del pago y el
 * total. El botón de detalle abre el modal `SaleDetailDialog`; solo se
 * dibuja si el usuario tiene `sales:read_own` (permiso que exige
 * `GET /sales/:id`).
 */
import {Eye} from 'lucide-react';
import type {SaleHistoryItem} from '../api/endpoints';
import {PAYMENT_STATE_LABELS} from './SaleDetailDialog';

const fmt = (n: number) =>
  n.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2});

export default function SaleHistoryRow({
  sale,
  canViewDetail,
  onViewDetail,
}: {
  sale: SaleHistoryItem;
  canViewDetail: boolean;
  onViewDetail: (saleId: string) => void;
}) {
  const cancelled = sale.status === 'CANCELLED';

  return (
    <div className="flex items-center justify-between gap-3 py-2" data-testid={`sale-row-${sale.id}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-[var(--font-regular)] font-semibold text-[var(--color-text)]">
            {sale.folio}
          </p>
          {cancelled && (
            <span className="rounded-[var(--radius-round)] bg-[var(--color-danger-soft)] px-2 py-0.5 text-[var(--font-micro)] font-bold text-[var(--color-danger)]">
              CANCELADO
            </span>
          )}
        </div>
        <p className="text-[var(--font-micro)] text-[var(--color-text-secondary)]">
          {new Date(sale.created_at).toLocaleString('es-MX')} · {sale.seller_name ?? '—'} ·{' '}
          {PAYMENT_STATE_LABELS[sale.payment_state] ?? sale.payment_state}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`text-[var(--font-medium)] font-bold ${
            cancelled ? 'text-[var(--color-danger)]' : 'text-[var(--color-primary)]'
          }`}
        >
          ${fmt(sale.total)}
        </span>
        {canViewDetail && (
          <button
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-primary-soft)] hover:text-[var(--color-primary)]"
            onClick={() => onViewDetail(sale.id)}
            title="Ver detalle de la venta"
            data-testid={`detail-${sale.id}`}
          >
            <Eye size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
