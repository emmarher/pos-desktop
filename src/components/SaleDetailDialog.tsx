/**
 * components/SaleDetailDialog.tsx — Modal con el detalle completo de una venta.
 *
 * Compartido por TicketsScreen (RF-VE-006) y ReportsScreen (RF-PR-005):
 * ambos listan ventas y necesitan abrir el detalle (GET /sales/:id).
 *
 * El endpoint exige el permiso `sales:read_own`; quien no lo tenga no debe
 * renderizar el botón que abre este modal (evita un 403 innecesario).
 */
import {useEffect, useState} from 'react';
import {Share2} from 'lucide-react';
import {getSale} from '../api/endpoints';
import {ApiError} from '../api/client';
import type {SaleDetail} from '../models';
import {useAuthStore} from '../stores/auth.store';
import ShareTicketDialog from './ShareTicketDialog';
import type {TicketPreviewData} from './TicketPreview';

/** Etiquetas legibles de los métodos de pago. */
export const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  CREDIT: 'Crédito',
  VOUCHER: 'Voucher',
};

/**
 * Etiquetas legibles del ESTADO del pago (`sales.payment_state`).
 * Distinto del método: PAID / PENDING / PARTIAL.
 */
export const PAYMENT_STATE_LABELS: Record<string, string> = {
  PAID: 'Pagado',
  PENDING: 'Pendiente',
  PARTIAL: 'Parcial',
};

const fmt = (n: number) =>
  n.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2});

/** Fila "etiqueta — valor" del resumen de totales. */
function SumRow({label, value, bold}: {label: string; value: string; bold?: boolean}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--color-text-secondary)]">{label}</span>
      <span className={bold ? 'font-bold text-[var(--color-text)]' : 'text-[var(--color-text)]'}>
        {value}
      </span>
    </div>
  );
}

/** Modal: detalle completo de una venta (GET /sales/:id). */
export default function SaleDetailDialog({
  saleId,
  onClose,
}: {
  saleId: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [shareData, setShareData] = useState<TicketPreviewData | null>(null);
  const tenant = useAuthStore(s => s.tenant);
  const license = useAuthStore(s => s.license);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!saleId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    getSale(saleId)
      .then(d => {
        if (!cancelled) setDetail(d);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [saleId]);

  if (!saleId) return null;

  /** Arma el ticket visual desde el detalle (incluye licencia y contacto). */
  const buildShareData = (d: SaleDetail): TicketPreviewData => ({
    businessName: license?.customer?.trim() || tenant?.business_name || 'PUNTO DE VENTA',
    businessAddress: tenant?.address ?? null,
    businessPhone: tenant?.phone ?? null,
    logoUrl: tenant?.logo_url ?? null,
    folio: d.folio,
    createdAt: d.created_at,
    items: d.items.map(it => ({
      name: it.product_name,
      qty: it.alternate_quantity != null ? `${it.alternate_quantity} kg` : `${it.quantity}`,
      unitPrice: it.unit_price,
      subtotal: it.subtotal,
    })),
    subtotal: d.subtotal,
    discount: d.discount,
    total: d.total,
    payments: d.payments.map(p => ({method: p.method, amount: p.amount})),
    change: d.payments.reduce((sum, p) => sum + p.change_amount, 0),
    footer: tenant?.receipt_footer ?? null,
  });

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-[var(--radius-xl)] bg-[var(--color-surface-solid)] p-6"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="mb-3 text-[var(--font-medium)] font-extrabold text-[var(--color-text)]">
          Detalle de venta {detail?.folio ?? ''}
        </h3>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
              Cargando…
            </p>
          ) : error ? (
            <p className="py-6 text-center text-[var(--font-small)] font-semibold text-[var(--color-danger)]">
              {error}
            </p>
          ) : detail ? (
            <>
              <p className="mb-3 text-[var(--font-micro)] text-[var(--color-text-secondary)]">
                {new Date(detail.created_at).toLocaleString('es-MX')} ·{' '}
                {PAYMENT_STATE_LABELS[detail.payment_state] ?? detail.payment_state}
                {detail.status === 'CANCELLED' ? ' · CANCELADO' : ''}
              </p>
              {detail.cancel_reason && (
                <p className="mb-3 rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] px-3 py-2 text-[var(--font-micro)] font-semibold text-[var(--color-danger)]">
                  Motivo de cancelación: {detail.cancel_reason}
                </p>
              )}

              <h4 className="mb-1 text-[var(--font-small)] font-bold text-[var(--color-text)]">
                Artículos
              </h4>
              <div className="mb-4 divide-y divide-[var(--color-border)]">
                {detail.items.map(it => (
                  <div key={it.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-[var(--font-small)] text-[var(--color-text)]">
                      {it.quantity} × {it.product_name}
                    </span>
                    <span className="shrink-0 text-[var(--font-small)] text-[var(--color-text-secondary)]">
                      ${fmt(it.unit_price)}
                    </span>
                    <span className="w-20 shrink-0 text-right text-[var(--font-small)] font-bold text-[var(--color-text)]">
                      ${fmt(it.subtotal)}
                    </span>
                  </div>
                ))}
                {detail.items.length === 0 && (
                  <p className="py-2 text-[var(--font-small)] text-[var(--color-text-secondary)]">
                    Sin artículos.
                  </p>
                )}
              </div>

              {detail.payments.length > 0 && (
                <>
                  <h4 className="mb-1 text-[var(--font-small)] font-bold text-[var(--color-text)]">
                    Pagos
                  </h4>
                  <div className="mb-4 divide-y divide-[var(--color-border)]">
                    {detail.payments.map(p => (
                      <div key={p.id} className="flex items-center justify-between py-1.5">
                        <span className="text-[var(--font-small)] text-[var(--color-text-secondary)]">
                          {METHOD_LABELS[p.method] ?? p.method}
                          {p.reference_code ? ` · ${p.reference_code}` : ''}
                        </span>
                        <span className="text-[var(--font-small)] font-bold text-[var(--color-text)]">
                          ${fmt(p.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="space-y-1 border-t border-[var(--color-border)] pt-3 text-[var(--font-small)]">
                <SumRow label="Subtotal" value={'$' + fmt(detail.subtotal)} />
                {detail.discount > 0 && (
                  <SumRow label="Descuento" value={'−$' + fmt(detail.discount)} />
                )}
                {detail.tax > 0 && <SumRow label="Impuesto" value={'$' + fmt(detail.tax)} />}
                <SumRow label="Total" value={'$' + fmt(detail.total)} bold />
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            className="flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)]/50 px-4 py-2 text-[var(--font-regular)] font-semibold text-[var(--color-on-primary)] hover:opacity-90 disabled:opacity-50"
            onClick={() => detail && setShareData(buildShareData(detail))}
            disabled={!detail}
            data-testid="btn-share-ticket"
          >
            <Share2 size={16} /> Compartir
          </button>
          <button
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-[var(--font-regular)] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-soft)]"
            onClick={onClose}
            data-testid="btn-close-detail"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
    <ShareTicketDialog data={shareData} onClose={() => setShareData(null)} />
    </>
  );
}
