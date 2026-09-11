/**
 * screens/TicketsScreen.tsx — Mis tickets / historial de ventas (RF-VE-006, RF-CC-003).
 *
 * Tercera pestaña (siempre visible con sales:read_own — Vendedor y Admin).
 * - Lista ventas: Admin ve todas (sales:read_all); Vendedor ve solo las suyas (sales:read_own).
 * - Reimprimir: obtiene el ticket ESC/POS almacenado y encola un print job.
 * - Cancelar: solo Admin (sales:cancel). Pide motivo y llama POST /sales/:id/cancel.
 *   El backend restaura el stock vía trigger (trg_sales_restore_stock).
 * - Filtro por rango de fechas (from/to); paginación "Cargar más".
 */
import {useCallback, useEffect, useMemo, useState} from 'react';
import {Printer, Trash2} from 'lucide-react';
import {useAuthStore} from '../stores/auth.store';
import BottomNavBar, {NavTab} from '../components/BottomNavBar';
import TopAppBar from '../components/TopAppBar';
import {toast} from '../hooks/useToast';
import {
  getMyTickets,
  cancelSale,
  reprintTicket,
  type SaleHistoryItem,
} from '../api/endpoints';
import {ApiError} from '../api/client';

interface TicketsScreenProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onLogout?: () => void;
  visibleTabs?: NavTab[];
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  CREDIT: 'Crédito',
  VOUCHER: 'Voucher',
};

const fmt = (n: number) =>
  n.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2});

