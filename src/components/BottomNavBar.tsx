/**
 * components/BottomNavBar.tsx — Navegación inferior (spec 3.2).
 *
 * Portado de pos-mobile a React DOM/Tailwind. Pestañas: Productos,
 * Inventario, Reportes. Reportes se oculta si no hay reports:read
 * (visibleTabs).
 */
import {Store, Box, BarChart3, Receipt} from 'lucide-react';

export type NavTab = 'caja' | 'inventario' | 'reportes' | 'tickets';

interface BottomNavBarProps {
  active: NavTab;
  onChange: (tab: NavTab) => void;
  cartCount?: number;
  /** Pestañas visibles por permisos (Reportes/Inventario ocultos para el Vendedor) */
  visibleTabs?: NavTab[];
}

const TABS: {key: NavTab; label: string; icon: React.ComponentType<{size?: number; strokeWidth?: number}>}[] = [
  {key: 'caja', label: 'Productos', icon: Store},
  {key: 'inventario', label: 'Inventario', icon: Box},
  {key: 'reportes', label: 'Reportes', icon: BarChart3},
  {key: 'tickets', label: 'Tickets', icon: Receipt},
];

export default function BottomNavBar({
  active,
  onChange,
  cartCount = 0,
  visibleTabs,
}: BottomNavBarProps) {
  const tabs = visibleTabs
    ? TABS.filter(t => visibleTabs.includes(t.key))
    : TABS;

  return (
    <nav className="border-t border-[var(--color-border)] bg-[var(--color-surface-solid)]">
      <div className="flex h-16 items-stretch justify-around">
        {tabs.map(tab => {
          const isActive = tab.key === active;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              className="relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors hover:bg-[var(--color-primary-soft)]"
              onClick={() => onChange(tab.key)}
              data-testid={`tab-${tab.key}`}
            >
              <span
                className={`flex items-center justify-center rounded-full px-3 py-1 transition-colors ${
                  isActive ? 'bg-[var(--color-primary-soft)]' : ''
                }`}
              >
                <Icon size={22} strokeWidth={1.9} />
                {tab.key === 'caja' && cartCount > 0 && (
                  <span className="absolute -top-0.5 right-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-warning)] px-1 text-[10px] font-bold text-white">
                    {cartCount}
                  </span>
                )}
              </span>
              <span
                className={`text-[var(--font-small)] font-semibold ${
                  isActive ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}