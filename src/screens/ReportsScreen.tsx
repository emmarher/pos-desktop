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
import {FileDown} from 'lucide-react';
import {getQuickStats, getSalesHistory, getTopProducts} from '../api/endpoints';
import type {QuickStats, SaleHistoryItem, TopProduct} from '../api/endpoints';
import {ApiError} from '../api/client';
import {useAuthStore} from '../stores/auth.store';
import SaleDetailDialog, {METHOD_LABELS, PAYMENT_STATE_LABELS} from '../components/SaleDetailDialog';
import SaleHistoryRow from '../components/SaleHistoryRow';
import BottomNavBar, {NavTab} from '../components/BottomNavBar';
import TopAppBar from '../components/TopAppBar';
import KpiCard from '../components/KpiCard';
import GlassSurface from '../components/GlassSurface';
import {buildSalesReportPdf} from '../lib/report-export';
import {saveTicketFile} from '../services/ticket-share';
import {resolveTicketBranding} from '../lib/ticket';
import {toast} from '../hooks/useToast';

const fmt = (n: number) =>
  n.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2});

/** Cantidades: hasta 3 decimales para ventas por peso (kg). */
const fmtQty = (n: number) =>
  n.toLocaleString('es-MX', {maximumFractionDigits: 3});

/* ── Ventana de tiempo del reporte (fechas en hora local) ───────────── */

type RangePreset = 'today' | 'yesterday' | '7d' | 'month' | 'lastMonth' | 'all' | 'custom';

const RANGE_PRESETS: {key: Exclude<RangePreset, 'custom'>; label: string}[] = [
  {key: 'today', label: 'Hoy'},
  {key: 'yesterday', label: 'Ayer'},
  {key: '7d', label: 'Últimos 7 días'},
  {key: 'month', label: 'Este mes'},
  {key: 'lastMonth', label: 'Mes pasado'},
  {key: 'all', label: 'Todo'},
];

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};
const todayRange = () => ({
  from: startOfDay(new Date()).toISOString(),
  to: endOfDay(new Date()).toISOString(),
});
/** "2026-11-06" → fecha local (evita que se interprete como UTC). */
const parseLocalDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
/** ISO → "YYYY-MM-DD" en hora local (para los input date). */
const toDateInput = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('es-MX', {day: '2-digit', month: '2-digit', year: 'numeric'});

