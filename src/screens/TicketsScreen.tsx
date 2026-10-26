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
import {Eye, Printer, Trash2} from 'lucide-react';
import {useAuthStore} from '../stores/auth.store';
import BottomNavBar, {NavTab} from '../components/BottomNavBar';
import TopAppBar from '../components/TopAppBar';
import {toast} from '../hooks/useToast';
import {promptAction} from '../lib/confirm';
import {
  getMyTickets,
  cancelSale,
  reprintTicket,
  type SaleHistoryItem,
} from '../api/endpoints';
import SaleDetailDialog, {PAYMENT_STATE_LABELS} from '../components/SaleDetailDialog';
import {ApiError} from '../api/client';

interface TicketsScreenProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onLogout?: () => void;
  visibleTabs?: NavTab[];
}

const fmt = (n: number) =>
  n.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2});

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
  const [folioQuery, setFolioQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null);

  /* Fecha por defecto: desde inicio de hoy hasta ahora */
  const today = useMemo(() => new Date().toISOString().split('T')[0], []);

  const loadTickets = useCallback(
    async (resetOffset = true) => {
      if (resetOffset) setOffset(0);
      const o = resetOffset ? 0 : offset;
      const folioTrim = folioQuery.trim();
      const params = {
        from: dateFrom || `${today}T00:00:00.000Z`,
        to: dateTo || undefined,
        folio: folioTrim || undefined,
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
    [dateFrom, dateTo, folioQuery, today, offset, tickets.length],
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
      // 'printed' = salió directo por USB local; 'queued' = delegado a la
      // cola del servidor (requiere el orquestador en el equipo con impresora).
      const outcome = await reprintTicket(saleId);
      if (outcome === 'printed') {
        toast.success('Ticket reimpreso (80mm).');
      } else {
        toast.success('Ticket generado, pero no se imprimió (encolado).');
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      toast.error(`No se imprimió: ${msg} — el ticket quedó registrado.`);
    }
  };

  /* Cancelar exige motivo (sales:cancel): se pide con el diálogo global de la app. */
  const handleCancel = async (saleId: string) => {
    const reason = await promptAction({
      tone: 'danger',
      icon: 'alert',
      title: 'Cancelar venta',
      message: 'La venta quedará anulada y el stock se reintegrará.',
      input: {
        label: 'Motivo de cancelación',
        placeholder: 'Ej: error de cobro, producto defectuoso…',
        required: true,
        requiredMessage: 'Debe ingresar un motivo para cancelar.',
        maxLength: 500,
      },
      confirmLabel: 'Cancelar venta',
      cancelLabel: 'Volver',
      /* No cerrar al click fuera: hay texto escrito que se perdería. */
      dismissOnBackdrop: false,
    });
    if (!reason) return;

    setCancellingId(saleId);
    try {
      await cancelSale(saleId, reason);
      toast.success('Venta cancelada. Stock reintegrado.');
      void loadTickets(true);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : String(err);
      toast.error(`No se pudo cancelar: ${msg}`);
    } finally {
      setCancellingId(null);
    }
  };

  const canLoadMore = tickets.length < totalCount;

  return (
    <div className="flex h-full w-full flex-col bg-[var(--color-background)]">
      <TopAppBar title="Mis tickets" onLogout={onLogout} />

      {/* Filtros: folio + fecha */}
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="text-[var(--font-micro)] font-semibold text-[var(--color-text-secondary)]">
              Folio
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="text"
                placeholder="V-00000x"
                className="w-36 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1.5 text-[var(--font-small)] text-[var(--color-text)] outline-none"
                value={folioQuery}
                onChange={e => setFolioQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleFilter();
                }}
                data-testid="input-folio"
              />
              {folioQuery && (
                <button
                  className="text-[var(--font-small)] text-[var(--color-text-secondary)] hover:text-[var(--color-danger)]"
                  onClick={() => {
                    setFolioQuery('');
                    // aplicar inmediatamente sin folio
                    setOffset(0);
                  }}
                  title="Limpiar folio"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
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
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)]/60 px-4 py-2 text-[var(--font-small)] font-semibold text-[var(--color-on-primary)] hover:opacity-90"
            onClick={handleFilter}
            data-testid="btn-filter-tickets"
          >
            Buscar
          </button>
          {folioQuery.trim() && (
            <span className="rounded-[var(--radius-round)] bg-[var(--color-primary-soft)] px-2 py-1 text-[var(--font-micro)] font-semibold text-[var(--color-primary)]">
              Folio: {folioQuery.trim().toUpperCase()}
            </span>
          )}
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
                    {PAYMENT_STATE_LABELS[s.payment_state] ?? s.payment_state}
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
                    onClick={() => setDetailSaleId(s.id)}
                    title="Ver detalle de la venta"
                    data-testid={`detail-${s.id}`}
                  >
                    <Eye size={16} />
                  </button>
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
                      className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)] disabled:opacity-40"
                      onClick={() => void handleCancel(s.id)}
                      disabled={cancellingId === s.id}
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

      <SaleDetailDialog saleId={detailSaleId} onClose={() => setDetailSaleId(null)} />

      <BottomNavBar active={activeTab} onChange={onTabChange} visibleTabs={visibleTabs} />
    </div>
  );
}
