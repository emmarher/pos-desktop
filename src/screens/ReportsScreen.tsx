/**
 * screens/ReportsScreen.tsx — Reportes (RF-PR).
 *
 * Portado de pos-mobile a React DOM/Tailwind. Consume /reports/quick-stats
 * + /reports/sales-history (vía Rust). Solo visible con reports:read.
 */
import {useCallback, useEffect, useState} from 'react';
import {
  getQuickStats,
  getSalesHistory,
  QuickStats,
  SaleHistoryItem,
} from '../api/endpoints';
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
  const [loading, setLoading] = useState(true);

  const loadReports = useCallback(async () => {
    setLoading(true);
    const [s, h] = await Promise.all([
      getQuickStats().catch(() => null),
      getSalesHistory().catch(() => null),
    ]);
    if (s) setStats(s);
    if (h) setHistory(h.items);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const todayTotal = stats?.today.total_sales ?? 0;
  const yestTotal = stats?.yesterday.total_sales ?? 0;
  const avgTicket = stats?.today.average_ticket ?? 0;
  const delta = yestTotal > 0 ? ((todayTotal - yestTotal) / yestTotal) * 100 : 0;

  return (
    <div className="flex h-full w-full flex-col bg-[var(--color-background)]">
      <TopAppBar title="Reportes" onLogout={onLogout} />

      <div className="flex-1 space-y-4 overflow-y-auto p-4 pb-24">
        {loading ? (
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

            {/* Historial reciente */}
            <GlassSurface className="p-4">
              <h4 className="mb-2 text-[var(--font-medium)] font-bold text-[var(--color-text)]">Últimas ventas</h4>
              {history.length > 0 ? (
                history.map(s => (
                  <div key={s.id} className="flex items-center justify-between border-b border-[var(--color-border)] py-2">
                    <div>
                      <p className="text-[var(--font-regular)] font-semibold text-[var(--color-text)]">{s.folio}</p>
                      <p className="text-[var(--font-micro)] text-[var(--color-text-secondary)]">
                        {new Date(s.created_at).toLocaleString('es-MX')} · {s.seller_name ?? '—'}
                      </p>
                    </div>
                    <span className="text-[var(--font-medium)] font-bold text-[var(--color-primary)]">${fmt(s.total)}</span>
                  </div>
                ))
              ) : (
                <p className="text-[var(--font-small)] text-[var(--color-text-secondary)]">Sin ventas registradas</p>
              )}
            </GlassSurface>
          </>
        )}
      </div>

      <BottomNavBar active={activeTab} onChange={onTabChange} visibleTabs={visibleTabs} />
    </div>
  );
}