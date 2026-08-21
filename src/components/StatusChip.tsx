/**
 * components/StatusChip.tsx — Chip de estado de stock (spec 3.8).
 *
 * Portado de pos-mobile. Estados: En stock (púrpura), Stock bajo (rosa),
 * Agotado (rojo). Siempre texto + color (Grey Test).
 */
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

const CONFIG: Record<StockStatus, {label: string; text: string; bg: string}> = {
  in_stock: {label: 'En stock', text: 'var(--color-success)', bg: 'var(--color-secondary-soft)'},
  low_stock: {label: 'Stock bajo', text: 'var(--color-warning)', bg: 'var(--color-warning-soft)'},
  out_of_stock: {label: 'Agotado', text: 'var(--color-danger)', bg: 'var(--color-danger-soft)'},
};

interface StatusChipProps {
  status: StockStatus;
  label?: string;
  testID?: string;
}

export default function StatusChip({status, label, testID}: StatusChipProps) {
  const cfg = CONFIG[status];
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-round)] px-2 py-1 text-[var(--font-micro)] font-bold"
      style={{backgroundColor: cfg.bg, color: cfg.text}}
      data-testid={testID}
    >
      {label ?? cfg.label}
    </span>
  );
}