const MAX_REPORT_SALES = 5000;
const EXPORT_PAGE_SIZE = 100;
/** "Todo": los endpoints de top-products ponen hoy por defecto si no hay rango. */
const ALL_START = '1970-01-01T00:00:00.000Z';

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
  const [dateFrom, setDateFrom] = useState(() => toDateInput(todayRange().from));
  const [dateTo, setDateTo] = useState(() => toDateInput(todayRange().to));
  const [rangePreset, setRangePreset] = useState<RangePreset>('today');
  const [appliedRange, setAppliedRange] = useState<{from?: string; to?: string}>(() => todayRange());
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<string | null>(null);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [detailSaleId, setDetailSaleId] = useState<string | null>(null);
  // Ranking de productos más vendidos (mismo rango de fechas que el historial)
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [topLoading, setTopLoading] = useState(true);
  const [topError, setTopError] = useState<string | null>(null);

  /* GET /sales/:id exige `sales:read_own`: si el usuario no lo tiene, la
   * pestaña Reportes sigue funcionando pero sin el botón de detalle. */
  const user = useAuthStore(s => s.user);
  const tenant = useAuthStore(s => s.tenant);
  const license = useAuthStore(s => s.license);
  const canViewDetail = user?.permissions.includes('sales:read_own') ?? false;

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
      setHistoryLoading(true);
      setHistoryError(null);
      const params = {
        from: appliedRange.from ?? ALL_START,
        to: appliedRange.to ?? endOfDay(new Date()).toISOString(),
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
        // Sin esto "Cargar más" volvía a pedir offset 0 y duplicaba filas.
        setHistoryOffset(off + res.items.length);
        setHistoryCount(res.total);
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : String(err);
        setHistoryError(msg);
        if (reset) setHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    },
    [appliedRange, historyOffset],
  );

  /* Ranking de productos más vendidos */
  const loadTopProducts = useCallback(async () => {
    setTopLoading(true);
    setTopError(null);
    try {
      const res = await getTopProducts({
        from: appliedRange.from ?? ALL_START,
        to: appliedRange.to ?? endOfDay(new Date()).toISOString(),
        limit: 10,
      });
      setTopProducts(res);
    } catch (err) {
      // Mostrar el error real (red/permiso) en lugar de una lista vacía.
      setTopError(err instanceof ApiError ? err.message : String(err));
      setTopProducts([]);
    } finally {
      setTopLoading(false);
    }
  }, [appliedRange]);

  useEffect(() => {
    void loadQuickStats();
  }, [loadQuickStats]);

  /* Recargar historial y ranking cada vez que cambia la ventana aplicada. */
  useEffect(() => {
    void loadHistory({reset: true});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedRange]);

  useEffect(() => {
    void loadTopProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedRange]);

  /* Aplica el rango escrito en los dos input date (hora local). */
  const handleFilterClick = () => {
    const from = dateFrom ? startOfDay(parseLocalDate(dateFrom)).toISOString() : undefined;
    const to = dateTo ? endOfDay(parseLocalDate(dateTo)).toISOString() : undefined;
    if (from && to && from > to) {
      setRangeError('La fecha "Desde" no puede ser mayor que "Hasta".');
      return;
    }
    setRangeError(null);
    setRangePreset('custom');
    setAppliedRange({from, to});
  };

  /* Atajos: Hoy / Ayer / 7 días / Mes / Mes pasado / Todo. */
  const applyPreset = (preset: Exclude<RangePreset, 'custom'>) => {
    const now = new Date();
    let from: string | undefined;
    let to: string | undefined;
    switch (preset) {
      case 'today':
        from = startOfDay(now).toISOString();
        to = endOfDay(now).toISOString();
        break;
      case 'yesterday': {
        const d = new Date(now);
        d.setDate(d.getDate() - 1);
        from = startOfDay(d).toISOString();
        to = endOfDay(d).toISOString();
        break;
      }
      case '7d': {
        const d = new Date(now);
        d.setDate(d.getDate() - 6);
        from = startOfDay(d).toISOString();
        to = endOfDay(now).toISOString();
        break;
      }
      case 'month':
        from = startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)).toISOString();
        to = endOfDay(now).toISOString();
        break;
      case 'lastMonth':
        from = startOfDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)).toISOString();
        to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)).toISOString();
        break;
      case 'all':
        break;
    }
    setRangePreset(preset);
    setDateFrom(from ? toDateInput(from) : '');
    setDateTo(to ? toDateInput(to) : '');
    setRangeError(null);
    setAppliedRange({from, to});
  };

  /* Descarga el PDF del rango aplicado (todas las páginas, no solo las visibles). */
  const handleExportPdf = async () => {
    if (exporting) return;
    if (rangeError) {
      toast.error(rangeError);
      return;
    }
    setExporting(true);
    setExportProgress(null);
    const apiFrom = appliedRange.from ?? ALL_START;
    const apiTo = appliedRange.to ?? endOfDay(new Date()).toISOString();
    try {
      const first = await getSalesHistory({
        from: apiFrom,
        to: apiTo,
        limit: EXPORT_PAGE_SIZE,
        offset: 0,
      });
      if (first.total > MAX_REPORT_SALES) {
        toast.error(
          `El rango tiene ${first.total} ventas; el máximo por PDF es ${MAX_REPORT_SALES}. Acota el periodo.`,
        );
        return;
      }

      const sales = [...first.items];
      while (sales.length < first.total) {
        setExportProgress(`${sales.length}/${first.total}`);
        const page = await getSalesHistory({
          from: apiFrom,
          to: apiTo,
          limit: EXPORT_PAGE_SIZE,
          offset: sales.length,
        });
        if (page.items.length === 0) break;
        sales.push(...page.items);
      }
      setExportProgress(`${sales.length}/${sales.length}`);

      const [products, statsNow] = await Promise.all([
        getTopProducts({from: apiFrom, to: apiTo, limit: 100}).catch(
          () => [] as TopProduct[],
        ),
        getQuickStats().catch(() => null),
      ]);

      const rangeLabel =
        !appliedRange.from && !appliedRange.to
          ? 'Todo el historial'
          : `${appliedRange.from ? dateLabel(appliedRange.from) : 'Inicio'} al ${
              appliedRange.to ? dateLabel(appliedRange.to) : 'hoy'
            }`;

      const base64 = buildSalesReportPdf({
        businessName: resolveTicketBranding(tenant, license?.customer).businessName,
        generatedAt: new Date().toISOString(),
        generatedBy: user?.name ?? null,
        rangeLabel,
        sales: sales.map(s => ({
          folio: s.folio,
          createdAt: s.created_at,
          sellerName: s.seller_name,
          customerName: s.customer_name,
          subtotal: s.subtotal,
          discount: s.discount,
          tax: s.tax,
          total: s.total,
          paymentState: PAYMENT_STATE_LABELS[s.payment_state] ?? s.payment_state,
        })),
        products: products.map(p => ({
          productName: p.product_name,
          units: p.units,
          tickets: p.tickets,
          revenue: p.revenue,
        })),
        stats: statsNow
          ? {
              todayTotal: statsNow.today.total_sales,
              todayTransactions: statsNow.today.transactions,
              averageTicket: statsNow.today.average_ticket,
              yesterdayTotal: statsNow.yesterday.total_sales,
              byPaymentMethod: statsNow.by_payment_method.map(m => ({
                label: METHOD_LABELS[m.method] ?? m.method,
                total: m.total,
                count: m.count,
              })),
              byCategory: statsNow.by_category.map(c => ({
                label: c.category_name ?? 'Sin categoría',
                total: c.total,
              })),
            }
          : null,
      });

      const safeFrom = appliedRange.from ? toDateInput(appliedRange.from) : 'inicio';
      const safeTo = appliedRange.to ? toDateInput(appliedRange.to) : 'hoy';
      const saved = await saveTicketFile('pdf', base64, `reporte_ventas_${safeFrom}_${safeTo}`);
      if (saved) toast.success(`Reporte guardado (${sales.length} venta(s)).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo generar el reporte.');
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
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
            {/* KPIs y desgloses en cuadrícula responsiva */}
            <h3 className="text-[var(--font-medium)] font-bold text-[var(--color-text)]">Vista general</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <KpiCard
                label="Ventas hoy"
                value={`$${fmt(todayTotal)}`}
                trend={delta >= 0 ? `+${delta.toFixed(1)}%` : `${delta.toFixed(1)}%`}
              />
              <KpiCard label="Ticket promedio" value={`$${fmt(avgTicket)}`} />
              <KpiCard label="Ventas ayer" value={`$${fmt(yestTotal)}`} />
              <KpiCard label="Transacciones" value={String(stats?.today.transactions ?? 0)} />

              {/* Desglose por método */}
              <GlassSurface className="p-2">
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
            </div>

            {/* Separador entre el resumen y el detalle */}
            <div className="border-t border-[var(--color-border)]" />

            {/* Atajos de ventana de tiempo */}
            <div className="flex flex-wrap items-center gap-2">
              {RANGE_PRESETS.map(p => (
                <button
                  key={p.key}
                  className={`rounded-[var(--radius-md)] px-3 py-1.5 text-[var(--font-small)] font-semibold ${
                    rangePreset === p.key
                      ? 'bg-[var(--color-primary)]/50 text-[var(--color-on-primary)]'
                      : 'border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-soft)]'
                  }`}
                  onClick={() => applyPreset(p.key)}
                  data-testid={`preset-${p.key}`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Filtro de rango de fechas a ancho completo */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex min-w-36 flex-1 flex-col">
                <label className="text-[var(--font-micro)] font-semibold text-[var(--color-text-secondary)]">Desde</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1.5 text-[var(--font-small)] text-[var(--color-text)] outline-none"
                  value={dateFrom}
                  onChange={e => {
                    setDateFrom(e.target.value);
                    setRangePreset('custom');
                  }}
                  data-testid="filter-date-from"
                />
              </div>
              <div className="flex min-w-36 flex-1 flex-col">
                <label className="text-[var(--font-micro)] font-semibold text-[var(--color-text-secondary)]">Hasta</label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-input)] px-2 py-1.5 text-[var(--font-small)] text-[var(--color-text)] outline-none"
                  value={dateTo}
                  onChange={e => {
                    setDateTo(e.target.value);
                    setRangePreset('custom');
                  }}
                  data-testid="filter-date-to"
                />
              </div>
              <button
                className="rounded-[var(--radius-md)] bg-[var(--color-primary)]/50 px-3 py-1.5 text-[var(--font-small)] font-semibold text-[var(--color-on-primary)] hover:opacity-90"
                onClick={handleFilterClick}
                data-testid="btn-filter-reports"
              >
                Aplicar
              </button>
              <button
                className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-[var(--font-small)] font-semibold text-[var(--color-text)] hover:bg-[var(--color-primary-soft)] disabled:opacity-50"
                onClick={() => void handleExportPdf()}
                disabled={exporting || !!rangeError}
                data-testid="btn-export-report-pdf"
              >
                <FileDown size={16} />
                {exporting
                  ? exportProgress
                    ? `Generando ${exportProgress}…`
                    : 'Generando…'
                  : 'Descargar PDF'}
              </button>
            </div>
            {rangeError && (
              <p className="text-[var(--font-small)] font-semibold text-[var(--color-danger)]">
                {rangeError}
              </p>
            )}

            {/* Detalle en dos columnas: ventas y productos más vendidos */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Historial de ventas (RF-PR-005) */}
              <GlassSurface className="p-4">
                <h4 className="mb-2 text-[var(--font-medium)] font-bold text-[var(--color-text)]">
                  Ventas del periodo ({historyCount})
                </h4>

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
                        <SaleHistoryRow
                          key={s.id}
                          sale={s}
                          canViewDetail={canViewDetail}
                          onViewDetail={setDetailSaleId}
                        />
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

              {/* Ranking de productos más vendidos */}
              <GlassSurface className="p-4" data-testid="top-products">
                <h4 className="mb-2 text-[var(--font-medium)] font-bold text-[var(--color-text)]">
                  Productos más vendidos
                </h4>
                {topLoading ? (
                  <p className="py-4 text-center text-[var(--font-small)] font-semibold text-[var(--color-text-secondary)]">
                    Cargando ranking…
                  </p>
                ) : topError ? (
                  <div className="py-2 text-center">
                    <p className="mb-2 text-[var(--font-regular)] font-semibold text-[var(--color-danger)]">
                      {topError}
                    </p>
                    <button
                      className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-1.5 text-[var(--font-small)] font-semibold text-[var(--color-on-primary)] hover:opacity-90"
                      onClick={() => void loadTopProducts()}
                    >
                      Reintentar
                    </button>
                  </div>
                ) : topProducts.length > 0 ? (
                  <div className="divide-y divide-[var(--color-border)]">
                    {topProducts.map((p, i) => (
                      <div key={p.product_id} className="flex items-center justify-between gap-3 py-2">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--font-micro)] font-bold text-[var(--color-primary)]">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[var(--font-regular)] font-semibold text-[var(--color-text)]">
                              {p.product_name}
                            </p>
                            <p className="text-[var(--font-micro)] text-[var(--color-text-secondary)]">
                              {fmtQty(p.units)} unidades · {p.tickets} tickets
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 text-[var(--font-regular)] font-bold text-[var(--color-text)]">
                          ${fmt(p.revenue)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[var(--font-small)] text-[var(--color-text-secondary)]">
                    Sin ventas en el rango seleccionado.
                  </p>
                )}
              </GlassSurface>
            </div>
          </>
        )}
      </div>

      <SaleDetailDialog saleId={detailSaleId} onClose={() => setDetailSaleId(null)} />

      <BottomNavBar active={activeTab} onChange={onTabChange} visibleTabs={visibleTabs} />
    </div>
  );
}