/** Input de motivo para cancelación (modal). */
function CancelReasonDialog({
  visible,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  if (!visible) return null;
  const handleConfirm = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error('Debe ingresar un motivo para cancelar.');
      return;
    }
    onConfirm(trimmed);
    setReason('');
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-[var(--radius-xl)] bg-[var(--color-surface-solid)] p-6">
        <h3 className="mb-3 text-[var(--font-medium)] font-extrabold text-[var(--color-text)]">
          Cancelar venta
        </h3>
        <p className="mb-3 text-[var(--font-small)] text-[var(--color-text-secondary)]">
          Ingrese el motivo de la cancelación:
        </p>
        <textarea
          className="mb-4 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-[var(--font-regular)] text-[var(--color-text)] outline-none"
          placeholder="Ej: Producto defectuoso, error de cobro..."
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          maxLength={500}
        />
        <div className="flex gap-3">
          <button
            className="flex-1 rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-[var(--font-regular)] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-soft)]"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="flex-1 rounded-[var(--radius-md)] bg-[var(--color-danger)] px-4 py-2 text-[var(--font-regular)] font-semibold text-[var(--color-on-primary)] hover:opacity-90"
            onClick={handleConfirm}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TicketsScreen({
  activeTab,
  onTabChange,
  onLogout,
  visibleTabs,
}: TicketsScreenProps) {
  const user = useAuthStore(s => s.user);
  const canCancel = user?.permissions.includes('sales:cancel') ?? false;

  const [tickets, setTickets] = useState<SaleHistoryItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelSaleId, setCancelSaleId] = useState<string | null>(null);

  /* Fecha por defecto: desde inicio de hoy hasta ahora */
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  const loadTickets = useCallback(
    async (resetOffset = true) => {
      if (resetOffset) setOffset(0);
      const o = resetOffset ? 0 : offset;
      const params = {
        from: dateFrom || `${today}T00:00:00.000Z`,
        to: dateTo || undefined,
        limit: 20,
        offset: o,
      };
      try {
        const res = await getMyTickets(params);
        const newItems = res.items;
        if (resetOffset) {
          setTickets(newItems);
        } else {
          setTickets(prev => [...prev, ...newItems]);
        }
        setTotalCount(res.total);
        setError(null);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : String(err);
        setError(msg);
        if (tickets.length === 0) setTickets([]);
      } finally {
        setLoading(false);
        if (!resetOffset) setLoadingMore(false);
      }
    },
    [dateFrom, dateTo, today, offset, tickets.length],
  );

  useEffect(() => {
    void loadTickets(true);
  }, [loadTickets]);

  const handleFilter = () => {
    void loadTickets(true);
  };

  const handleLoadMore = () => {
    if (tickets.length >= totalCount) return;
    setOffset(o => o + 20);
  };

  useEffect(() => {
    if (offset > 0) {
      void loadTickets(false);
    }
  }, [offset]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReprint = async (saleId: string) => {
    try {
      await reprintTicket(saleId);
      toast.success('Ticket encolado para impresión.');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      toast.error(`No se pudo reimprimir: ${msg}`);
    }
  };

  const handleCancel = async (reason: string) => {
    if (!cancelSaleId) return;
    try {
      await cancelSale(cancelSaleId, reason);
      toast.success('Venta cancelada. Stock reintegrado.');
      void loadTickets(true);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      toast.error(`No se pudo cancelar: ${msg}`);
    } finally {
      setCancelDialogOpen(false);
      setCancelSaleId(null);
    }
  };

  const canLoadMore = tickets.length < totalCount;

  return (
    <div className="flex h-full w-full flex-col bg-[var(--color-background)]">
      <TopAppBar title="Mis tickets" onLogout={onLogout} />

      {/* Filtros de fecha */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="text-[var(--font-micro)] font-semibold text-[var(--color-text-secondary)]">
              Desde
            </label>
            <input
              type="date"
              className="mt-1 w-40 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1.5 text-[var(--font-small)] text-[var(--color-text)] outline-none"
              value={dateFrom ? dateFrom.split('T')[0] : today}
              onChange={e => setDateFrom(e.target.value ? `${e.target.value}T00:00:00.000Z` : '')}
            />
          </div>
          <div className="flex flex-col">
            <label className="text-[var(--font-micro)] font-semibold text-[var(--color-text-secondary)]">
              Hasta
            </label>
            <input
              type="date"
              className="mt-1 w-40 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1.5 text-[var(--font-small)] text-[var(--color-text)] outline-none"
              value={dateTo ? dateTo.split('T')[0] : ''}
              onChange={e => setDateTo(e.target.value ? `${e.target.value}T23:59:59.999Z` : '')}
            />
          </div>
          <button
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-[var(--font-small)] font-semibold text-[var(--color-on-primary)] hover:opacity-90"
            onClick={handleFilter}
            data-testid="btn-filter-tickets"
          >
            Aplicar
          </button>
          <span className="text-[var(--font-micro)] text-[var(--color-text-secondary)]">
            {totalCount} venta{totalCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-24">
        {loading ? (
          <div className="py-12 text-center">
            <span className="text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
              Cargando tickets…
            </span>
          </div>
        ) : error && tickets.length === 0 ? (
          <div className="mx-auto mt-12 max-w-sm rounded-lg p-6 text-center">
            <p className="mb-3 text-[var(--font-regular)] font-semibold text-[var(--color-danger)]">{error}</p>
            <button
              className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-6 py-2.5 text-[var(--font-regular)] font-semibold text-[var(--color-on-primary)] hover:opacity-90"
              onClick={() => void loadTickets(true)}
            >
              Reintentar
            </button>
          </div>
        ) : tickets.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-[var(--font-regular)] font-semibold text-[var(--color-text-secondary)]">
              No hay ventas para el rango de fechas seleccionado.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {tickets.map(s => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-3 p-4 hover:bg-[var(--color-primary-soft)]/30"
                data-testid={`ticket-${s.id}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--font-regular)] font-bold text-[var(--color-text)]">
                      {s.folio}
                    </span>
                    {s.status === 'CANCELLED' && (
                      <span className="rounded-[var(--radius-round)] bg-[var(--color-danger-soft)] px-2 py-0.5 text-[var(--font-micro)] font-bold text-[var(--color-danger)]">
                        CANCELADO
                      </span>
                    )}
                  </div>
                  <p className="text-[var(--font-micro)] text-[var(--color-text-secondary)]">
                    {new Date(s.created_at).toLocaleString('es-MX')} ·{' '}
                    {METHOD_LABELS[s.payment_state] ?? s.payment_state}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`text-[var(--font-medium)] font-bold ${
                    s.status === 'CANCELLED'
                      ? 'text-[var(--color-danger)]'
                      : 'text-[var(--color-primary)]'
                  }`}>
                    ${fmt(s.total)}
                  </span>
                  <button
                    className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-primary-soft)] hover:text-[var(--color-primary)]"
                    onClick={() => void handleReprint(s.id)}
                    title="Reimprimir ticket"
                    data-testid={`reprint-${s.id}`}
                  >
                    <Printer size={16} />
                  </button>
                  {canCancel && s.status !== 'CANCELLED' && (
                    <button
                      className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                      onClick={() => {
                        setCancelSaleId(s.id);
                        setCancelDialogOpen(true);
                      }}
                      title="Cancelar venta (Admin)"
                      data-testid={`cancel-${s.id}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {canLoadMore && (
              <div className="p-4 text-center">
                <button
                  className="rounded-[var(--radius-md)] bg-[var(--color-secondary)]/60 px-4 py-2 text-[var(--font-small)] font-semibold text-[var(--color-on-primary)] hover:opacity-90"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  data-testid="btn-load-more"
                >
                  {loadingMore ? 'Cargando…' : 'Cargar más'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <CancelReasonDialog
        visible={cancelDialogOpen}
        onClose={() => {
          setCancelDialogOpen(false);
          setCancelSaleId(null);
        }}
        onConfirm={handleCancel}
      />

      <BottomNavBar active={activeTab} onChange={onTabChange} visibleTabs={visibleTabs} />
    </div>
  );
}
