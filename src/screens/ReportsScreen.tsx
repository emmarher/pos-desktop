/**
 * screens/ReportsScreen.tsx — Reportes (RF-PR).
 *
 * Portado de pos-mobile a React DOM/Tailwind. Consume /reports/quick-stats
 * + /reports/sales-history (vía Rust). Solo visible con reports:read.
 *
 * RF-PR-005: el historial de ventas muestra por defecto las del día de hoy
 * y permite filtrar por rango de fechas (from/to).
 */
import {useCallback, useEffect, useState} from 'react';
import {getQuickStats, getSalesHistory} from '../api/endpoints';
import type {QuickStats, SaleHistoryItem} from '../api/endpoints';
import {ApiError} from '../api/client';
import BottomNavBar, {NavTab} from '../components/BottomNavBar';
import TopAppBar from '../components/TopAppBar';
import KpiCard from '../components/KpiCard';
import GlassSurface from '../components/GlassSurface';

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  CREDIT: 'Crédito',
  VOUCHER: 'Voucher',
};

const fmt = (n: number) =>
  n.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2});

interface ReportsScreenProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onLogout?: () => void;
  visibleTabs?: NavTab[];
}

export default function ReportsScreen({
  activeTab,
  onTabChange,
  onLogout,
  visibleTabs,
}: ReportsScreenProps) {
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [history, setHistory] = useState<SaleHistoryItem[]>([]);
  const [historyCount, setHistoryCount] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [historyOffset, setHistoryOffset] = useState(0);

  /* KPIs: ventas de hoy, ayer, desglose por método y categoría */
  const loadQuickStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const s = await getQuickStats();
      setStats(s);
    } catch {
      /* Los KPIs usan valores por defecto si falla quick-stats */
    } finally {
      setStatsLoading(false);
    }
  }, []);

  /* Historial de ventas: filtrable por rango de fechas (RF-PR-005) */
  const loadHistory = useCallback(
    async (opts?: {reset?: boolean}) => {
      const reset = opts?.reset ?? false;
      const off = reset ? 0 : historyOffset;
      if (reset) setHistoryOffset(0);
      setHistoryLoading(true);
      setHistoryError(null);
      // Ventas de hoy por defecto (from = inicio de hoy)
      const today = new Date().toISOString().split('T')[0];
      const params = {
        from: dateFrom || `${today}T00:00:00.000Z`,
        to: dateTo || undefined,
        limit: 20,
        offset: off,
      };
      try {
        const res = await getSalesHistory(params);
        if (reset) {
          setHistory(res.items);
        } else {
          setHistory(prev => [...prev, ...res.items]);
        }
        setHistoryCount(res.total);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : String(err);
        setHistoryError(msg);
        if (reset) setHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    },
    [dateFrom, dateTo, historyOffset],
  );

  useEffect(() => {
    void loadQuickStats();
  }, [loadQuickStats]);

  /* Carga inicial del historial (hoy) */
  useEffect(() => {
    void loadHistory({reset: true});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); /* solo al montar */

  /* Recargar historial cuando cambian los filtros de fecha */
  const handleFilterClick = () => {
    void loadHistory({reset: true});
  };

  /* Cargar más (paginación) */
  const handleLoadMore = () => {
    if (history.length >= historyCount) return;
    void loadHistory({reset: false});
  };

  const todayTotal = stats?.today.total_sales ?? 0;
  const yestTotal = stats?.yesterday.total_sales ?? 0;
  const avgTicket = stats?.today.average_ticket ?? 0;
  const delta = yestTotal > 0 ? ((todayTotal - yestTotal) / yestTotal) * 100 : 0;
  const canLoadMore = history.length < historyCount;

  return (
    <div className="flex h-full w-full flex-col bg-[var(--color-background)]">
      <TopAppBar title="Reportes" onLogout={onLogout} />

      <div className="flex-1 space-y-4 overflow-y-auto p-4 pb-24">
        {statsLoading ? (
          <p className="py-6 text-center text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
            Cargando reportes…
          </p>
        ) : (
          <>
            {/* KPIs */}
            <h3 className="text-[var(--font-medium)] font-bold text-[var(--color-text)]">Vista general</h3>
            <div className="flex gap-2">
              <KpiCard
                label="Ventas hoy"
                value={`$${fmt(todayTotal)}`}
                trend={delta >= 0 ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`}
              />
              <KpiCard label="Ticket promedio" value={`$${fmt(avgTicket)}`} />
            </div>
            <div className="flex gap-2">
              <KpiCard label="Ventas ayer" value={`$${fmt(yestTotal)}`} />
              <KpiCard label="Transacciones" value={String(stats?.today.transactions ?? 0)} />
            </div>

            {/* Desglose por método */}
            <GlassSurface className="p-4">
              <h4 className="mb-2 text-[var(--font-medium)] font-bold text-[var(--color-text)]">Ventas por método</h4>
              {stats && stats.by_payment_method.length > 0 ? (
                stats.by_payment_method.map(m => (
                  <div key={m.method} className="flex items-center justify-between border-b border-[var(--color-border)] py-2">
                    <span className="text-[var(--font-regular)] font-semibold text-[var(--color-text)]">
                      {METHOD_LABELS[m.method] ?? m.method}
                    </span>
                    <span className="text-[var(--font-regular)] font-bold text-[var(--color-text)]">${fmt(m.total)}</span>
                  </div>
                ))
              ) : (
                <p className="text-[var(--font-small)] text-[var(--color-text-secondary)]">Sin ventas hoy</p>
              )}
            </GlassSurface>

            {/* Desglose por categoría */}
            <GlassSurface className="p-4">
              <h4 className="mb-2 text-[var(--font-medium)] font-bold text-[var(--color-text)]">Ventas por categoría</h4>
              {stats && stats.by_category.length > 0 ? (
                stats.by_category.map(c => (
                  <div key={c.category_id ?? 'sin-cat'} className="flex items-center justify-between border-b border-[var(--color-border)] py-2">
                    <span className="text-[var(--font-regular)] font-semibold text-[var(--color-text)]">
                      {c.category_name ?? 'Sin categoría'}
                    </span>
                    <span className="text-[var(--font-regular)] font-bold text-[var(--color-text)]">${fmt(c.total)}</span>
                  </div>
                ))
              ) : (
                <p className="text-[var(--font-small)] text-[var(--color-text-secondary)]">Sin datos por categoría</p>
              )}
            </GlassSurface>

            {/* Historial de ventas con filtro de fecha (RF-PR-005) */}
            <GlassSurface className="p-4">
              <h4 className="mb-2 text-[var(--font-medium)] font-bold text-[var(--color-text)]">
                Ventas del día
              </h4>

              {/* Filtro de rango de fechas */}
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <div className="flex flex-col">
                  <label className="text-[var(--font-micro)] font-semibold text-[var(--color-text-secondary)]">Desde</label>
                  <input
                    type="date"
                    className="mt-1 w-36 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1.5 text-[var(--font-small)] text-[var(--color-text)] outline-none"
                    value={dateFrom ? dateFrom.split('T')[0] : ''}
                    onChange={e => setDateFrom(e.target.value ? `${e.target.value}T00:00:00.000Z` : '')}
                    data-testid="filter-date-from"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[var(--font-micro)] font-semibold text-[var(--color-text-secondary)]">Hasta</label>
                  <input
                    type="date"
                    className="mt-1 w-36 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1.5 text-[var(--font-small)] text-[var(--color-text)] outline-none"
                    value={dateTo ? dateTo.split('T')[0] : ''}
                    onChange={e => setDateTo(e.target.value ? `${e.target.value}T23:59:59.999Z` : '')}
                    data-testid="filter-date-to"
                  />
                </div>
                <button
                  className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-[var(--font-small)] font-semibold text-[var(--color-on-primary)] hover:opacity-90"
                  onClick={handleFilterClick}
                  data-testid="btn-filter-reports"
                >
                  Aplicar
                </button>
              </div>

              {/* Listado */}
              {historyLoading && history.length === 0 ? (
                <p className="py-4 text-center text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
                  Cargando ventas…
                </p>
              ) : historyError ? (
                <div className="py-4 text-center">
                  <p className="mb-2 text-[var(--font-regular)] font-semibold text-[var(--color-danger)]">
                    {historyError}
                  </p>
                  <button
                    className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-1.5 text-[var(--font-small)] font-semibold text-[var(--color-on-primary)] hover:opacity-90"
                    onClick={handleFilterClick}
                  >
                    Reintentar
                  </button>
                </div>
              ) : history.length > 0 ? (
                <>
                  <div className="divide-y divide-[var(--color-border)]">
                    {history.map(s => (
                      <div key={s.id} className="flex items-center justify-between py-2">
                        <div>
                          <p className="text-[var(--font-regular)] font-semibold text-[var(--color-text)]">{s.folio}</p>
                          <p className="text-[var(--font-micro)] text-[var(--color-text-secondary)]">
                            {new Date(s.created_at).toLocaleString('es-MX')} · {s.seller_name ?? '—'}
                          </p>
                        </div>
                        <span className="text-[var(--font-medium)] font-bold text-[var(--color-primary)]">${fmt(s.total)}</span>
                      </div>
                    ))}
                  </div>
                  {canLoadMore && (
                    <div className="pt-3 text-center">
                      <button
                        className="rounded-[var(--radius-md)] bg-[var(--color-secondary)]/70 px-4 py-1.5 text-[var(--font-small)] font-semibold text-[var(--color-on-primary)] hover:opacity-90"
                        onClick={handleLoadMore}
                        disabled={historyLoading}
                        data-testid="btn-load-more-reports"
                      >
                        {historyLoading ? 'Cargando…' : 'Cargar más'}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[var(--font-small)] text-[var(--color-text-secondary)]">
                  Sin ventas registradas para el rango seleccionado.
                </p>
              )}
            </GlassSurface>
          </>
        )}
      </div>

      <BottomNavBar active={activeTab} onChange={onTabChange} visibleTabs={visibleTabs} />
    </div>
  );
}
